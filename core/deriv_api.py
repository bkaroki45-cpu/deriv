import base64
import hashlib
import json
import secrets
from decimal import Decimal
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core import signing
from django.utils import timezone
from datetime import timedelta

from accounts.models import ActivityLog, DerivAccount, OAuthToken, Referral


SESSION_KEYS = ("deriv_token_id", "deriv_token", "deriv_account_id", "deriv_currency", "deriv_account_type")


def deriv_app_id():
    return settings.DERIV_APP_ID


def deriv_ws_app_id():
    return settings.DERIV_WS_APP_ID


def referral_defaults():
    return {
        "affiliate_token": settings.DERIV_AFFILIATE_TOKEN,
        "utm_source": settings.DERIV_UTM_SOURCE,
        "utm_campaign": settings.DERIV_UTM_CAMPAIGN,
        "utm_medium": settings.DERIV_UTM_MEDIUM or "affiliate",
    }


def pkce_pair():
    verifier = secrets.token_urlsafe(64)[:96]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def seal_token(token):
    return signing.dumps(token, salt="profitera.deriv.token")


def unseal_token(value):
    if not value:
        return ""
    try:
        return signing.loads(value, salt="profitera.deriv.token")
    except signing.BadSignature:
        return value


def clear_deriv_session(request):
    for key in SESSION_KEYS:
        request.session.pop(key, None)
    request.session.pop("deriv_oauth_state", None)
    request.session.pop("deriv_oauth_verifier", None)


def set_deriv_session(request, token, account_id="", currency="USD", account_type="real", token_id=None):
    request.session["deriv_token"] = token
    request.session["deriv_account_id"] = account_id or ""
    request.session["deriv_currency"] = currency or "USD"
    request.session["deriv_account_type"] = account_type or ("demo" if (account_id or "").upper().startswith("VRTC") else "real")
    if token_id:
        request.session["deriv_token_id"] = token_id


def get_session(request):
    return {
        "token": request.session.get("deriv_token", ""),
        "account_id": request.session.get("deriv_account_id", ""),
        "currency": request.session.get("deriv_currency", "USD"),
        "account_type": request.session.get("deriv_account_type", "real"),
        "is_connected": bool(request.session.get("deriv_token")),
    }


def capture_referral(request, user=None):
    data = referral_defaults()
    data.update({
        "affiliate_token": request.GET.get("t") or request.GET.get("affiliate_token") or data["affiliate_token"],
        "utm_source": request.GET.get("utm_source") or data["utm_source"],
        "utm_campaign": request.GET.get("utm_campaign") or data["utm_campaign"],
        "utm_medium": request.GET.get("utm_medium") or data["utm_medium"],
    })
    if not any(data.values()) and not request.GET:
        return None
    request.session["deriv_referral"] = data
    referral = Referral.objects.create(
        user=user if getattr(user, "is_authenticated", False) else None,
        landing_path=request.path,
        raw_query=dict(request.GET),
        **data,
    )
    return referral


def bind_referral_to_user(request, user):
    if not getattr(user, "is_authenticated", False):
        return
    data = request.session.get("deriv_referral") or referral_defaults()
    Referral.objects.filter(user__isnull=True, affiliate_token=data.get("affiliate_token", "")).update(user=user)


def authorize_url(request, redirect_uri, signup=False):
    verifier, challenge = pkce_pair()
    state = secrets.token_urlsafe(24)
    request.session["deriv_oauth_state"] = state
    request.session["deriv_oauth_verifier"] = verifier
    params = {
        "response_type": "code",
        "client_id": deriv_app_id(),
        "redirect_uri": redirect_uri,
        "scope": settings.DERIV_OAUTH_SCOPE,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if signup:
        params["prompt"] = "registration"
        ref = referral_defaults()
        params.update({
            "t": ref["affiliate_token"],
            "utm_source": ref["utm_source"],
            "utm_campaign": ref["utm_campaign"],
            "utm_medium": ref["utm_medium"],
        })
    return f"{settings.DERIV_AUTH_BASE_URL.rstrip('/')}/oauth2/auth?{urlencode({k: v for k, v in params.items() if v})}"


def exchange_code(request, code, redirect_uri):
    verifier = request.session.pop("deriv_oauth_verifier", "")
    if not verifier:
        raise RuntimeError("Missing PKCE verifier. Please start Deriv login again.")
    response = requests.post(
        f"{settings.DERIV_AUTH_BASE_URL.rstrip('/')}/oauth2/token",
        data={
            "grant_type": "authorization_code",
            "client_id": deriv_app_id(),
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
        },
        timeout=15,
    )
    if response.status_code >= 400:
        raise RuntimeError(response.text[:240] or "Deriv token exchange failed")
    return response.json()


class DerivAPIClient:
    def __init__(self, access_token):
        self.access_token = access_token
        self.base_url = settings.DERIV_OPTIONS_BASE_URL.rstrip("/")
        self.root_url = settings.DERIV_REST_BASE_URL.rstrip("/")

    @property
    def headers(self):
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Deriv-App-ID": deriv_app_id(),
            "Content-Type": "application/json",
        }

    def request(self, method, path, **kwargs):
        base = self.root_url if path.startswith("/applications/") else self.base_url
        url = f"{base}{path}" if path.startswith("/applications/") else f"{base}/{path.lstrip('/')}"
        response = requests.request(method, url, headers=self.headers, timeout=20, **kwargs)
        if response.status_code >= 400:
            raise RuntimeError(response.text[:300] or f"Deriv API returned {response.status_code}")
        if not response.content:
            return {}
        return response.json()

    def accounts(self):
        return self.request("GET", "/accounts")

    def create_account(self, account_type="demo", payload=None):
        payload = payload or {}
        payload.setdefault("account_type", account_type)
        return self.request("POST", "/accounts", json=payload)

    def reset_demo_balance(self, account_id):
        return self.request("POST", f"/accounts/{account_id}/reset-demo-balance")

    def otp(self, account_id):
        return self.request("POST", f"/accounts/{account_id}/otp")

    def markup_statistics(self):
        return self.request("GET", "/applications/v1/markup-statistics")


