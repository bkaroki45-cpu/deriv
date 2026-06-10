import os
from urllib.parse import urlencode

from django.shortcuts import redirect, render
from django.urls import reverse


def _deriv_app_id():
    return os.getenv("DERIV_APP_ID", "1089")


def _absolute_redirect_uri(request):
    configured = os.getenv("DERIV_REDIRECT_URI")
    if configured:
        return configured
    return request.build_absolute_uri(reverse("deriv_oauth_callback"))


def _deriv_session(request):
    return {
        "token": request.session.get("deriv_token", ""),
        "account_id": request.session.get("deriv_account_id", ""),
        "currency": request.session.get("deriv_currency", "USD"),
        "account_type": request.session.get("deriv_account_type", "real"),
        "is_connected": bool(request.session.get("deriv_token")),
    }

def home(request):
    return render(request, "core/home.html")


def dashboard(request):
    wallet = getattr(request.user, "wallet", None) if request.user.is_authenticated else None
    deriv_session = _deriv_session(request)
    return render(request, "core/dashboard.html", {
        "wallet": wallet,
        "demo_balance": "10000.00",
        "real_balance": getattr(wallet, "balance", "0.00") if wallet else "0.00",
        "deriv_app_id": _deriv_app_id(),
        "deriv_session": deriv_session,
    })


def bot_builder(request):
    return render(request, "core/bot_builder.html")


def deriv_login(request):
    params = {
        "app_id": _deriv_app_id(),
        "l": "EN",
        "brand": "deriv",
        "redirect_uri": _absolute_redirect_uri(request),
    }
    return redirect(f"https://oauth.deriv.com/oauth2/authorize?{urlencode(params)}")


def deriv_register(request):
    params = {
        "app_id": _deriv_app_id(),
        "l": "EN",
        "brand": "deriv",
        "signup_device": "desktop",
        "redirect_uri": _absolute_redirect_uri(request),
    }
    return redirect(f"https://oauth.deriv.com/oauth2/authorize?{urlencode(params)}")


def deriv_oauth_callback(request):
    token = request.GET.get("token1") or request.GET.get("token")
    account_id = request.GET.get("acct1") or request.GET.get("account")
    currency = request.GET.get("cur1") or request.GET.get("currency") or "USD"
    if token:
        request.session["deriv_token"] = token
        request.session["deriv_account_id"] = account_id or ""
        request.session["deriv_currency"] = currency
        request.session["deriv_account_type"] = "demo" if (account_id or "").upper().startswith("VRTC") else "real"
    return redirect("trade")


def deriv_logout(request):
    for key in ("deriv_token", "deriv_account_id", "deriv_currency", "deriv_account_type"):
        request.session.pop(key, None)
    return redirect("trade")
