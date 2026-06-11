from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from decimal import Decimal
import asyncio

from portfolio.services import create_trade
from portfolio.engine import broadcast_portfolio_update
from .services.deriv_trade import DerivTradeEngine


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
                trade.save()

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
