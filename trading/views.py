from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework import status

from decimal import Decimal, InvalidOperation
import asyncio
from django.utils import timezone

from accounts.models import ActivityLog, DerivAccount, OAuthToken, Referral
from core.deriv_api import (
    DerivAPIClient,
    account_payload_from_snapshot,
    account_snapshot_from_token,
    active_token_for_request,
    seal_token,
    set_deriv_session,
    sync_accounts,
)
from portfolio.services import create_trade
from portfolio.engine import broadcast_portfolio_update
from portfolio.models import Trade
from .services.deriv_trade import DerivTradeEngine, build_proposal_payload
from .models import AutomationBot, AutomationRun, AutomationTrade, Commission, Portfolio, TradingLog, Transaction


class TradeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):

        try:
            # =========================
            # 1. VALIDATE INPUT
            # =========================
            symbol = request.data.get("symbol")
            direction = request.data.get("direction")
            stake = request.data.get("stake")
            duration = request.data.get("duration", 5)
            duration_unit = request.data.get("duration_unit", "t")
            requested_contract_type = request.data.get("contract_type")
            barrier = request.data.get("barrier")
            growth_rate = request.data.get("growth_rate")
            multiplier = request.data.get("multiplier")
            take_profit = request.data.get("take_profit")
            stop_loss = request.data.get("stop_loss")
            deriv_token = request.session.get("deriv_token")
            currency = request.session.get("deriv_currency", "USD")

            if not deriv_token:
                deriv_token = active_token_for_request(request)
            if not deriv_token:
                return Response(
                    {"error": "Login with Deriv before placing a trade."},
                    status=status.HTTP_401_UNAUTHORIZED
                )

            if not symbol or not direction or not stake:
                return Response(
                    {"error": "symbol, direction, and stake are required"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            stake = Decimal(stake)

            if stake <= 0:
                return Response(
                    {"error": "Stake must be greater than 0"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            contract_type = requested_contract_type or ("CALL" if direction.lower() == "rise" else "PUT")
            # Reject unsupported or incomplete contracts before a local record
            # is created. The same builder is used for the eventual Deriv buy.
            build_proposal_payload(
                symbol=symbol, contract_type=contract_type, stake=stake,
                duration=duration, duration_unit=duration_unit, currency=currency,
                barrier=barrier, growth_rate=growth_rate, multiplier=multiplier,
                take_profit=take_profit, stop_loss=stop_loss,
            )

            # =========================
            # 2. SAVE TRADE (OPEN)
            # =========================
            trade = None
            if request.user.is_authenticated:
                trade = create_trade(
                    user=request.user,
                    symbol=symbol,
                    direction=direction.lower(),
                    stake=stake,
                    contract_type=contract_type,
                    duration=int(duration),
                    duration_unit=duration_unit,
                    take_profit=Decimal(str(take_profit)) if take_profit not in (None, "") else None,
                    stop_loss=Decimal(str(stop_loss)) if stop_loss not in (None, "") else None,
                )

            # 🔥 LIVE UPDATE: NEW TRADE CREATED
                broadcast_portfolio_update({
                    "type": "new_trade",
                    "trade": {
                        "id": trade.id,
                        "symbol": trade.symbol,
                        "direction": trade.direction,
                        "stake": str(trade.stake),
                        "profit": str(trade.profit),
                        "status": trade.status,
                    }
                })

            # =========================
            # 3. EXECUTE DERIV TRADE
            # =========================
            engine = DerivTradeEngine(token=deriv_token)

            try:
                result = asyncio.run(
                    engine.buy_contract(
                        symbol,
                        contract_type,
                        float(stake),
                        duration,
                        duration_unit,
                        currency=currency,
                        barrier=barrier,
                        growth_rate=growth_rate,
                        multiplier=multiplier,
                        take_profit=take_profit,
                        stop_loss=stop_loss,
                    )
                )
            except Exception as e:
                # The contract was not bought at Deriv, so do not leave a
                # misleading local "open" position behind.
                if trade:
                    trade.delete()
                return Response(
                    {"error": f"Deriv execution failed: {str(e)}"},
                    status=status.HTTP_502_BAD_GATEWAY
                )

            # =========================
            # 4. STORE CONTRACT ID
            # =========================
            if trade and isinstance(result, dict) and "buy" in result:
                contract_id = result["buy"].get("contract_id")

                trade.contract_id = contract_id
                buy_price = result["buy"].get("buy_price")
                if buy_price is not None:
                    trade.entry_price = Decimal(str(buy_price))
                trade.save(update_fields=["contract_id", "entry_price", "updated_at"])
                TradingLog.objects.create(
                    user=request.user if request.user.is_authenticated else None,
                    action="buy_contract",
                    account_id=request.session.get("deriv_account_id", ""),
                    symbol=symbol,
                    contract_id=str(contract_id or ""),
                    status="executed",
                    payload=result,
                )

            # =========================
            # 5. RETURN RESPONSE
            # =========================
            return Response({
                "success": True,
                "trade_id": trade.id if trade else None,
                "contract_id": result.get("buy", {}).get("contract_id") if isinstance(result, dict) else None,
                "buy": result.get("buy", {}) if isinstance(result, dict) else {},
                "deriv_response": result
            })

        except (ValueError, InvalidOperation) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DerivBaseAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def client(self, request):
        token = active_token_for_request(request)
        if not token:
            raise RuntimeError("Connect a Deriv account first.")
        return DerivAPIClient(token)


class AccountOverviewView(DerivBaseAPIView):
    def get(self, request):
        token = active_token_for_request(request)
        authorize, balance = account_snapshot_from_token(token)
        active_payload = account_payload_from_snapshot(authorize, balance)
        active_account_id = active_payload["account_id"] or request.session.get("deriv_account_id", "")
        payload = {"accounts": [active_payload]}
        try:
            remote = self.client(request).accounts()
            remote_accounts = remote.get("accounts") if isinstance(remote, dict) else remote
            if isinstance(remote_accounts, list):
                payload = {"accounts": [*remote_accounts, active_payload]}
        except Exception:
            # The live WebSocket snapshot is sufficient to keep the selected
            # Deriv account in sync when the optional REST listing is absent.
            pass
        accounts = sync_accounts(request.user, payload, active_account_id)
        active = next((item for item in accounts if item.account_id == active_account_id), None)
        if active:
            set_deriv_session(request, token, active.account_id, active.currency, active.account_type, request.session.get("deriv_token_id"))
        return Response({
            "accounts": [
                {
                    "account_id": account.account_id,
                    "account_type": account.account_type,
                    "currency": account.currency,
                    "balance": str(account.balance),
                    "is_active": account.is_active,
                }
                for account in accounts
            ],
            "raw": payload,
        })

    def post(self, request):
        account_type = request.data.get("account_type", "demo")
        if account_type not in {"demo", "real"}:
            return Response({"error": "account_type must be demo or real"}, status=status.HTTP_400_BAD_REQUEST)
        payload = self.client(request).create_account(account_type=account_type, payload=request.data.copy())
        sync_accounts(request.user, payload, request.session.get("deriv_account_id", ""))
        ActivityLog.objects.create(user=request.user, action=f"create_{account_type}_account", metadata=payload)
        return Response(payload, status=status.HTTP_201_CREATED)


class SwitchAccountView(DerivBaseAPIView):
    def post(self, request):
        account_id = request.data.get("account_id")
        account = DerivAccount.objects.filter(user=request.user, account_id=account_id).first()
        if not account:
            return Response({"error": "Unknown Deriv account"}, status=status.HTTP_404_NOT_FOUND)
        DerivAccount.objects.filter(user=request.user).update(is_active=False)
        account.is_active = True
        account.save(update_fields=["is_active"])
        # A legacy OAuth callback may include one token per account. Use its
        # matching token so switching changes the actual trading account too.
        account_token = request.user.deriv_tokens.filter(active_account=account, is_valid=True).order_by("-updated_at").first()
        token = active_token_for_request(request)
        if account_token:
            from core.deriv_api import unseal_token
            token = unseal_token(account_token.access_token)
        set_deriv_session(
            request,
            token,
            account.account_id,
            account.currency,
            account.account_type,
            account_token.id if account_token else request.session.get("deriv_token_id"),
        )
        return Response({"success": True, "account_id": account.account_id, "account_type": account.account_type})


class ResetDemoBalanceView(DerivBaseAPIView):
    def post(self, request, account_id):
        payload = self.client(request).reset_demo_balance(account_id)
        ActivityLog.objects.create(user=request.user, action="reset_demo_balance", metadata={"account_id": account_id})
        return Response(payload)


class DerivOTPView(DerivBaseAPIView):
    def post(self, request, account_id=None):
        account_id = account_id or request.data.get("account_id") or request.session.get("deriv_account_id")
        if not account_id:
            return Response({"error": "account_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        payload = self.client(request).otp(account_id)
        otp = payload.get("otp") or payload.get("token") or payload.get("data", {}).get("otp")
        return Response({
            "otp": otp,
            "account_id": account_id,
            "account_type": "demo" if str(account_id).upper().startswith("VRTC") else "real",
            "raw": payload,
        })


class MarketDataView(DerivBaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, resource):
        token = active_token_for_request(request)
        engine = DerivTradeEngine(token=token)
        symbol = request.GET.get("symbol", "1HZ100V")
        if resource == "active-symbols":
            payload = asyncio.run(engine.send_once({"active_symbols": "brief", "product_type": "basic"}))
        elif resource == "contracts-for":
            payload = asyncio.run(engine.send_once({"contracts_for": symbol, "currency": request.GET.get("currency", "USD")}))
        elif resource == "contract-list":
            payload = asyncio.run(engine.send_once({"contracts_for": symbol, "currency": request.GET.get("currency", "USD")}))
        elif resource == "tick-history":
            payload = asyncio.run(engine.send_once({
                "ticks_history": symbol,
                "adjust_start_time": 1,
                "count": int(request.GET.get("count", 100)),
                "end": "latest",
                "style": request.GET.get("style", "ticks"),
            }))
        else:
            return Response({"error": "Unknown market resource"}, status=status.HTTP_404_NOT_FOUND)
        return Response(payload)


class ProposalView(DerivBaseAPIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = active_token_for_request(request)
        engine = DerivTradeEngine(token=token)
        payload = build_proposal_payload(
            symbol=request.data.get("symbol"),
            contract_type=request.data.get("contract_type"),
            stake=request.data.get("stake") or request.data.get("amount"),
            duration=request.data.get("duration"),
            duration_unit=request.data.get("duration_unit"),
            currency=request.session.get("deriv_currency", "USD"),
            barrier=request.data.get("barrier"),
            growth_rate=request.data.get("growth_rate"),
            multiplier=request.data.get("multiplier"),
            take_profit=request.data.get("take_profit"),
            stop_loss=request.data.get("stop_loss"),
        )
        return Response(asyncio.run(engine.send_once(payload, authorize=bool(token))))


class SellContractView(DerivBaseAPIView):
    def post(self, request, contract_id):
        price = request.data.get("price", 0)
        engine = DerivTradeEngine(token=active_token_for_request(request))
        payload = asyncio.run(engine.send_once({"sell": contract_id, "price": float(price)}, authorize=True))
        TradingLog.objects.create(user=request.user, action="sell_contract", contract_id=str(contract_id), payload=payload)
        return Response(payload)


class CancelContractView(DerivBaseAPIView):
    def post(self, request, contract_id):
        engine = DerivTradeEngine(token=active_token_for_request(request))
        payload = asyncio.run(engine.send_once({"cancel": contract_id}, authorize=True))
        TradingLog.objects.create(user=request.user, action="cancel_contract", contract_id=str(contract_id), payload=payload)
        return Response(payload)


class AccountStreamSnapshotView(DerivBaseAPIView):
    def get(self, request, resource):
        engine = DerivTradeEngine(token=active_token_for_request(request))
        mapping = {
            "balance": {"balance": 1},
            "portfolio": {"portfolio": 1},
            "statement": {"statement": 1, "limit": int(request.GET.get("limit", 50))},
            "profit-table": {"profit_table": 1, "limit": int(request.GET.get("limit", 50))},
            "transaction": {"transaction": 1},
            "contract": {"proposal_open_contract": 1, "contract_id": request.GET.get("contract_id"), "subscribe": 0},
        }
        if resource not in mapping:
            return Response({"error": "Unknown account resource"}, status=status.HTTP_404_NOT_FOUND)
        if resource == "contract" and not request.GET.get("contract_id"):
            return Response({"error": "contract_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        payload = asyncio.run(engine.send_once(mapping[resource], authorize=True))
        contract = payload.get("proposal_open_contract", {})
        contract_id = str(contract.get("contract_id") or request.GET.get("contract_id") or "")
        if contract_id:
            trade = Trade.objects.filter(user=request.user, contract_id=contract_id).first()
            if trade:
                trade.profit = Decimal(str(contract.get("profit") or 0))
                if contract.get("is_sold") or contract.get("is_expired"):
                    trade.status = "closed"
                    trade.closed_at = timezone.now()
                    exit_price = contract.get("exit_spot") or contract.get("sell_spot") or contract.get("bid_price")
                    if exit_price not in (None, ""):
                        trade.exit_price = Decimal(str(exit_price))
                trade.save(update_fields=["profit", "status", "closed_at", "exit_price", "updated_at"])
        return Response(payload)


class MarkupStatisticsView(DerivBaseAPIView):
    def get(self, request):
        payload = self.client(request).markup_statistics()
        stats = payload.get("markup_statistics") or payload.get("data") or payload
        Commission.objects.create(user=request.user, raw=payload)
        return Response({
            "commission_earned": stats.get("commission_earned", 0) if isinstance(stats, dict) else 0,
            "daily_commission": stats.get("daily_commission", 0) if isinstance(stats, dict) else 0,
            "monthly_commission": stats.get("monthly_commission", 0) if isinstance(stats, dict) else 0,
            "trade_volume": stats.get("trade_volume", 0) if isinstance(stats, dict) else 0,
            "active_traders": stats.get("active_traders", 0) if isinstance(stats, dict) else 0,
            "raw": payload,
        })


class DashboardAnalyticsView(DerivBaseAPIView):
    def get(self, request):
        trades = Trade.objects.filter(user=request.user)
        closed = trades.filter(status="closed")
        wins = closed.filter(profit__gt=0).count()
        stake = sum((trade.stake for trade in trades), Decimal("0"))
        profit = sum((trade.profit for trade in trades), Decimal("0"))
        active = request.user.deriv_accounts.filter(is_active=True).first()
        return Response({
            "current_balance": str(active.balance if active else 0),
            "daily_profit_loss": str(profit),
            "total_trades": trades.count(),
            "win_rate": round((wins / closed.count()) * 100, 2) if closed.exists() else 0,
            "roi_percent": round((profit / stake) * 100, 2) if stake else 0,
            "active_positions": trades.filter(status="open").count(),
            "account_type": active.account_type if active else request.session.get("deriv_account_type", "real"),
        })


class AdminDashboardDataView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({
            "users": DerivAccount.objects.values("user").distinct().count(),
            "referrals": Referral.objects.count(),
            "revenue_records": Commission.objects.count(),
            "transactions": Transaction.objects.count(),
            "portfolio_items": Portfolio.objects.count(),
            "system_logs": ActivityLog.objects.count(),
            "trading_logs": TradingLog.objects.count(),
        })


class AutomationBotsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response({"bots": [{"id": bot.id, "name": bot.name, "description": bot.description, "enabled": bot.enabled, "live_trading_enabled": bot.live_trading_enabled} for bot in AutomationBot.objects.filter(enabled=True)]})


class AutomationAccountsView(APIView):
    """Synchronise only accounts whose Deriv token is usable by the worker."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        token = active_token_for_request(request)
        if token:
            try:
                # The Options accounts endpoint returns every Demo and Real
                # account associated with this authorised Deriv user.
                remote_accounts = DerivAPIClient(token).accounts()
                sync_accounts(request.user, remote_accounts, request.session.get("deriv_account_id", ""))
                authorize, balance = account_snapshot_from_token(token)
                payload = account_payload_from_snapshot(authorize, balance)
                account_id = payload.get("account_id")
                if account_id:
                    account, _ = DerivAccount.objects.update_or_create(
                        user=request.user, account_id=account_id,
                        defaults={"account_type": payload["account_type"], "currency": payload["currency"], "balance": Decimal(str(payload.get("balance") or 0)), "is_active": True, "raw": payload},
                    )
                    DerivAccount.objects.filter(user=request.user).exclude(pk=account.pk).update(is_active=False)
                    if not OAuthToken.objects.filter(user=request.user, active_account=account, is_valid=True).exists():
                        OAuthToken.objects.create(user=request.user, token_type="oauth", access_token=seal_token(token), active_account=account, is_valid=True, last_validated_at=timezone.now())
            except Exception:
                pass
        accounts = DerivAccount.objects.filter(user=request.user).order_by("account_type", "account_id")
        return Response({"accounts": [{"account_id": account.account_id, "account_type": account.account_type, "balance": str(account.balance), "currency": account.currency} for account in accounts]})


class AutomationRunView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, bot_id):
        run = AutomationRun.objects.filter(user=request.user, bot_id=bot_id).first()
        if not run:
            account = request.user.deriv_accounts.filter(is_active=True).first() or request.user.deriv_accounts.first()
            return Response({
                "status": "stopped", "trades": [], "stats": {}, "symbols": [],
                "selected_symbol": "", "waiting_for": "", "active_contract_id": "",
                "profit_loss": "0.00", "win_rate": 0,
                "balance": str(account.balance) if account else "", "currency": account.currency if account else "",
                "error": "",
            })
        if not run.bot.enabled and run.status in {"running", "stopping"}:
            run.status = "stopping"
            run.error_message = "Disabled by administrator."
            run.save(update_fields=["status", "error_message", "updated_at"])
        trades = list(run.trades.order_by("-opened_at")[:30].values("symbol", "strategy", "trigger_digit", "contract_id", "stake", "status", "profit", "opened_at", "settled_at"))
        closed = [item for item in trades if item["status"] in {"won", "lost"}]
        return Response({"id": run.id, "status": run.status, "enabled": run.bot.enabled, "symbols": run.symbols, "strategy": run.strategy, "stake": str(run.stake), "tick_window": run.tick_window, "digit_threshold": str(run.digit_threshold), "digit_thresholds": run.digit_thresholds, "max_daily_loss": str(run.max_daily_loss or ""), "max_trades_per_day": run.max_trades_per_day, "selected_symbol": run.selected_symbol, "waiting_for": run.waiting_for, "active_contract_id": run.active_contract_id, "stats": run.stats, "error": run.error_message, "balance": str(run.account.balance), "currency": run.account.currency, "profit_loss": str(sum((item["profit"] for item in trades), Decimal("0"))), "win_rate": round(100 * sum(1 for item in closed if item["profit"] > 0) / len(closed), 2) if closed else 0, "trades": trades})

    def post(self, request, bot_id):
        bot = AutomationBot.objects.filter(pk=bot_id, enabled=True).first()
        if not bot: return Response({"error": "This bot is not enabled by the administrator."}, status=404)
        account = request.user.deriv_accounts.filter(account_id=request.data.get("account_id")).first()
        if not account: return Response({"error": "Select one of your linked accounts."}, status=400)
        if account.account_type == "real" and not bot.live_trading_enabled:
            return Response({"error": "The administrator has not enabled live automation for this bot."}, status=400)
        if account.account_type == "real" and request.data.get("confirm_live_trading") is not True:
            return Response({"error": "Confirm live automation before using a real account."}, status=400)
        scan_all_volatility = request.data.get("scan_all_volatility") is True
        symbols = ["__all_volatility__"] if scan_all_volatility else [str(symbol) for symbol in request.data.get("symbols", []) if str(symbol)]
        if not symbols: return Response({"error": "Select at least one Volatility Index."}, status=400)
        try:
            stake = Decimal(str(request.data.get("stake", "0.35")))
            window = max(20, min(int(request.data.get("tick_window", 100)), 5000))
            daily_loss = Decimal(str(request.data["max_daily_loss"])) if request.data.get("max_daily_loss") else bot.max_daily_loss
            trade_limit = int(request.data["max_trades_per_day"]) if request.data.get("max_trades_per_day") else bot.max_trades_per_day
        except (TypeError, ValueError, ArithmeticError):
            return Response({"error": "Enter valid stake, tick window, and optional limits."}, status=400)
        if stake < Decimal("0.35"): return Response({"error": "Minimum stake is 0.35."}, status=400)
        if daily_loss is not None and daily_loss <= 0: return Response({"error": "Daily loss limit must be greater than zero."}, status=400)
        if trade_limit is not None and trade_limit <= 0: return Response({"error": "Trade limit must be greater than zero."}, status=400)
        if bot.max_stake and stake > bot.max_stake: return Response({"error": "Stake exceeds this bot's administrator limit."}, status=400)
        strategy = request.data.get("strategy", "auto")
        if strategy not in {"auto", "over_2", "under_7"}: return Response({"error": "Unsupported strategy."}, status=400)
        trigger_digits = {"over_2": {"0", "1", "2"}, "under_7": {"7", "8", "9"}, "auto": {"0", "1", "2", "7", "8", "9"}}[strategy]
        supplied = request.data.get("digit_thresholds") or {}
        try:
            thresholds = {digit: float(supplied.get(digit, request.data.get("digit_threshold", 8))) for digit in trigger_digits}
        except (TypeError, ValueError):
            return Response({"error": "Each digit threshold must be a percentage."}, status=400)
        if any(value <= 0 or value > 100 for value in thresholds.values()):
            return Response({"error": "Digit thresholds must be between 0 and 100."}, status=400)
        run, _ = AutomationRun.objects.update_or_create(user=request.user, bot=bot, defaults={"account": account, "symbols": symbols, "strategy": strategy, "tick_window": window, "digit_threshold": Decimal(str(request.data.get("digit_threshold", "8"))), "digit_thresholds": thresholds, "stake": stake, "max_daily_loss": daily_loss, "max_trades_per_day": trade_limit, "live_trading_confirmed_at": timezone.now() if account.account_type == "real" else None, "status": "running", "active_contract_id": "", "error_message": "", "started_at": timezone.now(), "stopped_at": None})
        return Response({"id": run.id, "status": run.status})

    def delete(self, request, bot_id):
        run = AutomationRun.objects.filter(user=request.user, bot_id=bot_id, status="running").first()
        if run: run.status = "stopping"; run.save(update_fields=["status", "updated_at"])
        return Response({"status": "stopping" if run else "stopped"})
