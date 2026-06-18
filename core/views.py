import os
import secrets
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.shortcuts import redirect, render
from django.urls import reverse

from .deriv_api import (
    authorize_url,
    capture_referral,
    clear_deriv_session,
    deriv_app_id,
    exchange_code,
    get_session,
    set_deriv_session,
    validate_and_store_token,
)


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
    return os.getenv("DERIV_OAUTH_PKCE", "0") == "1"


def _clear_deriv_session(request):
    clear_deriv_session(request)


def _oauth_authorize_url(request, *, signup=False):
    return authorize_url(request, _absolute_redirect_uri(request), signup=signup)


def _legacy_authorize_url(request, *, signup=False):
    params = {
        "app_id": _deriv_legacy_app_id(),
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

def home(request):
    capture_referral(request, request.user)
    if any(key in request.GET for key in ("code", "token1", "token", "error")):
        return deriv_oauth_callback(request)
    return render(request, "core/home.html")


def dashboard(request):
    wallet = getattr(request.user, "wallet", None) if request.user.is_authenticated else None
    deriv_session = _deriv_session(request)
    deriv_accounts = request.user.deriv_accounts.all() if request.user.is_authenticated else []
    return render(request, "core/dashboard.html", {
        "wallet": wallet,
        "demo_balance": "10000.00",
        "real_balance": getattr(wallet, "balance", "0.00") if wallet else "0.00",
        "deriv_app_id": _deriv_app_id(),
        "deriv_ws_app_id": _deriv_ws_app_id(),
        "deriv_session": deriv_session,
        "deriv_accounts": deriv_accounts,
        "profitera_markup_percent": settings.PROFITERA_MARKUP_PERCENT,
    })


def bot_builder(request):
    return render(request, "core/bot_builder.html")


def deriv_login_page(request):
    error = request.session.pop("deriv_oauth_error", "")
    return render(request, "core/deriv_auth.html", {
        "mode": "login",
        "deriv_app_id": _deriv_app_id(),
        "error": error,
    })


def deriv_register_page(request):
    capture_referral(request, request.user)
    error = request.session.pop("deriv_oauth_error", "")
    return render(request, "core/deriv_auth.html", {
        "mode": "register",
        "deriv_app_id": _deriv_app_id(),
        "error": error,
    })


def deriv_login(request):
    _clear_deriv_session(request)
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
            request.session["deriv_oauth_error"] = "Deriv login state mismatch. Please try again."
            return redirect("login")
        try:
            data = _exchange_oauth_code(request, code)
            if not request.user.is_authenticated:
                user_model = get_user_model()
                suffix = secrets.token_urlsafe(5).replace("-", "").replace("_", "")
                user = user_model.objects.create_user(
                    username=f"deriv_user_{suffix}",
                    email=f"deriv_user_{suffix}@profiteraa.local",
                )
                login(request, user)
            validate_and_store_token(request, request.user, data["access_token"], token_type="oauth", token_payload=data)
        except Exception as exc:
            request.session["deriv_oauth_error"] = str(exc)
            return redirect("login")
        return redirect("trade")

    token = request.GET.get("token1") or request.GET.get("token")
    account_id = request.GET.get("acct1") or request.GET.get("account")
    currency = request.GET.get("cur1") or request.GET.get("currency") or "USD"
    if token:
        if request.user.is_authenticated:
            try:
                request.session["deriv_account_id"] = account_id
                validate_and_store_token(request, request.user, token, token_type="oauth")
            except Exception:
                _store_deriv_session(request, token, account_id, currency)
        else:
            _store_deriv_session(request, token, account_id, currency)
    return redirect("trade")


def deriv_logout(request):
    _clear_deriv_session(request)
    return redirect("trade")