async def _deriv_ws_request(token, *payloads):
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError("Install the websockets package in the active Python environment") from exc

    url = f"wss://ws.derivws.com/websockets/v3?app_id={deriv_ws_app_id()}"
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"authorize": token}))
        auth = json.loads(await ws.recv())
        if auth.get("error"):
            raise RuntimeError(auth["error"]["message"])

        replies = [auth]
        for payload in payloads:
            await ws.send(json.dumps(payload))
            reply = json.loads(await ws.recv())
            if reply.get("error"):
                raise RuntimeError(reply["error"]["message"])
            replies.append(reply)
        return replies


def _ws_authorize(token):
    import asyncio

    auth, balance = asyncio.run(_deriv_ws_request(token, {"balance": 1}))
    return auth.get("authorize", {}), balance.get("balance", {})


def account_snapshot_from_token(token):
    """Return the account Deriv has authorised for this token.

    The WebSocket API is the authoritative source for the account behind an
    OAuth token.  In particular, an OAuth token can be valid for trading while
    the optional REST accounts endpoint is unavailable to the application.
    """
    return _ws_authorize(token)


def account_payload_from_snapshot(authorize, balance):
    account_id = str(authorize.get("loginid") or balance.get("loginid") or "")
    return {
        "account_id": account_id,
        "loginid": account_id,
        "account_type": "demo" if authorize.get("is_virtual") or account_id.upper().startswith("VRTC") else "real",
        "currency": balance.get("currency") or authorize.get("currency") or "USD",
        "balance": balance.get("balance") or 0,
        "raw_authorize": authorize,
        "raw_balance": balance,
    }


def _first_account(data):
    accounts = data.get("accounts") if isinstance(data, dict) else data
    if isinstance(accounts, dict):
        accounts = accounts.get("items") or accounts.get("data") or list(accounts.values())
    if isinstance(accounts, list) and accounts:
        return accounts[0]
    return {}


def sync_accounts(user, accounts_payload, active_account_id=""):
    accounts = accounts_payload.get("accounts") if isinstance(accounts_payload, dict) else accounts_payload
    if isinstance(accounts, dict):
        accounts = accounts.get("items") or accounts.get("data") or list(accounts.values())
    if not isinstance(accounts, list):
        accounts = []
    saved = []
    for item in accounts:
        account_id = str(item.get("account_id") or item.get("loginid") or item.get("id") or "")
        if not account_id:
            continue
        account_type = item.get("account_type") or ("demo" if account_id.upper().startswith("VRTC") else "real")
        balance = item.get("balance") or item.get("cash_balance") or 0
        account, _ = DerivAccount.objects.update_or_create(
            user=user,
            account_id=account_id,
            defaults={
                "account_type": account_type,
                "currency": item.get("currency") or "USD",
                "balance": Decimal(str(balance or 0)),
                "is_active": account_id == active_account_id,
                "raw": item,
            },
        )
        saved.append(account)
    if saved and not any(account.is_active for account in saved):
        saved[0].is_active = True
        saved[0].save(update_fields=["is_active"])
    return saved


