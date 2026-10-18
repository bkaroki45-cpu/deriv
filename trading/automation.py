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
    screen_digits = (0, 1, 2) if strategy == "over_2" else (7, 8, 9)
    triggers = (0, 1) if strategy == "over_2" else (7, 8, 9)
    group_ok = upper > lower
    configured = thresholds or {}
    limits = {
        digit: min(float(configured.get(str(digit), threshold)), 10.0) if strategy == "over_2"
        else float(configured.get(str(digit), threshold))
        for digit in screen_digits
    }
    dominant_digit = max(range(10), key=lambda digit: (counts[digit], digit))
    trend_ok = True
    if strategy == "over_2":
        midpoint = len(history) // 2
        older, recent = history[:midpoint], history[midpoint:]
        if not older or not recent:
            trend_ok = False
        else:
            older_pct = [older.count(digit) * 100 / len(older) for digit in range(10)]
            recent_pct = [recent.count(digit) * 100 / len(recent) for digit in range(10)]
            trend_ok = all(recent_pct[digit] <= older_pct[digit] for digit in (0, 1, 2))
    if (not group_ok
            or not all(pct[digit] < limits[digit] for digit in screen_digits)
            or (strategy == "over_2" and (not trend_ok or dominant_digit < 5))):
        return None
    imbalance = abs(lower - upper)
    rarity = sum(max(0, limits[digit] - pct[digit]) for digit in screen_digits)
    return {
        "digits": pct, "lower": lower, "upper": upper,
        "score": round(imbalance * 2 + rarity, 4), "triggers": triggers,
        "thresholds": limits, "dominant_digit": dominant_digit,
        "low_digits_trend_ok": trend_ok,
    }


def analyse_differ(history, previous_digits):
    """Fallback DIGITDIFF setup using the requested distribution rules."""
    if not history or not previous_digits:
        return None
    counts = [history.count(digit) for digit in range(10)]
    pct = [count * 100 / len(history) for count in counts]
    ranked = sorted(range(10), key=lambda digit: (pct[digit], digit))
    least, second_least = ranked[:2]
    highest = max(range(10), key=lambda digit: pct[digit])
    if (pct[least] > previous_digits[least]
            or pct[second_least] - pct[least] < 0.5
            or abs(highest - least) < 3):
        return None
    return {"digits": pct, "lower": sum(pct[:5]), "upper": sum(pct[5:]),
            "score": round((pct[highest] - pct[least]) + 2 * (pct[second_least] - pct[least]) + abs(highest - least), 4),
            "triggers": (), "thresholds": {}, "barrier": least, "immediate": True}


def differ_fallback_allowed(strategy):
    """Only the automatic scanner may use DIGITDIFF as its fallback."""
    return strategy == "auto"


def analyse_even_odd(history, minimum_share=51.0):
    """Trade the leading parity only when it reaches the required share."""
    if not history or any(not isinstance(digit, int) or digit < 0 or digit > 9 for digit in history):
        return None
    even_count = sum(digit % 2 == 0 for digit in history)
    odd_count = len(history) - even_count
    even_percent = even_count * 100 / len(history)
    odd_percent = odd_count * 100 / len(history)
    dominant_share = max(even_percent, odd_percent)
    dominant_parity = "even" if even_percent > odd_percent else "odd"
    difference = abs(even_percent - odd_percent)
    return {
        "strategy": "even_odd",
        "contract_type": "DIGITEVEN" if dominant_parity == "even" else "DIGITODD",
        "direction": dominant_parity,
        "dominant_parity": dominant_parity,
        "even_percent": round(even_percent, 2),
        "odd_percent": round(odd_percent, 2),
        "dominant_share": round(dominant_share, 2),
        "parity_difference": round(difference, 2),
        "score": round(difference, 4),
        "eligible": dominant_share >= float(minimum_share),
        "trigger_digit": history[-1],
    }


