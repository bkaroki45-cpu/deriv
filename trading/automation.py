"""Demo-only, server-side Deriv digit automation.

The browser never receives the Deriv token.  This worker owns the socket and
uses a request router so an incoming tick can never be mistaken for a proposal
or buy response.
"""
import asyncio
import json
import os
from collections import defaultdict, deque
from decimal import Decimal

from asgiref.sync import sync_to_async
from django.utils import timezone

from accounts.models import OAuthToken
from core.deriv_api import DerivAPIClient, unseal_token
from .models import AutomationRun, AutomationTrade


def last_digit(quote, pip_size=None):
    """Match Deriv's displayed last digit, preserving trailing zeroes."""
    try:
        places = int(pip_size)
        if places >= 0:
            return int(format(Decimal(str(quote)), f".{places}f")[-1])
    except (TypeError, ValueError, ArithmeticError):
        pass
    digits = [char for char in str(quote) if char.isdigit()]
    return int(digits[-1]) if digits else 0


def analyse(history, strategy, threshold, thresholds=None):
    """Return a candidate only when every strategy condition is met."""
    if not history:
        return None
    counts = [history.count(digit) for digit in range(10)]
    pct = [count * 100 / len(history) for count in counts]
    lower, upper = sum(pct[:5]), sum(pct[5:])
    triggers = (0, 1, 2) if strategy == "over_2" else (7, 8, 9)
    group_ok = lower > upper if strategy == "over_2" else upper > lower
    configured = thresholds or {}
    limits = {digit: float(configured.get(str(digit), threshold)) for digit in triggers}
    if not group_ok or not all(pct[digit] < limits[digit] for digit in triggers):
        return None
    imbalance = abs(lower - upper)
    rarity = sum(max(0, limits[digit] - pct[digit]) for digit in triggers)
    return {
        "digits": pct, "lower": lower, "upper": upper,
        "score": round(imbalance * 2 + rarity, 4), "triggers": triggers,
        "thresholds": limits,
    }


def digit_snapshot(history, window):
    """Displayable rolling-window progress, including markets with no signal."""
    count = len(history)
    counts = [history.count(digit) for digit in range(10)] if count else [0] * 10
    digits = [round(item * 100 / count, 2) if count else 0 for item in counts]
    return {
        "ticks": count,
        "window": window,
        "digits": digits,
        "lower": round(sum(digits[:5]), 2),
        "upper": round(sum(digits[5:]), 2),
        "status": f"Collecting ticks: {count}/{window}" if count < window else "No favorable Over 2 or Under 7 signal yet",
    }


class DerivMessageRouter:
    """One websocket reader, with request responses and subscriptions separated."""
    def __init__(self, ws):
        self.ws = ws
        self.events = asyncio.Queue()
        self.pending = {}
        self.request_id = 0
        self.reader = None

    async def start(self):
        self.reader = asyncio.create_task(self._read())

    async def _read(self):
        try:
            async for raw in self.ws:
                message = json.loads(raw)
                request_id = message.get("req_id")
                future = self.pending.pop(request_id, None) if request_id is not None else None
                if future and not future.done():
                    future.set_result(message)
                else:
                    await self.events.put(message)
        except Exception as exc:
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(exc)
            await self.events.put({"msg_type": "connection_error", "error": {"message": str(exc)}})

    async def request(self, payload, timeout=20):
        self.request_id += 1
        request_id = self.request_id
        future = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        try:
            await self.ws.send(json.dumps({**payload, "req_id": request_id}))
            message = await asyncio.wait_for(future, timeout)
        finally:
            self.pending.pop(request_id, None)
        if message.get("error"):
            raise RuntimeError(message["error"].get("message", "Deriv request failed"))
        return message

    async def close(self):
        if self.reader:
            self.reader.cancel()
            try:
                await self.reader
            except asyncio.CancelledError:
                pass


