from celery import shared_task

from .models import Trade
from .profit_engine import calculate_profit
from .engine import broadcast_portfolio_update
from .risk_engine import close_trade  # ✅ FIXED IMPORT
from wallet.services import apply_trade_profit


@shared_task
def process_risk_batch(symbol, price):

    # =========================
    # FETCH ONLY OPEN TRADES
    # =========================
    trades = Trade.objects.filter(
        status="open",
        symbol=symbol
    ).only(
        "id",
        "entry_price",
        "stake",
        "direction",
        "stop_loss",
        "take_profit",
        "profit"
    )

    for trade in trades:

        # =========================
        # 1. CALCULATE PROFIT
        # =========================
        profit = calculate_profit(trade, price)

        # Update in memory (NOT heavy save every tick)
        trade.profit = profit

        # =========================
        # 2. STOP LOSS CHECK
        # =========================
        if trade.stop_loss is not None and profit <= trade.stop_loss:

            close_trade(trade, "stop_loss")

            broadcast_portfolio_update({
                "type": "trade_closed",
                "trade_id": trade.id,
                "reason": "stop_loss",
                "profit": str(profit),
                "status": "closed"
            })

            apply_trade_profit(trade.user, profit)

            continue

        # =========================
        # 3. TAKE PROFIT CHECK
        # =========================
        if trade.take_profit is not None and profit >= trade.take_profit:

            close_trade(trade, "take_profit")

            broadcast_portfolio_update({
                "type": "trade_closed",
                "trade_id": trade.id,
                "reason": "take_profit",
                "profit": str(profit),
                "status": "closed"
            })

            apply_trade_profit(trade.user, profit)

            continue

        # =========================
        # 4. LIVE UPDATE (optional UI sync)
        # =========================
        broadcast_portfolio_update({
            "type": "trade_update",
            "trade_id": trade.id,
            "profit": str(profit),
            "status": trade.status
        })