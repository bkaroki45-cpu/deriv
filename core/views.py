import os
import secrets
from datetime import timedelta
from decimal import Decimal
from urllib.parse import urlencode

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from accounts.models import OAuthToken

from .deriv_api import (
    authorize_url,
    capture_referral,
    clear_deriv_session,
    deriv_app_id,
    exchange_code,
    get_session,
    active_token_for_request,
    account_snapshot_from_token,
    account_payload_from_snapshot,
    DerivAPIClient,
    seal_token,
    set_deriv_session,
    sync_legacy_oauth_tokens,
    validate_and_store_token,
)


def _safe_post_login_path(request):
    """Keep OAuth returns on Profitera and only for app/dashboard routes."""
    candidate = (request.GET.get("next") or request.session.get("deriv_post_login_path") or "").strip()
    if candidate.startswith(("/trade/", "/dashboard/", "/automatic-trade/", "/bot-builder/")):
        return candidate
    return ""


def _deriv_app_id():
    return deriv_app_id()


def _deriv_legacy_app_id():
    return os.getenv("DERIV_LEGACY_APP_ID") or os.getenv("DERIV_WS_APP_ID") or settings.DERIV_WS_APP_ID


def _deriv_ws_app_id():
    """Numeric app ID used for Deriv WebSocket connections (not OAuth)."""
    return settings.DERIV_WS_APP_ID


def _env_params(mapping):
    return {key: os.getenv(env) for key, env in mapping.items() if os.getenv(env)}


def _deriv_oauth_scope():
    return settings.DERIV_OAUTH_SCOPE


def _use_pkce_oauth():
    if not str(_deriv_app_id()).isdigit():
        return True
    configured = os.getenv("DERIV_OAUTH_PKCE")
    if configured is not None:
        return configured.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _clear_deriv_session(request):
    clear_deriv_session(request)


def _oauth_authorize_url(request, *, signup=False):
    return authorize_url(request, _absolute_redirect_uri(request), signup=signup)


def _legacy_authorize_url(request, *, signup=False):
    app_id = os.getenv("DERIV_LEGACY_APP_ID") or (
        _deriv_app_id() if str(_deriv_app_id()).isdigit() else _deriv_ws_app_id()
    )
    params = {
        "app_id": app_id,
        "l": "EN",
        "brand": "deriv",
        "redirect_uri": _absolute_redirect_uri(request),
    }
    if signup:
        params["signup_device"] = "desktop"
        params.update(_env_params({
            "t": "DERIV_AFFILIATE_TOKEN",
            "utm_source": "DERIV_AFFILIATE_ID",
            "utm_campaign": "DERIV_UTM_CAMPAIGN",
            "utm_medium": "DERIV_UTM_MEDIUM",
        }))
    else:
        params["prompt"] = "login"
        params["max_age"] = "0"
        params["force_login"] = "1"
    return f"https://oauth.deriv.com/oauth2/authorize?{urlencode(params)}"


def _store_deriv_session(request, token, account_id="", currency="USD"):
    set_deriv_session(request, token, account_id, currency)
    # Sync with Django User model if authenticated
    if request.user.is_authenticated and not request.user.deriv_connected:
        request.user.deriv_connected = True
        request.user.save(update_fields=["deriv_connected"])


def _exchange_oauth_code(request, code):
    data = exchange_code(request, code, _absolute_redirect_uri(request))
    token = data.get("access_token")
    if not token:
        raise RuntimeError("Deriv token exchange did not return an access token")
    return data


def _oauth_expiry_seconds(payload):
    """Return a conservative OAuth expiry when Deriv omits/invalidates it."""
    try:
        return max(1, int((payload or {}).get("expires_in") or 3600))
    except (TypeError, ValueError):
        return 3600


def _ensure_deriv_user(request, account_id=""):
    if request.user.is_authenticated:
        return request.user
    user_model = get_user_model()
    account_part = "".join(ch for ch in str(account_id or "") if ch.isalnum()).lower()
    suffix = account_part or secrets.token_urlsafe(5).replace("-", "").replace("_", "")
    username = f"deriv_user_{suffix}"
    if user_model.objects.filter(username=username).exists():
        suffix = secrets.token_urlsafe(5).replace("-", "").replace("_", "")
        username = f"deriv_user_{suffix}"
    user = user_model.objects.create_user(
        username=username,
        email=f"{username}@profiteraa.local",
    )
    login(request, user)
    return user


