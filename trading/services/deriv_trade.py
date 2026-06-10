import json
import os


class DerivTradeEngine:
    def __init__(self, token=None):
        app_id = os.getenv("DERIV_APP_ID", "1089")
        self.token = token or os.getenv("DERIV_API_TOKEN")
        self.url = f"wss://ws.derivws.com/websockets/v3?app_id={app_id}"

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

            proposal_payload = {
                "proposal": 1,
                "amount": float(stake),
                "basis": "stake",
                "contract_type": contract_type,
                "currency": currency,
                "duration": int(duration),
                "duration_unit": duration_unit,
                "symbol": symbol,
            }
            if barrier not in (None, ""):
                proposal_payload["barrier"] = str(barrier)
            if growth_rate not in (None, ""):
                proposal_payload["growth_rate"] = float(growth_rate)
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