class AutomationWorker:
    def __init__(self):
        self.tasks = {}
        self.app_id = os.getenv("DERIV_WS_APP_ID", "1089")

    async def run_forever(self):
        while True:
            ids = await sync_to_async(list)(AutomationRun.objects.filter(status__in=["running", "stopping"]).values_list("id", flat=True))
            for run_id in ids:
                if run_id not in self.tasks or self.tasks[run_id].done():
                    self.tasks[run_id] = asyncio.create_task(self.run_session(run_id))
            for run_id, task in list(self.tasks.items()):
                if task.done():
                    self.tasks.pop(run_id, None)
            await asyncio.sleep(2)

    async def current_run(self, run_id):
        return await sync_to_async(AutomationRun.objects.select_related("bot", "account", "user").get)(pk=run_id)

    async def run_session(self, run_id):
        """Reconnect safely; persisted running runs resume after worker restarts."""
        delay = 1
        histories = defaultdict(deque)
        while True:
            try:
                run = await self.current_run(run_id)
                if run.status == "stopped":
                    return
                if not run.bot.enabled:
                    await self.stop(run_id, "Disabled by administrator.")
                    return
                if run.account.account_type not in {"demo", "real"} or (run.account.account_type == "real" and (not run.bot.live_trading_enabled or not run.live_trading_confirmed_at)):
                    await self.fail(run_id, "This account is not authorised for this automation mode.")
                    return
                token, socket_url = await self.connection_for(run)
                if not token:
                    await self.fail(run_id, "No valid Deriv token is linked to this demo account.")
                    return
                for symbol in run.symbols:
                    histories[symbol] = deque(histories[symbol], maxlen=run.tick_window)
                await self._connected_session(run_id, run, token, histories, socket_url)
                return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                state = await self.current_run(run_id)
                if state.status in {"stopped", "stopping"} and not state.active_contract_id:
                    await self.stop(run_id)
                    return
                await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(error_message=f"Reconnecting: {str(exc)[:300]}")
                await asyncio.sleep(delay)
                delay = min(delay * 2, 15)

    async def _connected_session(self, run_id, run, token, histories, socket_url=""):
        import websockets
        url = socket_url or f"wss://ws.derivws.com/websockets/v3?app_id={self.app_id}"
        async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
            router = DerivMessageRouter(ws)
            await router.start()
            try:
                # OTP URLs are already authenticated for the selected Deriv
                # account. Legacy URLs still need the account token.
                if not socket_url:
                    await router.request({"authorize": token})
                await router.request({"balance": 1, "subscribe": 1})
                symbols = list(run.symbols)
                if "__all_volatility__" in symbols:
                    catalogue = await router.request({"active_symbols": "full"})
                    symbols = self.volatility_symbols(catalogue.get("active_symbols", []))
                # Subscribe individually so a temporarily unavailable market
                # cannot prevent all other Volatility and 1-second feeds.
                eligible = []
                for symbol in symbols:
                    try:
                        await router.request({"ticks": symbol, "subscribe": 1})
                        eligible.append(symbol)
                    except RuntimeError:
                        continue
                if not eligible:
                    raise RuntimeError("Deriv has no eligible Volatility markets available for this account.")
                symbols = eligible
                await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(symbols=symbols)
                active = run.active_contract_id
                if active:
                    await router.request({"proposal_open_contract": 1, "contract_id": active, "subscribe": 1})
                last_save = 0
                while True:
                    state = await self.current_run(run_id)
                    if not state.bot.enabled:
                        await self.stop(run_id, "Disabled by administrator.")
                        return
                    if state.status == "stopped":
                        return
                    if state.status == "stopping" and not active:
                        await self.stop(run_id)
                        return
                    try:
                        message = await asyncio.wait_for(router.events.get(), timeout=1)
                    except asyncio.TimeoutError:
                        # Re-check the persisted stop state even during a
                        # quiet or interrupted tick stream.
                        continue
                    if message.get("msg_type") == "connection_error":
                        raise RuntimeError(message.get("error", {}).get("message", "Connection interrupted"))
                    msg_type = message.get("msg_type")
                    if msg_type == "balance":
                        balance = message.get("balance", {})
                        value = balance.get("balance")
                        if value is not None:
                            await sync_to_async(type(run.account).objects.filter(pk=run.account_id).update)(balance=Decimal(str(value)))
                    elif msg_type == "proposal_open_contract":
                        contract = message.get("proposal_open_contract", {})
                        if active and str(contract.get("contract_id")) == str(active) and (contract.get("is_sold") or contract.get("is_expired")):
                            profit = Decimal(str(contract.get("profit") or 0))
                            await sync_to_async(AutomationTrade.objects.filter(contract_id=active).update)(status="won" if profit > 0 else "lost", profit=profit, settled_at=timezone.now(), raw=contract)
                            await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(active_contract_id="")
                            active = ""
                    elif msg_type == "tick":
                        tick = message.get("tick", {})
                        symbol = tick.get("symbol")
                        if symbol not in symbols:
                            continue
                        current_digit = last_digit(tick.get("quote"), tick.get("pip_size"))
                        histories[symbol].append(current_digit)
                        strategies = ("over_2", "under_7") if state.strategy == "auto" else (state.strategy,)
                        candidates = {}
                        snapshot = {market: digit_snapshot(list(history), state.tick_window) for market, history in histories.items()}
                        for market, history in histories.items():
                            if len(history) < state.tick_window:
                                continue
                            for candidate_strategy in strategies:
                                candidate = analyse(list(history), candidate_strategy, state.digit_threshold, state.digit_thresholds)
                                if candidate:
                                    candidates[(market, candidate_strategy)] = {**candidate, "strategy": candidate_strategy}
                        selected_key = max(candidates, key=lambda key: candidates[key]["score"]) if candidates and not active else None
                        selected = selected_key[0] if selected_key else ""
                        selected_candidate = candidates[selected_key] if selected_key else None
                        for (market, candidate_strategy), item in candidates.items():
                            snapshot[market].update({
                                "score": max(snapshot[market].get("score", 0), item["score"]),
                                "strategy": candidate_strategy,
                                "signals": [*snapshot[market].get("signals", []), candidate_strategy],
                                "status": f"Favorable {candidate_strategy.replace('_', ' ').title()} — waiting for {','.join(map(str, item['triggers']))}",
                                "thresholds": item["thresholds"],
                            })
                        if selected_candidate and symbol == selected and current_digit in selected_candidate["triggers"]:
                            fresh = await self.current_run(run_id)
                            if await self.allowed(run_id, fresh) and await self.entry_allowed(fresh):
                                active = await self.buy(router, fresh, selected, current_digit, selected_candidate["strategy"])
                                await router.request({"proposal_open_contract": 1, "contract_id": active, "subscribe": 1})
                                await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(active_contract_id=active, selected_symbol=selected, waiting_for="")
                        if timezone.now().timestamp() - last_save >= 1:
                            await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(selected_symbol=selected, waiting_for=(f"{selected_candidate['strategy']} · " + ",".join(map(str, selected_candidate["triggers"]))) if selected_candidate else "", stats={"markets": snapshot, "selected": selected, "selected_strategy": selected_candidate["strategy"] if selected_candidate else "", "selected_metrics": snapshot.get(selected, {}) if selected_candidate else {}, "progress": {"markets_ready": sum(1 for item in snapshot.values() if item["ticks"] >= state.tick_window), "markets_total": len(symbols), "tick_window": state.tick_window}, "updated_at": timezone.now().isoformat()})
                            last_save = timezone.now().timestamp()
            finally:
                await router.close()

    async def entry_allowed(self, run):
        return run.status == "running" and run.bot.enabled and run.account.account_type in {"demo", "real"} and (run.account.account_type == "demo" or (run.bot.live_trading_enabled and run.live_trading_confirmed_at)) and not run.active_contract_id and bool(await self.token_for(run))

    @staticmethod
    def volatility_symbols(items):
        """Use Deriv's live catalogue; include standard and 1-second Volatility indices only."""
        symbols = []
        for item in items:
            symbol = str(item.get("symbol") or item.get("underlying_symbol") or "")
            name = str(item.get("display_name") or item.get("underlying_symbol_name") or "").lower()
            is_volatility = "volatility" in name or symbol.startswith("R_") or symbol.startswith("1HZ")
            if symbol and is_volatility and not item.get("is_trading_suspended") and item.get("exchange_is_open", 1):
                symbols.append(symbol)
        return sorted(set(symbols))

    async def token_for(self, run):
        token = await sync_to_async(lambda: OAuthToken.objects.filter(user=run.user, active_account=run.account, is_valid=True).order_by("-updated_at").first())()
        if not token:
            token = await sync_to_async(lambda: OAuthToken.objects.filter(user=run.user, is_valid=True).order_by("-updated_at").first())()
        return unseal_token(token.access_token) if token else ""

    async def connection_for(self, run):
        """Target the selected account through Deriv's short-lived OTP URL."""
        token = await self.token_for(run)
        if not token:
            return "", ""
        try:
            payload = await sync_to_async(lambda: DerivAPIClient(token).otp(run.account.account_id))()
            data = payload.get("data", payload) if isinstance(payload, dict) else {}
            socket_url = data.get("url", "") if isinstance(data, dict) else ""
            return token, socket_url
        except Exception:
            # Retain compatibility for legacy OAuth accounts that still have
            # a token bound directly to this account.
            direct = await sync_to_async(lambda: OAuthToken.objects.filter(user=run.user, active_account=run.account, is_valid=True).exists())()
            return (token, "") if direct else ("", "")

    async def allowed(self, run_id, run):
        trades = await sync_to_async(list)(AutomationTrade.objects.filter(run_id=run_id, opened_at__date=timezone.localdate()).values("profit"))
        if run.max_trades_per_day and len(trades) >= run.max_trades_per_day:
            return False
        loss = -sum((Decimal(str(item["profit"])) for item in trades if Decimal(str(item["profit"])) < 0), Decimal("0"))
        return not run.max_daily_loss or loss < run.max_daily_loss

    async def buy(self, router, run, symbol, digit, strategy):
        contract_type, barrier = ("DIGITOVER", "2") if strategy == "over_2" else ("DIGITUNDER", "7")
        proposal = await router.request({"proposal": 1, "amount": float(run.stake), "basis": "stake", "contract_type": contract_type, "currency": run.account.currency, "duration": 1, "duration_unit": "t", "symbol": symbol, "barrier": barrier})
        quote = proposal["proposal"]
        result = await router.request({"buy": quote["id"], "price": float(quote["ask_price"])})
        contract_id = str(result["buy"]["contract_id"])
        await sync_to_async(AutomationTrade.objects.create)(run=run, symbol=symbol, strategy=strategy, trigger_digit=digit, contract_id=contract_id, contract_type=contract_type, stake=run.stake, raw=result)
        return contract_id

    async def stop(self, run_id, message=""):
        await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(status="stopped", stopped_at=timezone.now(), waiting_for="", error_message=message)

    async def fail(self, run_id, message):
        await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(status="error", error_message=message[:500])