def _absolute_redirect_uri(request):
    configured = os.getenv("DERIV_REDIRECT_URI")
    if configured:
        return configured

    public_origin = os.getenv("PROFITERA_PUBLIC_ORIGIN") or os.getenv("PUBLIC_BASE_URL")
    if public_origin:
        return f"{public_origin.rstrip('/')}{reverse('deriv_oauth_callback')}"

    forwarded_host = request.META.get("HTTP_X_FORWARDED_HOST")
    host_header = forwarded_host or request.get_host()
    host = host_header.split(":", 1)[0].lower()
    if host in {"profiteraa.com", "www.profiteraa.com"}:
        return "https://profiteraa.com/auth/deriv/callback/"

    forwarded_proto = request.META.get("HTTP_X_FORWARDED_PROTO", "").split(",", 1)[0]
    scheme = forwarded_proto or request.scheme
    return f"{scheme}://{host_header}{reverse('deriv_oauth_callback')}"


def _deriv_session(request):
    return get_session(request)


def _callback_credentials(query):
    credentials = []
    index = 1
    while True:
        token = query.get(f"token{index}")
        account_id = query.get(f"acct{index}")
        currency = query.get(f"cur{index}") or "USD"
        if not token and not account_id:
            break
        if token:
            credentials.append({
                "token": token,
                "account_id": account_id or "",
                "currency": currency.upper(),
            })
        index += 1

    fallback_token = query.get("token")
    if fallback_token and not credentials:
        credentials.append({
            "token": fallback_token,
            "account_id": query.get("account") or "",
            "currency": (query.get("currency") or "USD").upper(),
        })
    return credentials


def _active_deriv_account(request):
    if not request.user.is_authenticated:
        return None
    return request.user.deriv_accounts.filter(is_active=True).first()

def home(request):
    capture_referral(request, request.user)
    if any(key in request.GET for key in ("code", "token1", "token", "error")):
        return deriv_oauth_callback(request)
    # Signed-in visitors land on the account dashboard while `/` remains the
    # polished public entry page for visitors who have not connected Deriv.
    if request.user.is_authenticated:
        return dashboard(request)
    return render(request, "core/home.html", {
        "is_connected": request.user.is_authenticated,
        "account_email": request.user.email if request.user.is_authenticated else "",
    })


@login_required(login_url="login")
def dashboard(request):
    wallet = getattr(request.user, "wallet", None) if request.user.is_authenticated else None
    deriv_session = _deriv_session(request)
    deriv_accounts = request.user.deriv_accounts.all() if request.user.is_authenticated else []
    active_deriv_account = _active_deriv_account(request)
    return render(request, "core/dashboard_overview.html", {
        "wallet": wallet,
        "demo_balance": "10000.00",
        "real_balance": getattr(active_deriv_account, "balance", getattr(wallet, "balance", "0.00") if wallet else "0.00"),
        "deriv_app_id": _deriv_app_id(),
        "deriv_ws_app_id": _deriv_ws_app_id(),
        "deriv_session": deriv_session,
        "deriv_accounts": deriv_accounts,
        "profitera_markup_percent": settings.PROFITERA_MARKUP_PERCENT,
        "digits_url": settings.PROFITERA_DIGITS_URL,
        "rise_fall_url": settings.PROFITERA_RISE_FALL_URL,
        "accumulators_url": settings.PROFITERA_ACCUMULATORS_URL,
        "bot_url": settings.PROFITERA_BOT_URL,
    })