def analyse_high_digit_pair(history, threshold=10.0):
    """Screen a market and report a trigger after two qualifying high digits."""
    if len(history) < 2:
        return None
    counts = [history.count(digit) for digit in range(10)]
    digits = [count * 100 / len(history) for count in counts]
    dominant_digit = max(range(5, 10), key=lambda digit: (counts[digit], digit))
    eligible = (
        all(digits[digit] < threshold for digit in (0, 1, 2))
        and counts[dominant_digit] == max(counts)
    )
    pair = history[-2:]
    pair_ready = all(digit in (7, 8, 9) for digit in pair)
    return {
        "digits": digits,
        "lower": sum(digits[:5]),
        "upper": sum(digits[5:]),
        "score": round(digits[dominant_digit] - sum(digits[:3]), 4),
        "dominant_digit": dominant_digit,
        "eligible": eligible,
        "pair": pair,
        "pair_ready": pair_ready,
        "triggers": (7, 8, 9),
        "thresholds": {digit: threshold for digit in (0, 1, 2)},
    }


def recovery_stake(base_stake, multiplier, consecutive_losses):
    """Calculate the next bounded-sequence stake from its loss streak."""
    return Decimal(str(base_stake)) * Decimal(str(multiplier)) ** int(consecutive_losses)


def capital_allows(capital_limit, stakes, next_stake):
    """Keep cumulative stake allocation within the user's run capital limit."""
    if capital_limit is None:
        return True
    spent = sum((Decimal(str(stake)) for stake in stakes), Decimal("0"))
    return spent + Decimal(str(next_stake)) <= Decimal(str(capital_limit))


def recovery_action(profit, loss_streak, max_retries):
    """Choose whether a settled Even/Odd run ends or immediately recovers."""
    if Decimal(str(profit)) > 0:
        return "complete_win"
    if max_retries is not None and int(loss_streak) > int(max_retries):
        return "complete_limit"
    return "retry"


def proposal_payload(amount, currency, symbol, contract_type, barrier=None):
    """Build a one-tick proposal, omitting barriers for parity contracts."""
    payload = {
        "proposal": 1,
        "amount": float(amount),
        "basis": "stake",
        "contract_type": contract_type,
        "currency": currency,
        "duration": 1,
        "duration_unit": "t",
        "underlying_symbol": symbol,
    }
    if barrier is not None:
        payload["barrier"] = barrier
    return payload


def proposal_open_contract_payload(contract_id):
    """Build Deriv's open-contract request with its required integer ID."""
    try:
        numeric_id = int(str(contract_id))
    except (TypeError, ValueError) as exc:
        raise ValueError("Deriv contract ID must be an integer.") from exc
    if numeric_id <= 0:
        raise ValueError("Deriv contract ID must be greater than zero.")
    return {"proposal_open_contract": 1, "contract_id": numeric_id, "subscribe": 1}


async def subscribe_open_contract(router, contract_id):
    """Subscribe and queue the initial snapshot so an already-settled trade is handled."""
    response = await router.request(proposal_open_contract_payload(contract_id))
    if response.get("proposal_open_contract"):
        await router.events.put(response)
    return response


def deriv_request_context(payload):
    """Describe a failed request without exposing authorization tokens."""
    request_type = next((key for key in payload if key != "req_id"), "unknown")
    details = [f"request={request_type}"]
    if "buy" in payload:
        details.append(f"proposal_id={payload['buy']}")
    for key in ("contract_type", "symbol", "underlying_symbol", "contract_id", "barrier"):
        if key in payload:
            details.append(f"{key}={payload[key]}")
    return ", ".join(details)


def buy_payload(proposal_id, ask_price):
    """Build the buy request using the quote's id and string price."""
    return {"buy": proposal_id, "price": str(ask_price)}


async def buy_with_fresh_proposal(router, proposal_request, before_buy=None):
    """Renew an invalid proposal once before surfacing the Deriv error."""
    for attempt in range(2):
        response = await router.request(proposal_request)
        quote = response.get("proposal", {})
        proposal_id = quote.get("id")
        ask_price = quote.get("ask_price")
        if not proposal_id or ask_price is None:
            raise RuntimeError("Deriv proposal response is missing its id or ask price.")
        if before_buy and not await before_buy():
            return None
        try:
            return await router.request(buy_payload(proposal_id, ask_price))
        except RuntimeError as exc:
            if attempt or "Unknown contract proposal" not in str(exc):
                raise
    raise RuntimeError("Deriv rejected the refreshed contract proposal.")