def sync_legacy_oauth_tokens(request, user, credentials):
    saved = []
    first_token = ""
    first_token_id = None

    for credential in credentials:
        token = credential.get("token", "")
        if not token:
            continue

        account_id = credential.get("account_id", "")
        currency = credential.get("currency", "USD")
        account_type = "demo" if account_id.upper().startswith("VRTC") else "real"
        balance = Decimal("0")
        raw = {"source": "legacy_oauth_callback", "callback": credential}

        try:
            auth, balance_payload = _ws_authorize(token)
            account_id = str(auth.get("loginid") or account_id)
            currency = balance_payload.get("currency") or auth.get("currency") or currency
            account_type = "demo" if auth.get("is_virtual") or account_id.upper().startswith("VRTC") else "real"
            balance = Decimal(str(balance_payload.get("balance") or 0))
            raw.update({"authorize": auth, "balance": balance_payload})
        except Exception as exc:
            raw["sync_error"] = str(exc)

        if not account_id:
            continue

        account, _ = DerivAccount.objects.update_or_create(
            user=user,
            account_id=account_id,
            defaults={
                "account_type": account_type,
                "currency": currency or "USD",
                "balance": balance,
                "is_active": False,
                "raw": raw,
            },
        )
        oauth_token = OAuthToken.objects.create(
            user=user,
            token_type="oauth",
            access_token=seal_token(token),
            active_account=account,
            is_valid=True,
            last_validated_at=timezone.now(),
        )
        if not first_token:
            first_token = token
            first_token_id = oauth_token.id
        saved.append((account, token, oauth_token.id))

    if not saved:
        raise RuntimeError("Deriv did not return any usable account token.")

    active_account, active_token, active_token_id = next(
        ((account, token, token_id) for account, token, token_id in saved if account.account_type == "real"),
        saved[0],
    )
    DerivAccount.objects.filter(user=user).update(is_active=False)
    active_account.is_active = True
    active_account.save(update_fields=["is_active"])

    user.deriv_connected = True
    user.save(update_fields=["deriv_connected"])
    set_deriv_session(
        request,
        active_token or first_token,
        active_account.account_id,
        active_account.currency,
        active_account.account_type,
        active_token_id or first_token_id,
    )
    ActivityLog.objects.create(user=user, action="deriv_legacy_oauth_synced", metadata={"accounts": len(saved)})
    bind_referral_to_user(request, user)
    return [account for account, _, _ in saved]


def validate_and_store_token(request, user, token, token_type="oauth", token_payload=None):
    # OAuth2 tokens issued by auth.deriv.com are validated through the current
    # Options Accounts API. Do not send them to the legacy WebSocket
    # `authorize` endpoint: that endpoint can reject a valid OAuth2 token with
    # "Input validation failed: authorize" and turn a successful login into a
    # false failure.
    remote_accounts = DerivAPIClient(token).accounts()
    if isinstance(remote_accounts, dict):
        remote_list = remote_accounts.get("data") or remote_accounts.get("accounts") or []
    else:
        remote_list = remote_accounts
    if not isinstance(remote_list, list) or not remote_list:
        raise RuntimeError("Deriv did not return a trading account for this login.")

    accounts_payload = {"accounts": remote_list}
    account_id = str(
        request.session.get("deriv_account_id", "")
        or remote_list[0].get("account_id")
        or remote_list[0].get("loginid")
        or ""
    )

    accounts = sync_accounts(user, accounts_payload, account_id)
    active = next((account for account in accounts if account.account_id == account_id), accounts[0] if accounts else None)
    expires_at = None
    expires_in = (token_payload or {}).get("expires_in")
    if expires_in not in (None, ""):
        try:
            expires_at = timezone.now() + timedelta(seconds=int(expires_in))
        except (TypeError, ValueError):
            pass
    oauth_token = OAuthToken.objects.create(
        user=user,
        token_type=token_type,
        access_token=seal_token(token),
        refresh_token=seal_token((token_payload or {}).get("refresh_token", "")),
        expires_at=expires_at,
        scope=(token_payload or {}).get("scope", ""),
        active_account=active,
        is_valid=True,
        last_validated_at=timezone.now(),
    )
    user.deriv_connected = True
    user.save(update_fields=["deriv_connected"])
    if active:
        DerivAccount.objects.filter(user=user).exclude(pk=active.pk).update(is_active=False)
        active.is_active = True
        active.save(update_fields=["is_active"])
        set_deriv_session(request, token, active.account_id, active.currency, active.account_type, oauth_token.id)
    else:
        set_deriv_session(request, token, account_id, "USD", "real", oauth_token.id)
    ActivityLog.objects.create(user=user, action="deriv_token_validated", metadata={"token_type": token_type})
    bind_referral_to_user(request, user)
    return oauth_token, accounts_payload


def active_token_for_request(request):
    token_id = request.session.get("deriv_token_id")
    if token_id and request.user.is_authenticated:
        stored = OAuthToken.objects.filter(id=token_id, user=request.user, is_valid=True).first()
        if stored:
            if stored.expires_at and stored.expires_at <= timezone.now():
                stored.is_valid = False
                stored.save(update_fields=["is_valid", "updated_at"])
                clear_deriv_session(request)
                return ""
            return unseal_token(stored.access_token)

    # Older sessions may not have a persisted OAuthToken. Keep them working,
    # but never let them bypass expiry checks when a persisted token exists.
    token = request.session.get("deriv_token")
    if token:
        return token

    if request.user.is_authenticated:
        stored = request.user.deriv_tokens.filter(is_valid=True).order_by("-updated_at").first()
        if stored:
            if stored.expires_at and stored.expires_at <= timezone.now():
                stored.is_valid = False
                stored.save(update_fields=["is_valid", "updated_at"])
                clear_deriv_session(request)
                return ""
            return unseal_token(stored.access_token)
    return ""
