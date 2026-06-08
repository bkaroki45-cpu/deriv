from .models import Trade
from .engine import broadcast_portfolio_update
from .profit_engine import calculate_profit
from wallet.services import apply_trade_profit


# =========================
# 🧠 RISK ENGINE
# =========================
def check_risk(trade, current_price):

    # =========================
    # UPDATE LIVE PROFIT
    # =========================
    trade.profit = calculate_profit(trade, current_price)
    trade.save(update_fields=["profit"])

    # =========================
    # STOP LOSS CHECK
    # =========================
    if trade.stop_loss is not None:
        if trade.profit <= trade.stop_loss:
            close_trade(trade, "stop_loss")
            return "STOP_LOSS_TRIGGERED"

    # =========================
    # TAKE PROFIT CHECK
    # =========================
    if trade.take_profit is not None:
        if trade.profit >= trade.take_profit:
            close_trade(trade, "take_profit")
            return "TAKE_PROFIT_TRIGGERED"

    return "OK"


# =========================
# 💰 CLOSE TRADE
# =========================
def close_trade(trade, reason):

    trade.status = "closed"
    trade.save()

    # Update wallet
    apply_trade_profit(trade.user.wallet, trade)

    # Send live update
    broadcast_portfolio_update({
        "type": "trade_closed",
        "trade_id": trade.id,
        "reason": reason,
        "profit": str(trade.profit),
        "status": trade.status
    })