def digit_snapshot(history, window):
    """Displayable rolling-window progress, including markets with no signal."""
    count = len(history)
    counts = [history.count(digit) for digit in range(10)] if count else [0] * 10
    digits = [round(item * 100 / count, 2) if count else 0 for item in counts]
    return {
        "ticks": count,
        "window": window,
        "digits": digits,
        "recent_digits": list(history)[-20:],
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
            error = message["error"].get("message", "Deriv request failed")
            raise RuntimeError(f"{error} ({deriv_request_context(payload)})")
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
            # Pick up newly started runs quickly without a long idle scan gap.
            await asyncio.sleep(0.5)

    async def current_run(self, run_id):
        return await sync_to_async(AutomationRun.objects.select_related("bot", "account", "user").get)(pk=run_id)

    async def run_session(self, run_id):
        """Reconnect safely; persisted running runs resume after worker restarts."""
        delay = 1
        histories = defaultdict(deque)
        previous_distributions = {}
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
                await self._connected_session(run_id, run, token, histories, socket_url, previous_distributions)
                return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                state = await self.current_run(run_id)
                if state.status in {"stopped", "stopping"} and not state.active_contract_id:
                    await self.stop(run_id)
                    return
                message = str(exc).strip() or exc.__class__.__name__
                await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(error_message=f"Reconnecting: {message[:300]}")
                await asyncio.sleep(delay)
                delay = min(delay * 2, 15)

    async def _connected_session(self, run_id, run, token, histories, socket_url="", previous_distributions=None):
        import websockets
        url = socket_url or f"wss://ws.derivws.com/websockets/v3?app_id={self.app_id}"
        async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
            router = DerivMessageRouter(ws)
            await router.start()
            try:
                await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(error_message="")
                # OTP URLs are already authenticated for the selected Deriv
                # account. Legacy URLs still need the account token.
                if not socket_url:
                    await router.request({"authorize": token})
                await router.request({"balance": 1, "subscribe": 1})
                # Seed each card from Deriv's own recent tick history, then
                # keep it current with the matching live tick subscription.
                catalogue = await router.request({"active_symbols": "full"})
                catalogue_items = catalogue.get("active_symbols", [])
                market_names = self.market_names(catalogue_items)
                pip_sizes = self.market_pip_sizes(catalogue_items)
                symbols = list(run.symbols)
                if "__all_volatility__" in symbols or run.strategy == "even_odd":
                    symbols = self.volatility_symbols(catalogue_items)
                # Subscribe individually so a temporarily unavailable market
                # cannot prevent all other Volatility and 1-second feeds.
                seed_limit = asyncio.Semaphore(8)

                async def seed_market(symbol):
                    async with seed_limit:
                        try:
                            history = await router.request({"ticks_history": symbol, "adjust_start_time": 1, "count": run.tick_window, "end": "latest", "style": "ticks"})
                            prices = history.get("history", {}).get("prices", [])
                            precision = history.get("pip_size", pip_sizes.get(symbol))
                            histories[symbol] = deque((last_digit(price, precision) for price in prices), maxlen=run.tick_window)
                            await router.request({"ticks": symbol, "subscribe": 1})
                            return symbol
                        except (RuntimeError, asyncio.TimeoutError):
                            return None

                seeded = await asyncio.gather(*(seed_market(symbol) for symbol in symbols))
                eligible = [symbol for symbol in seeded if symbol]
                if not eligible:
                    raise RuntimeError("Deriv has no eligible Volatility markets available for this account.")
                symbols = eligible
                await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(symbols=symbols)
                open_contract_ids = await self.open_contract_ids(run_id)
                active_contracts = set(open_contract_ids)
                active = run.active_contract_id if run.active_contract_id in active_contracts else (open_contract_ids[-1] if open_contract_ids else "")
                recovery_only = len(active_contracts) > 1
                if active_contracts:
                    waiting_for = f"Recovering {len(active_contracts)} open contracts" if recovery_only else run.waiting_for
                    await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(active_contract_id=active, waiting_for=waiting_for)
                elif run.active_contract_id:
                    await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(active_contract_id="")
                differ_batch_symbol = ""
                differ_batch_count = 0
                high_pair_eligible = set()
                high_pair_streaks = defaultdict(int)
                high_pair_fired = set()
                even_odd_armed_symbol = ""
                even_odd_armed_direction = ""
                even_odd_trigger_streak = 0
                even_odd_trigger_fired = False
                # Each manual start arms one normal trade. Losses enter an
                # automatic recovery sequence; a win returns control to the user.
                even_odd_manual_armed = run.strategy == "even_odd"
                even_odd_recovery_pending = run.strategy == "even_odd" and await self.loss_streak(run) > 0
                for contract_id in sorted(active_contracts):
                    await subscribe_open_contract(router, contract_id)
                loop = asyncio.get_running_loop()
                last_save = 0.0
                next_state_check = 0.0
                while True:
                    if loop.time() >= next_state_check:
                        state = await self.current_run(run_id)
                        next_state_check = loop.time() + 0.25
                        if not state.bot.enabled:
                            await self.stop(run_id, "Disabled by administrator.")
                            return
                        if state.status == "stopped":
                            return
                        if state.status == "stopping" and not active_contracts:
                            await self.stop(run_id)
                            return
                    try:
                        message = await asyncio.wait_for(router.events.get(), timeout=0.25)
                    except asyncio.TimeoutError:
                        # The next loop checks stop and disable state promptly.
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
                        settled_contract_id = str(contract.get("contract_id") or "")
                        if settled_contract_id in active_contracts and (contract.get("is_sold") or contract.get("is_expired")):
                            profit = Decimal(str(contract.get("profit") or 0))
                            settled_trade = await sync_to_async(AutomationTrade.objects.get)(contract_id=settled_contract_id)
                            exit_quote = contract.get("exit_tick_display_value")
                            if exit_quote is None:
                                exit_quote = contract.get("exit_tick")
                            result_digit = last_digit(exit_quote, pip_sizes.get(settled_trade.symbol)) if exit_quote is not None else None
                            await sync_to_async(AutomationTrade.objects.filter(contract_id=settled_contract_id).update)(status="won" if profit > 0 else "lost", profit=profit, result_digit=result_digit, settled_at=timezone.now(), raw=contract)
                            active_contracts.discard(settled_contract_id)
                            active = run.active_contract_id if run.active_contract_id in active_contracts else (sorted(active_contracts)[-1] if active_contracts else "")
                            await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(active_contract_id=active)
                            if active_contracts:
                                continue
                            active = ""
                            if recovery_only:
                                await self.complete_sequence(run_id, "Existing open contracts settled. Restart the bot to continue.")
                                return
                            if run.strategy in {"even_odd", "high_pair"}:
                                previous_trade = settled_trade
                                if previous_trade.strategy != run.strategy:
                                    await self.complete_sequence(run_id, "Existing trade used a different strategy. Restart the bot to continue.")
                                    return
                                loss_streak = await self.loss_streak(run)
                                action = recovery_action(
                                    profit,
                                    loss_streak,
                                    None if run.strategy == "even_odd" else run.max_martingale_steps,
                                )
                                if action == "complete_win" and run.strategy == "high_pair":
                                    high_pair_fired.discard(previous_trade.symbol)
                                    high_pair_streaks[previous_trade.symbol] = 0
                                    continue
                                if action == "complete_win" and run.strategy == "even_odd":
                                    await self.complete_sequence(run_id, "Trade won. Press Start for the next trade.")
                                    return
                                if action != "retry":
                                    message = "Won. Recovery sequence complete." if action == "complete_win" else "Recovery limit reached."
                                    await self.complete_sequence(run_id, message)
                                    return
                                fresh = await self.current_run(run_id)
                                if not await self.allowed(run_id, fresh):
                                    await self.complete_sequence(run_id, "Daily risk limit reached.")
                                    return
                                if not await self.entry_allowed(run_id, fresh):
                                    await self.complete_sequence(run_id, "Trading authorization is no longer available.")
                                    return
                                if run.strategy == "even_odd":
                                    even_odd_recovery_pending = True
                                    even_odd_armed_symbol = ""
                                    even_odd_armed_direction = ""
                                    even_odd_trigger_streak = 0
                                    even_odd_trigger_fired = False
                                    await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(
                                        selected_symbol="",
                                        waiting_for="Recovery: scanning all Volatility markets",
                                    )
                                    continue
                                active = await self.buy(
                                    router,
                                    fresh,
                                    previous_trade.symbol,
                                    previous_trade.trigger_digit,
                                    run.strategy,
                                    previous_trade.contract_type if run.strategy == "even_odd" else None,
                                )
                                if not active:
                                    return
                                active = str(active)
                                await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(
                                    active_contract_id=active,
                                    selected_symbol=previous_trade.symbol,
                                    waiting_for="",
                                )
                                active_contracts.add(active)
                                await subscribe_open_contract(router, active)
                    elif msg_type == "tick":
                        tick = message.get("tick", {})
                        symbol = tick.get("symbol")
                        if symbol not in symbols:
                            continue
                        current_digit = last_digit(tick.get("quote"), tick.get("pip_size"))
                        histories[symbol].append(current_digit)
                        strategies = ("over_2", "under_7") if state.strategy == "auto" else (state.strategy,)
                        candidates = {}
                        parity_rankings = {}
                        snapshot = {market: {**digit_snapshot(list(history), state.tick_window), "name": market_names.get(market, market), "symbol": market} for market, history in histories.items()}
                        for market, history in histories.items():
                            if state.strategy == "even_odd":
                                if len(history) < state.tick_window:
                                    snapshot[market]["status"] = f"Collecting ticks: {len(history)}/{state.tick_window}"
                                    continue
                                parity_analysis = analyse_even_odd(list(history))
                                if not parity_analysis:
                                    snapshot[market]["status"] = "Waiting for valid tick data"
                                    continue
                                parity_rankings[market] = parity_analysis
                                snapshot[market].update({
                                    **parity_analysis,
                                    "status": (
                                        f"{parity_analysis['dominant_parity'].title()} leads {parity_analysis['dominant_share']:.2f}% · gap {parity_analysis['parity_difference']:.2f}%"
                                        if parity_analysis["eligible"]
                                        else f"No trade: leading parity {parity_analysis['dominant_share']:.2f}% is below 51%"
                                    ),
                                })
                                continue
                            if state.strategy == "high_pair":
                                analysis = analyse_high_digit_pair(list(history)) if len(history) >= state.tick_window else None
                                if not analysis or (not analysis["eligible"] and market not in high_pair_eligible):
                                    snapshot[market]["status"] = "Screening: digits 0, 1, and 2 must each be below 10%; a top digit must be 5-9"
                                    continue
                                snapshot[market].update(analysis)
                                if market not in high_pair_eligible:
                                    high_pair_eligible.add(market)
                                    snapshot[market]["status"] = "Qualified. Waiting for two consecutive 7, 8, or 9 digits."
                                    if market == symbol:
                                        high_pair_streaks[market] = int(current_digit in (7, 8, 9))
                                    continue
                                if market == symbol:
                                    if current_digit in (7, 8, 9):
                                        high_pair_streaks[market] += 1
                                    else:
                                        high_pair_streaks[market] = 0
                                        high_pair_fired.discard(market)
                                streak = high_pair_streaks[market]
                                if streak >= 2 and market not in high_pair_fired:
                                    high_pair_fired.add(market)
                                    candidates[(market, "high_pair")] = {
                                        **analysis,
                                        "strategy": "high_pair",
                                        "triggers": (current_digit,),
                                    }
                                    snapshot[market]["status"] = f"Trigger pair {analysis['pair'][0]}, {analysis['pair'][1]} — submitting Over 2"
                                else:
                                    screen_note = "Screen moved; setup remains armed. " if not analysis["eligible"] else "Qualified; "
                                    snapshot[market]["status"] = f"{screen_note}waiting for two consecutive 7/8/9 digits ({min(streak, 2)}/2)"
                                continue
                            if len(history) < state.tick_window:
                                continue
                            for candidate_strategy in strategies:
                                candidate = analyse(list(history), candidate_strategy, state.digit_threshold, state.digit_thresholds)
                                if candidate:
                                    candidates[(market, candidate_strategy)] = {**candidate, "strategy": candidate_strategy}
                                elif candidate_strategy == "over_2":
                                    snapshot[market]["status"] = "Waiting: 5–9 must lead 0–4; 0–2 below 10% and not rising; top digit 5–9; trigger 0/1"
                        # Only the automatic strategy may fall back to Differs.
                        if not candidates and not active_contracts and differ_fallback_allowed(state.strategy):
                            for market, history in histories.items():
                                if len(history) < state.tick_window:
                                    continue
                                candidate = analyse_differ(list(history), previous_distributions.get(market))
                                if candidate and (not differ_batch_symbol or differ_batch_symbol == market):
                                    candidates[(market, "differ")] = {**candidate, "strategy": "differ"}
                        selected_key = max(candidates, key=lambda key: candidates[key]["score"]) if candidates and not active_contracts else None
                        selected = selected_key[0] if selected_key else ""
                        selected_candidate = candidates[selected_key] if selected_key else None
                        if state.strategy == "even_odd" and parity_rankings:
                            strongest_market = max(parity_rankings, key=lambda market: parity_rankings[market]["parity_difference"])
                            selected = strongest_market
                            strongest = parity_rankings[strongest_market]
                            if strongest["eligible"]:
                                direction = strongest["direction"]
                                trigger_parity = "odd" if direction == "even" else "even"
                                if (even_odd_armed_symbol, even_odd_armed_direction) != (strongest_market, direction):
                                    even_odd_armed_symbol = strongest_market
                                    even_odd_armed_direction = direction
                                    even_odd_trigger_streak = 0
                                    even_odd_trigger_fired = False
                                if symbol == strongest_market:
                                    wanted_parity = 1 if trigger_parity == "odd" else 0
                                    even_odd_trigger_streak = even_odd_trigger_streak + 1 if current_digit % 2 == wanted_parity else 0
                                    if even_odd_trigger_streak == 0:
                                        even_odd_trigger_fired = False
                                snapshot[strongest_market]["signal_contract"] = direction
                                snapshot[strongest_market]["status"] = (
                                    f"Two {trigger_parity} ticks confirmed; buying {direction.title()}"
                                    if even_odd_trigger_streak >= 2
                                    else f"{direction.title()} leads {strongest['dominant_share']:.2f}%; waiting for {trigger_parity} pair ({even_odd_trigger_streak}/2)"
                                )
                                if (even_odd_trigger_streak >= 2 and not even_odd_trigger_fired
                                        and not active_contracts and symbol == strongest_market
                                        and (even_odd_manual_armed or even_odd_recovery_pending)):
                                    selected_candidate = {**strongest, "strategy": "even_odd", "immediate": True, "triggers": (current_digit,)}
                                    even_odd_trigger_fired = True
                            else:
                                even_odd_armed_symbol = ""
                                even_odd_armed_direction = ""
                                even_odd_trigger_streak = 0
                                even_odd_trigger_fired = False
                                snapshot[strongest_market]["status"] = f"Best gap, but {strongest['dominant_share']:.2f}% is below 51%"
                        elif state.strategy == "even_odd":
                            even_odd_armed_symbol = ""
                            even_odd_armed_direction = ""
                            even_odd_trigger_streak = 0
                            even_odd_trigger_fired = False
                        for (market, candidate_strategy), item in candidates.items():
                            signal_status = (
                                (f"Selected: {item['direction']} {item['dominant_share']:.2f}% · gap {item['parity_difference']:.2f}%" if market == selected else f"Qualified, but not strongest · gap {item['parity_difference']:.2f}%")
                                if candidate_strategy == "even_odd"
                                else f"Favorable {candidate_strategy.replace('_', ' ').title()} — waiting for {','.join(map(str, item['triggers']))}"
                            )
                            snapshot[market].update({
                                "score": max(snapshot[market].get("score", 0), item["score"]),
                                "strategy": candidate_strategy,
                                "signal_contract": item.get("contract_type", ""),
                                "signals": [*snapshot[market].get("signals", []), candidate_strategy],
                                "status": signal_status,
                                "thresholds": item.get("thresholds", {}),
                            })
                        if selected_candidate and symbol == selected and (selected_candidate.get("immediate") or current_digit in selected_candidate["triggers"]):
                            fresh = await self.current_run(run_id)
                            if await self.allowed(run_id, fresh) and await self.entry_allowed(fresh):
                                active = await self.buy(router, fresh, selected, selected_candidate.get("barrier", current_digit), selected_candidate["strategy"], selected_candidate.get("contract_type"))
                                if selected_candidate["strategy"] == "differ":
                                    differ_batch_symbol = selected
                                    differ_batch_count += 1
                                    if differ_batch_count >= 5:
                                        differ_batch_symbol = ""
                                        differ_batch_count = 0
                                if active:
                                    active = str(active)
                                    if selected_candidate["strategy"] == "even_odd":
                                        even_odd_armed_symbol = ""
                                        even_odd_armed_direction = ""
                                        even_odd_trigger_streak = 0
                                        even_odd_trigger_fired = False
                                        even_odd_manual_armed = False
                                    await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(active_contract_id=active, selected_symbol=selected, waiting_for="")
                                    active_contracts.add(active)
                                    await subscribe_open_contract(router, active)
                        now = loop.time()
                        save_interval = 0.5 if state.strategy == "even_odd" else 1.0
                        if now - last_save >= save_interval:
                            waiting_for = (
                                f"Recovering {len(active_contracts)} open contracts"
                                if recovery_only and active_contracts
                                else (f"{selected_candidate['strategy']} · " + ",".join(map(str, selected_candidate["triggers"]))) if selected_candidate else ""
                            )
                            if state.strategy == "even_odd" and not (recovery_only and active_contracts):
                                if selected in parity_rankings and parity_rankings[selected]["eligible"]:
                                    direction = parity_rankings[selected]["direction"]
                                    opposite = "odd" if direction == "even" else "even"
                                    prefix = "Recovery: " if even_odd_recovery_pending else ""
                                    waiting_for = f"{prefix}{opposite} pair {min(even_odd_trigger_streak, 2)}/2"
                                elif selected in parity_rankings:
                                    waiting_for = f"Parity {parity_rankings[selected]['dominant_share']:.2f}% < 51%"
                                else:
                                    waiting_for = "Collecting volatility ticks"
                            await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(selected_symbol=selected, waiting_for=waiting_for, stats={"markets": snapshot, "selected": selected, "selected_strategy": selected_candidate["strategy"] if selected_candidate else ("even_odd" if state.strategy == "even_odd" and selected else ""), "selected_metrics": snapshot.get(selected, {}) if selected else {}, "progress": {"markets_ready": sum(1 for item in snapshot.values() if item["ticks"] >= state.tick_window), "markets_total": len(symbols), "tick_window": state.tick_window}, "updated_at": timezone.now().isoformat()})
                            last_save = now
                        previous_distributions = {market: item["digits"] for market, item in snapshot.items()}
            finally:
                await router.close()

    async def entry_allowed(self, run):
        return run.status == "running" and run.bot.enabled and run.account.account_type in {"demo", "real"} and (run.account.account_type == "demo" or (run.bot.live_trading_enabled and run.live_trading_confirmed_at)) and not run.active_contract_id and bool(await self.token_for(run))

    async def open_contract_ids(self, run_id):
        return await sync_to_async(list)(
            AutomationTrade.objects.filter(run_id=run_id, status="open")
            .order_by("opened_at")
            .values_list("contract_id", flat=True)
        )

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

    @staticmethod
    def market_names(items):
        return {
            str(item.get("symbol") or item.get("underlying_symbol")): str(item.get("display_name") or item.get("underlying_symbol_name") or item.get("symbol") or item.get("underlying_symbol"))
            for item in items if item.get("symbol") or item.get("underlying_symbol")
        }

    @staticmethod
    def market_pip_sizes(items):
        precisions = {}
        for item in items:
            symbol = str(item.get("symbol") or item.get("underlying_symbol") or "")
            if not symbol:
                continue
            # Legacy active_symbols calls name this field `pip` (for example
            # 0.01), while streaming ticks use `pip_size` (for example 2).
            # Treating the former as an integer was losing trailing zeroes in
            # tick history and produced false digit distributions.
            pip_size = item.get("pip_size")
            if pip_size is not None:
                try:
                    precisions[symbol] = int(pip_size)
                    continue
                except (TypeError, ValueError):
                    pass
            pip = item.get("pip")
            if pip is not None:
                try:
                    decimal = Decimal(str(pip))
                    precisions[symbol] = max(0, -decimal.normalize().as_tuple().exponent)
                except (ArithmeticError, ValueError):
                    pass
        return precisions

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
        if run.strategy != "even_odd" and run.max_trades_per_day and len(trades) >= run.max_trades_per_day:
            return False
        loss = -sum((Decimal(str(item["profit"])) for item in trades if Decimal(str(item["profit"])) < 0), Decimal("0"))
        return not run.max_daily_loss or loss < run.max_daily_loss

    async def run_trades(self, run):
        query = AutomationTrade.objects.filter(run=run)
        if run.started_at:
            query = query.filter(opened_at__gte=run.started_at)
        return await sync_to_async(list)(query.order_by("-opened_at").values("status", "stake"))

    async def loss_streak(self, run):
        streak = 0
        for trade in await self.run_trades(run):
            if trade["status"] != "lost":
                break
            streak += 1
        return streak

    async def buy(self, router, run, symbol, digit, strategy, requested_contract_type=None):
        if strategy in {"over_2", "high_pair"}:
            contract_type, barrier = "DIGITOVER", "2"
        elif strategy == "under_7":
            contract_type, barrier = "DIGITUNDER", "7"
        elif strategy == "even_odd":
            contract_type, barrier = requested_contract_type, None
        else:
            contract_type, barrier = "DIGITDIFF", str(digit)
        stake = run.stake
        if strategy in {"even_odd", "high_pair"}:
            loss_streak = await self.loss_streak(run)
            if strategy == "high_pair" and loss_streak > run.max_martingale_steps:
                await self.complete_sequence(run.id, "Recovery limit reached.")
                return ""
            stake = recovery_stake(run.stake, run.martingale_multiplier, loss_streak)
        if run.bot.max_stake and stake > run.bot.max_stake:
            await self.stop(run.id, "Martingale recovery stake exceeds this bot's maximum stake.")
            return ""
        async def still_authorized_to_enter():
            fresh = await self.current_run(run.id)
            return (
                fresh.status == "running"
                and fresh.bot.enabled
                and not fresh.active_contract_id
                and fresh.account.account_type in {"demo", "real"}
                and (fresh.account.account_type == "demo" or (fresh.bot.live_trading_enabled and fresh.live_trading_confirmed_at))
            )

        result = await buy_with_fresh_proposal(
            router,
            proposal_payload(stake, run.account.currency, symbol, contract_type, barrier),
            before_buy=still_authorized_to_enter,
        )
        if not result:
            return ""
        contract_id = str(result["buy"]["contract_id"])
        await sync_to_async(AutomationTrade.objects.create)(run=run, symbol=symbol, strategy=strategy, trigger_digit=digit, contract_id=contract_id, contract_type=contract_type, stake=stake, raw=result)
        return contract_id

    async def stop(self, run_id, message=""):
        await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(status="stopped", stopped_at=timezone.now(), waiting_for="", error_message=message)

    async def complete_sequence(self, run_id, message):
        run = await self.current_run(run_id)
        stats = dict(run.stats or {})
        stats["sequence_status"] = message
        await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(
            status="stopped",
            stopped_at=timezone.now(),
            waiting_for="",
            error_message="",
            stats=stats,
        )

    async def fail(self, run_id, message):
        await sync_to_async(AutomationRun.objects.filter(pk=run_id).update)(status="error", error_message=message[:500])