@login_required(login_url="login")
def dashboard_data(request):
    """Small same-origin dashboard feed sourced from the user's stored Deriv data."""
    from accounts.models import ActivityLog
    from trading.models import Portfolio, Transaction, TradingLog

    account = _active_deriv_account(request)
    session = _deriv_session(request)
    # Refresh from Deriv before returning the dashboard feed. This means a
    # completed trade is reflected in Profitera even when it was placed in a
    # separate contract workspace.
    token = active_token_for_request(request)
    if account and token:
        try:
            authorize, live_balance = account_snapshot_from_token(token)
            live = account_payload_from_snapshot(authorize, live_balance)
            if live.get("account_id") == account.account_id:
                account.balance = Decimal(str(live.get("balance") or 0))
                account.currency = live.get("currency") or account.currency
                account.raw = {**(account.raw or {}), "authorize": authorize, "balance": live_balance}
                account.save(update_fields=["balance", "currency", "raw", "updated_at"])
        except Exception:
            # The stored balance remains available if Deriv is temporarily
            # unreachable; the browser will retry on its next refresh.
            pass
    currency = getattr(account, "currency", "") or session.get("currency", "USD")
    balance = Decimal(str(getattr(account, "balance", getattr(getattr(request.user, "wallet", None), "balance", 0))))
    now = timezone.localtime()
    month_start = now - timedelta(days=30)
    transactions = list(Transaction.objects.filter(user=request.user, created_at__gte=month_start).order_by("created_at"))
    pnl = sum((item.amount for item in transactions), Decimal("0"))
    prior = balance - pnl
    percent = (pnl / abs(prior) * Decimal("100")) if prior else Decimal("0")
    # Reconstruct an account history from actual settlement transactions.  It stays
    # flat when no settlements have been recorded, rather than inventing market data.
    running = prior
    history = []
    for day in range(30):
        date = (now - timedelta(days=29 - day)).date()
        for item in transactions:
            if timezone.localtime(item.created_at).date() == date:
                running += item.amount
        history.append({"date": date.isoformat(), "value": float(running)})
    activities = []
    for item in list(TradingLog.objects.filter(user=request.user)[:5]) + list(ActivityLog.objects.filter(user=request.user)[:5]):
        created = getattr(item, "created_at", now)
        activities.append({"action": item.action.replace("_", " ").capitalize(), "time": timezone.localtime(created).strftime("%I:%M %p"), "created": created})
    activities.sort(key=lambda item: item["created"], reverse=True)
    open_positions = Portfolio.objects.filter(user=request.user, status__iexact="open").count()
    return JsonResponse({
        "connected": bool(account or session.get("is_connected")),
        "account_id": getattr(account, "account_id", "") or session.get("account_id", ""),
        "account_type": getattr(account, "account_type", "") or session.get("account_type", "real"),
        "currency": currency,
        "balance": f"{balance:.2f}",
        "pnl": f"{pnl:.2f}", "pnl_percent": f"{percent:.2f}",
        "history": history, "activities": activities[:5], "open_positions": open_positions,
        "server_time": now.strftime("%d %b %Y, %I:%M %p %Z"),
    })


@login_required
@require_POST
def reset_demo_balance(request):
    """Reset only the connected user's active Deriv demo account."""
    account = _active_deriv_account(request)
    token = active_token_for_request(request)
    if not account or account.account_type != "demo":
        messages.error(request, "Select a demo account before resetting its balance.")
        return redirect("dashboard")
    if not token:
        messages.error(request, "Connect your Deriv account again before resetting the demo balance.")
        return redirect("login")
    try:
        DerivAPIClient(token).reset_demo_balance(account.account_id)
        account.balance = Decimal("10000.00")
        account.save(update_fields=["balance", "updated_at"])
        messages.success(request, "Your Deriv demo balance was reset to 10,000 USD.")
    except Exception as exc:
        messages.error(request, f"Deriv could not reset the demo balance: {str(exc)[:180]}")
    return redirect("dashboard")


def bot_builder(request):
    # The current Deriv App Builder export owns its own OAuth and bot-runtime
    # session.  Once deployed, send all legacy Bot entry points to that app;
    # retain the local page as a safe fallback while no host is configured.
    if settings.PROFITERA_BOT_URL:
        return redirect(settings.PROFITERA_BOT_URL)

    deriv_session = _deriv_session(request)
    active_deriv_account = _active_deriv_account(request)
    return render(request, "core/bot_builder.html", {
        "deriv_session": deriv_session,
        "deriv_ws_app_id": _deriv_ws_app_id(),
        "real_balance": getattr(active_deriv_account, "balance", "0.00"),
    })


def trade_hub(request):
    """One entry point for the contract-specific Deriv App Builder interfaces."""
    return render(request, "core/trade_hub.html", {
        "digits_url": settings.PROFITERA_DIGITS_URL,
        "rise_fall_url": settings.PROFITERA_RISE_FALL_URL,
        "accumulators_url": settings.PROFITERA_ACCUMULATORS_URL,
    })


def deriv_login_page(request):
    error = request.session.pop("deriv_oauth_error", "")
    return render(request, "core/deriv_auth.html", {
        "mode": "login",
        "deriv_app_id": _deriv_app_id(),
        "error": error,
        "next": _safe_post_login_path(request),
    })


def deriv_register_page(request):
    capture_referral(request, request.user)
    error = request.session.pop("deriv_oauth_error", "")
    return render(request, "core/deriv_auth.html", {
        "mode": "register",
        "deriv_app_id": _deriv_app_id(),
        "error": error,
        "next": _safe_post_login_path(request),
    })


def deriv_login(request):
    post_login_path = _safe_post_login_path(request)
    # A deliberate Login with Deriv action starts a fresh Profiteraa identity
    # mapping. Otherwise Django would retain the previous local user even
    # after Deriv authorised a different account.
    if request.user.is_authenticated:
        logout(request)
    _clear_deriv_session(request)
    if post_login_path:
        request.session["deriv_post_login_path"] = post_login_path
    if _use_pkce_oauth():
        return redirect(_oauth_authorize_url(request))
    return redirect(_legacy_authorize_url(request))


