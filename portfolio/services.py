from .models import Trade


def create_trade(user, symbol, direction, stake, entry_price=None):
    return Trade.objects.create(
        user=user,
        symbol=symbol,
        direction=direction,
        stake=stake,
        entry_price=entry_price,
        status="open"
    )


from .engine import broadcast_portfolio_update


def close_trade(trade, exit_price, profit):
    trade.exit_price = exit_price
    trade.profit = profit
    trade.status = "closed"
    trade.save()

    # 🔥 LIVE UPDATE TO FRONTEND
    broadcast_portfolio_update({
        "type": "trade_update",
        "trade_id": trade.id,
        "profit": str(trade.profit),
        "status": trade.status,
    })

    return trade