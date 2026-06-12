import os
import base64
import hashlib
import secrets
from urllib.parse import urlencode

import requests
from django.shortcuts import redirect, render
from django.urls import reverse


def _deriv_app_id():
    return os.getenv("DERIV_APP_ID", "1089")


def _deriv_ws_app_id():
    """Numeric app ID used for Deriv WebSocket connections (not OAuth)."""
    return os.getenv("DERIV_WS_APP_ID", "1089")


def _env_params(mapping):
    return {key: os.getenv(env) for key, env in mapping.items() if os.getenv(env)}


def _deriv_oauth_scope():
    return os.getenv("DERIV_OAUTH_SCOPE", "trade account_manage")


def _pkce_pair():
    verifier = secrets.token_urlsafe(64)[:96]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def _store_oauth_state(request):
    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(24)
    request.session["deriv_oauth_state"] = state
    request.session["deriv_oauth_verifier"] = verifier
    return state, challenge


DERIV_SESSION_KEYS = ("deriv_token", "deriv_account_id", "deriv_currency", "deriv_account_type")


def _clear_deriv_session(request):
    for key in DERIV_SESSION_KEYS:
        request.session.pop(key, None)


def _oauth_authorize_url(request, *, signup=False):
    state, challenge = _store_oauth_state(request)
    params = {
        "response_type": "code",
        "client_id": _deriv_app_id(),
        "redirect_uri": _absolute_redirect_uri(request),
        "scope": _deriv_oauth_scope(),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if signup:
        params["prompt"] = "registration"
        params.update(_env_params({
            "t": "DERIV_AFFILIATE_TOKEN",
            "utm_source": "DERIV_AFFILIATE_ID",
            "utm_campaign": "DERIV_UTM_CAMPAIGN",
            "utm_medium": "DERIV_UTM_MEDIUM",
        }))
    else:
        params["prompt"] = "login"
    return f"https://auth.deriv.com/oauth2/auth?{urlencode(params)}"


def _store_deriv_session(request, token, account_id="", currency="USD"):
    request.session["deriv_token"] = token
    request.session["deriv_account_id"] = account_id or ""
    request.session["deriv_currency"] = currency or "USD"
    request.session["deriv_account_type"] = "demo" if (account_id or "").upper().startswith("VRTC") else "real"
    # Sync with Django User model if authenticated
    if request.user.is_authenticated and not request.user.deriv_connected:
        request.user.deriv_connected = True
        request.user.save(update_fields=["deriv_connected"])


def _exchange_oauth_code(request, code):
    verifier = request.session.pop("deriv_oauth_verifier", "")
    if not verifier:
        raise RuntimeError("Missing OAuth verifier. Please start Deriv login again.")
    response = requests.post(
        "https://auth.deriv.com/oauth2/token",
        data={
            "grant_type": "authorization_code",
            "client_id": _deriv_app_id(),
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": _absolute_redirect_uri(request),
        },
        timeout=12,
    )
    if response.status_code >= 400:
        raise RuntimeError(response.text[:240] or "Deriv token exchange failed")
    data = response.json()
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
    return {
        "token": request.session.get("deriv_token", ""),
        "account_id": request.session.get("deriv_account_id", ""),
        "currency": request.session.get("deriv_currency", "USD"),
        "account_type": request.session.get("deriv_account_type", "real"),
        "is_connected": bool(request.session.get("deriv_token")),
    }

def home(request):
    if any(key in request.GET for key in ("code", "token1", "token", "error")):
        return deriv_oauth_callback(request)
    return render(request, "core/home.html")


def dashboard(request):
    wallet = getattr(request.user, "wallet", None) if request.user.is_authenticated else None
    deriv_session = _deriv_session(request)
    return render(request, "core/dashboard.html", {
        "wallet": wallet,
        "demo_balance": "10000.00",
        "real_balance": getattr(wallet, "balance", "0.00") if wallet else "0.00",
        "deriv_app_id": _deriv_app_id(),
        "deriv_ws_app_id": _deriv_ws_app_id(),
        "deriv_session": deriv_session,
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
    error = request.session.pop("deriv_oauth_error", "")
    return render(request, "core/deriv_auth.html", {
        "mode": "register",
        "deriv_app_id": _deriv_app_id(),
        "error": error,
    })


def deriv_login(request):
    _clear_deriv_session(request)
    if os.getenv("DERIV_OAUTH_LEGACY") == "1":
        params = {
            "app_id": _deriv_app_id(),
            "l": "EN",
            "brand": "deriv",
            "redirect_uri": _absolute_redirect_uri(request),
            "prompt": "login",
        }
        return redirect(f"https://oauth.deriv.com/oauth2/authorize?{urlencode(params)}")
    return redirect(_oauth_authorize_url(request))


def deriv_register(request):
    _clear_deriv_session(request)
    if os.getenv("DERIV_OAUTH_LEGACY") == "1":
        params = {
            "app_id": _deriv_app_id(),
            "l": "EN",
            "brand": "deriv",
            "signup_device": "desktop",
            "redirect_uri": _absolute_redirect_uri(request),
        }
        params.update(_env_params({
            "t": "DERIV_AFFILIATE_TOKEN",
            "utm_source": "DERIV_AFFILIATE_ID",
            "utm_campaign": "DERIV_UTM_CAMPAIGN",
            "utm_medium": "DERIV_UTM_MEDIUM",
        }))
        return redirect(f"https://oauth.deriv.com/oauth2/authorize?{urlencode(params)}")
    return redirect(_oauth_authorize_url(request, signup=True))


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
            _store_deriv_session(request, data["access_token"])
        except Exception as exc:
            request.session["deriv_oauth_error"] = str(exc)
            return redirect("login")
        return redirect("trade")

    token = request.GET.get("token1") or request.GET.get("token")
    account_id = request.GET.get("acct1") or request.GET.get("account")
    currency = request.GET.get("cur1") or request.GET.get("currency") or "USD"
    if token:
        _store_deriv_session(request, token, account_id, currency)
    return redirect("trade")


def deriv_logout(request):
    _clear_deriv_session(request)
    return redirect("trade")
