from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework import status

from decimal import Decimal
import asyncio
from django.utils import timezone

from accounts.models import ActivityLog, DerivAccount, Referral
from core.deriv_api import DerivAPIClient, active_token_for_request, set_deriv_session, sync_accounts
from portfolio.services import create_trade
from portfolio.engine import broadcast_portfolio_update
from portfolio.models import Trade
from .services.deriv_trade import DerivTradeEngine
from .models import Commission, Portfolio, TradingLog, Transaction


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
                    take_profit=Decimal(str(request.data.get("take_profit"))) if request.data.get("take_profit") not in (None, "") else None,
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
                trade.save(update_fields=["contract_id", "updated_at"])
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
                "deriv_response": result
            })

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
        client = self.client(request)
        payload = client.accounts()
        accounts = sync_accounts(request.user, payload, request.session.get("deriv_account_id", ""))
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
        payload = dict(request.data)
        payload.setdefault("proposal", 1)
        payload.setdefault("basis", "stake")
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
                trade.save()
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