def deriv_register(request):
    capture_referral(request, request.user)
    _clear_deriv_session(request)
    if _use_pkce_oauth():
        return redirect(_oauth_authorize_url(request, signup=True))
    return redirect(_legacy_authorize_url(request, signup=True))


def deriv_oauth_callback(request):
    if request.GET.get("error"):
        request.session["deriv_oauth_error"] = request.GET.get("error_description") or request.GET.get("error")
        return redirect("login")

    code = request.GET.get("code")
    if code:
        expected_state = request.session.pop("deriv_oauth_state", "")
        if not expected_state or request.GET.get("state") != expected_state:
            request.session.pop("deriv_oauth_verifier", None)
            request.session["deriv_oauth_error"] = "Your Deriv login request expired. Please start again and complete the login in the same tab."
            return redirect("login")
        try:
            data = _exchange_oauth_code(request, code)
            user = _ensure_deriv_user(request)
            try:
                validate_and_store_token(request, user, data["access_token"], token_type="oauth", token_payload=data)
            except Exception:
                # Authentication itself has succeeded. Keep the user signed in
                # even if the optional account-list synchronisation is briefly
                # unavailable, then let the dedicated Deriv apps refresh their
                # account details through the current Accounts API.
                oauth_token = OAuthToken.objects.create(
                    user=user,
                    token_type="oauth",
                    access_token=seal_token(data["access_token"]),
                    refresh_token=seal_token(data.get("refresh_token", "")),
                    expires_at=timezone.now() + timedelta(seconds=_oauth_expiry_seconds(data)),
                    scope=data.get("scope", ""),
                    is_valid=True,
                    last_validated_at=timezone.now(),
                )
                user.deriv_connected = True
                user.save(update_fields=["deriv_connected"])
                set_deriv_session(request, data["access_token"], token_id=oauth_token.id)
        except Exception as exc:
            request.session["deriv_oauth_error"] = str(exc)
            return redirect("login")
        return redirect(request.session.pop("deriv_post_login_path", "") or "dashboard")

    credentials = _callback_credentials(request.GET)
    if credentials:
        try:
            first = credentials[0]
            account_id = first.get("account_id", "")
            _ensure_deriv_user(request, account_id)
            sync_legacy_oauth_tokens(request, request.user, credentials)
        except Exception:
            first = credentials[0]
            _store_deriv_session(
                request,
                first.get("token", ""),
                first.get("account_id", ""),
                first.get("currency", "USD"),
            )
    return redirect(request.session.pop("deriv_post_login_path", "") or "trade")


def app_session(request):
    """Expose the active Deriv session to same-origin App Builder front ends.

    The access token is already required in the browser by Deriv's client-side
    SDK.  This endpoint never accepts a token from the browser and only returns
    the authenticated user's currently active server-held token.
    """
    next_path = _safe_post_login_path(request)
    token = active_token_for_request(request)
    if not request.user.is_authenticated or not token:
        login_url = reverse("login")
        if next_path:
            login_url = f"{login_url}?{urlencode({'next': next_path})}"
        return JsonResponse({"login_url": login_url}, status=401)

    stored = request.user.deriv_tokens.filter(is_valid=True).order_by("-updated_at").first()
    expires_at = int(stored.expires_at.timestamp()) if stored and stored.expires_at else int(timezone.now().timestamp()) + 900
    accounts = [
        {
            "account_id": account.account_id,
            "account_type": account.account_type,
            "currency": account.currency,
            "balance": str(account.balance),
            "group": (account.raw or {}).get("group", ""),
            "status": (account.raw or {}).get("status", ""),
        }
        for account in request.user.deriv_accounts.all()
    ]
    return JsonResponse({
        "auth_info": {
            "access_token": token,
            "token_type": "Bearer",
            "expires_in": max(0, expires_at - int(timezone.now().timestamp())),
            "expires_at": expires_at,
            "scope": stored.scope if stored else "trade account_manage",
            "refresh_token": "",
        },
        "accounts": accounts,
        "active_account_id": request.session.get("deriv_account_id", ""),
    })


def deriv_logout(request):
    if request.user.is_authenticated:
        # Deriv's OAuth documentation does not expose an RP-initiated browser
        # logout endpoint. Invalidate this application's stored grants so the
        # token cannot be reused by Profiteraa after a local sign-out.
        request.user.deriv_tokens.filter(is_valid=True).update(is_valid=False)
    _clear_deriv_session(request)
    # End both the Deriv-token session and Django's authenticated session so
    # the next Login with Deriv action can use a different Deriv account.
    logout(request)
    return redirect("home")
    if _safe_post_login_path(request):
        request.session["deriv_post_login_path"] = _safe_post_login_path(request)
