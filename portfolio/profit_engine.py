from decimal import Decimal


def calculate_profit(trade, current_price):
    """
    Real floating profit calculator (broker-style)
    """

    if not trade.entry_price:
        return Decimal("0")

    entry = Decimal(trade.entry_price)
    current = Decimal(current_price)
    stake = Decimal(trade.stake)

    # =========================
    # RISE TRADE
    # =========================
    if trade.direction == "rise":

        diff = current - entry

        if diff >= 0:
            return stake * diff / entry
        else:
            return -stake * (-diff) / entry

    # =========================
    # FALL TRADE
    # =========================
    else:

        diff = entry - current

        if diff >= 0:
            return stake * diff / entry
        else:
            return -stake * (-diff) / entry