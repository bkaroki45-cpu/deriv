"""Demo-only server-side digit strategy automation.

The worker owns Deriv connections; browsers only configure, start/stop, and read status.
"""
import asyncio
import json
import os
from collections import defaultdict, deque
from datetime import date
from decimal import Decimal

from asgiref.sync import sync_to_async
from django.utils import timezone

from accounts.models import OAuthToken
from core.deriv_api import unseal_token
from .models import AutomationRun, AutomationTrade


def last_digit(quote):
    text = str(quote)
    digits = [char for char in text if char.isdigit()]
    return int(digits[-1]) if digits else 0


def analyse(history, strategy, threshold):
    if not history:
        return None
    counts = [history.count(digit) for digit in range(10)]
    pct = [count * 100 / len(history) for count in counts]
    lower, upper = sum(pct[:5]), sum(pct[5:])
    triggers = (0, 1, 2) if strategy == "over_2" else (7, 8, 9)
    required_group = lower > upper if strategy == "over_2" else upper > lower
    if not required_group or not all(pct[digit] < float(threshold) for digit in triggers):
        return None
    imbalance = abs(lower - upper)
    rarity = sum(max(0, float(threshold) - pct[digit]) for digit in triggers)
    return {"digits": pct, "lower": lower, "upper": upper, "score": round(imbalance * 2 + rarity, 4), "triggers": triggers}


class AutomationWorker:
    def __init__(self):
        self.tasks = {}
        self.app_id = os.getenv("DERIV_WS_APP_ID", "1089")

    async def run_forever(self):
        while True:
            run_ids = await sync_to_async(list)(AutomationRun.objects.filter(status="running").values_list("id", flat=True))
            for run_id in run_ids:
                if run_id not in self.tasks or self.tasks[run_id].done():
                    self.tasks[run_id] = asyncio.create_task(self.run_session(run_id))
            for run_id, task in list(self.tasks.items()):
                if task.done():
                    self.tasks.pop(run_id, None)
            await asyncio.sleep(2)

    async def run_session(self, run_id):
        try:
            import websockets
            run = await sync_to_async(AutomationRun.objects.select_related("bot", "account", "user").get)(pk=run_id)
            if not run.bot.enabled or run.account.account_type != "demo":
                await self.fail(run_id, "This automation is available only on an enabled demo account.")
                return
            token = await self.token_for(run)
            if not token:
                await self.fail(run_id, "No valid Deriv token is linked to this demo account.")
                return
            histories = defaultdict(lambda: deque(maxlen=run.tick_window))
            url = f"wss://ws.derivws.com/websockets/v3?app_id={self.app_id}"
            async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                await ws.send(json.dumps({"authorize": token}))
                auth = json.loads(await ws.recv())
                if auth.get("error"): raise RuntimeError(auth["error"]["message"])
                for symbol in run.symbols:
                    await ws.send(json.dumps({"ticks": symbol, "subscribe": 1}))
                active_contract = ""
                last_save = 0
                while True:
                    state = await sync_to_async(AutomationRun.objects.get)(pk=run_id)
                    if state.status in {"stopping", "stopped"}:
                        if not active_contract:
                            await self.stop(run_id)
                            return
                    message = json.loads(await ws.recv())
                    if message.get("msg_type") == "tick":
                        tick = message.get("tick", {})
                        symbol = tick.get("symbol")
                        if symbol not in run.symbols: continue
                        histories[symbol].append(last_digit(tick.get("quote")))
                        candidates = {key: analyse(list(value), run.strategy, run.digit_threshold) for key, value in histories.items() if len(value) >= run.tick_window}
                        candidates = {key: value for key, value in candidates.items() if value}
                        selected = max(candidates, key=lambda key: candidates[key]["score"]) if candidates and not active_contract else ""
                        snapshot = {key: {"digits": [round(v, 2) for v in value["digits"]], "lower": round(value["lower"], 2), "upper": round(value["upper"], 2), "score": value["score"]} for key, value in candidates.items()}
                        if selected and symbol == selected and last_digit(tick.get("quote")) in candidates[selected]["triggers"]:
                            if await self.allowed(run_id, run):
                                active_contract = await self.buy(ws, run, selected, last_digit(tick.get("quote")))
                                await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(active_contract_id=active_contract, selected_symbol=selected, waiting_for="")
                                await ws.send(json.dumps({"proposal_open_contract": 1, "contract_id": active_contract, "subscribe": 1}))
                        if timezone.now().timestamp() - last_save > 1:
                            await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(selected_symbol=selected, waiting_for=",".join(map(str, candidates[selected]["triggers"])) if selected else "", stats=snapshot)
                            last_save = timezone.now().timestamp()
                    elif message.get("msg_type") == "proposal_open_contract":
                        contract = message.get("proposal_open_contract", {})
                        if active_contract and str(contract.get("contract_id")) == active_contract and (contract.get("is_sold") or contract.get("is_expired")):
                            profit = Decimal(str(contract.get("profit") or 0))
                            await sync_to_async(AutomationTrade.objects.filter(contract_id=active_contract).update)(status="won" if profit > 0 else "lost", profit=profit, settled_at=timezone.now(), raw=contract)
                            await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(active_contract_id="")
                            active_contract = ""
        except Exception as exc:
            await self.fail(run_id, str(exc)[:500])

    async def token_for(self, run):
        token = await sync_to_async(lambda: OAuthToken.objects.filter(user=run.user, active_account=run.account, is_valid=True).order_by("-updated_at").first())()
        return unseal_token(token.access_token) if token else ""

    async def allowed(self, run_id, run):
        today = timezone.localdate()
        trades = await sync_to_async(list)(AutomationTrade.objects.filter(run_id=run_id, opened_at__date=today).values("profit"))
        if run.max_trades_per_day and len(trades) >= run.max_trades_per_day: return False
        loss = -sum((Decimal(str(item["profit"])) for item in trades if Decimal(str(item["profit"])) < 0), Decimal("0"))
        return not run.max_daily_loss or loss < run.max_daily_loss

    async def buy(self, ws, run, symbol, digit):
        contract_type, barrier = ("DIGITOVER", "2") if run.strategy == "over_2" else ("DIGITUNDER", "7")
        await ws.send(json.dumps({"proposal": 1, "amount": float(run.stake), "basis": "stake", "contract_type": contract_type, "currency": run.account.currency, "duration": 1, "duration_unit": "t", "symbol": symbol, "barrier": barrier}))
        proposal = json.loads(await ws.recv())
        if proposal.get("error"): raise RuntimeError(proposal["error"]["message"])
        await ws.send(json.dumps({"buy": proposal["proposal"]["id"], "price": float(proposal["proposal"]["ask_price"])}))
        result = json.loads(await ws.recv())
        if result.get("error"): raise RuntimeError(result["error"]["message"])
        contract_id = str(result["buy"]["contract_id"])
        await sync_to_async(AutomationTrade.objects.create)(run=run, symbol=symbol, strategy=run.strategy, trigger_digit=digit, contract_id=contract_id, contract_type=contract_type, stake=run.stake, raw=result)
        return contract_id

    async def stop(self, run_id):
        await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(status="stopped", stopped_at=timezone.now(), waiting_for="")

    async def fail(self, run_id, message):
        await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(status="error", error_message=message)
