import json
import os
from decimal import Decimal, InvalidOperation


SUPPORTED_CONTRACT_TYPES = {
    "ACCU", "CALL", "DIGITDIFF", "DIGITEVEN", "DIGITMATCH", "DIGITODD",
    "DIGITOVER", "DIGITUNDER", "HIGHER", "LOWER", "MULTDOWN", "MULTUP",
    "NOTOUCH", "ONETOUCH", "PUT", "TURBOSLONG", "TURBOSSHORT",
    "VANILLALONGCALL", "VANILLALONGPUT",
}
LIMIT_ORDER_CONTRACT_TYPES = {"ACCU", "MULTDOWN", "MULTUP"}
MULTIPLIER_CONTRACT_TYPES = {"MULTDOWN", "MULTUP"}


def _positive_decimal(value, label):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be a number.") from exc
    if result <= 0:
        raise ValueError(f"{label} must be greater than zero.")
    return result


def build_proposal_payload(*, symbol, contract_type, stake, duration, duration_unit, currency, barrier=None,
                           growth_rate=None, multiplier=None, take_profit=None, stop_loss=None):
    """Build only a Deriv-supported proposal; Deriv remains the rule engine."""
    contract_type = str(contract_type or "").upper()
    if contract_type not in SUPPORTED_CONTRACT_TYPES:
        raise ValueError("This contract type is not available for execution.")
    if not symbol or not str(symbol).replace("_", "").isalnum():
        raise ValueError("Select a valid Deriv market.")
    if duration_unit not in {"s", "m", "h", "d", "t"}:
        raise ValueError("Select a valid Deriv duration unit.")
    try:
        duration = int(duration)
    except (TypeError, ValueError) as exc:
        raise ValueError("Duration must be a whole number.") from exc
    if duration <= 0:
        raise ValueError("Duration must be greater than zero.")

    payload = {
        "proposal": 1,
        "amount": float(_positive_decimal(stake, "Stake")),
        "basis": "stake",
        "contract_type": contract_type,
        "currency": str(currency or "USD").upper(),
        "duration": duration,
        "duration_unit": duration_unit,
        "symbol": str(symbol),
    }
    if barrier not in (None, ""):
        payload["barrier"] = str(barrier)
    if growth_rate not in (None, ""):
        payload["growth_rate"] = float(_positive_decimal(growth_rate, "Growth rate"))
    if multiplier not in (None, ""):
        if contract_type not in MULTIPLIER_CONTRACT_TYPES:
            raise ValueError("Multiplier is only available for multiplier contracts.")
        payload["multiplier"] = float(_positive_decimal(multiplier, "Multiplier"))

    limits = {}
    if take_profit not in (None, ""):
        limits["take_profit"] = float(_positive_decimal(take_profit, "Take profit"))
    if stop_loss not in (None, ""):
        limits["stop_loss"] = float(_positive_decimal(stop_loss, "Stop loss"))
    if limits:
        if contract_type not in LIMIT_ORDER_CONTRACT_TYPES:
            raise ValueError("Take profit and stop loss are not supported for this contract type.")
        payload["limit_order"] = limits
    return payload


class DerivTradeEngine:
    def __init__(self, token=None):
        app_id = os.getenv("DERIV_WS_APP_ID", "1089")
        self.token = token or os.getenv("DERIV_API_TOKEN")
        self.url = f"wss://ws.derivws.com/websockets/v3?app_id={app_id}"

    async def send_once(self, payload, authorize=False):
        try:
            import websockets
        except ImportError as exc:
            raise RuntimeError("Install the websockets package in the active Python environment") from exc

        async with websockets.connect(self.url) as ws:
            if authorize:
                if not self.token:
                    raise RuntimeError("A Deriv token is required for this request")
                await ws.send(json.dumps({"authorize": self.token}))
                auth = json.loads(await ws.recv())
                if auth.get("error"):
                    raise RuntimeError(auth["error"]["message"])
            await ws.send(json.dumps(payload))
            result = json.loads(await ws.recv())
            if result.get("error"):
                raise RuntimeError(result["error"]["message"])
            return result

    async def buy_contract(
        self,
        symbol,
        contract_type,
        stake,
        duration=5,
        duration_unit="t",
        currency="USD",
        barrier=None,
        growth_rate=None,
        multiplier=None,
        take_profit=None,
        stop_loss=None,
    ):
        try:
            import websockets
        except ImportError as exc:
            raise RuntimeError("Install the websockets package in the active Python environment") from exc

        if not self.token:
            raise RuntimeError("DERIV_API_TOKEN is not configured")

        async with websockets.connect(self.url) as ws:
            await ws.send(json.dumps({"authorize": self.token}))
            auth = json.loads(await ws.recv())
            if auth.get("error"):
                raise RuntimeError(auth["error"]["message"])

            proposal_payload = build_proposal_payload(
                symbol=symbol, contract_type=contract_type, stake=stake,
                duration=duration, duration_unit=duration_unit, currency=currency,
                barrier=barrier, growth_rate=growth_rate, multiplier=multiplier,
                take_profit=take_profit, stop_loss=stop_loss,
            )
            await ws.send(json.dumps(proposal_payload))
            proposal = json.loads(await ws.recv())
            if proposal.get("error"):
                raise RuntimeError(proposal["error"]["message"])

            proposal_id = proposal.get("proposal", {}).get("id")
            ask_price = proposal.get("proposal", {}).get("ask_price", stake)
            if not proposal_id:
                raise RuntimeError("Deriv proposal did not include an id")

            await ws.send(json.dumps({"buy": proposal_id, "price": float(ask_price)}))
            result = json.loads(await ws.recv())
            if result.get("error"):
                raise RuntimeError(result["error"]["message"])
            return result
