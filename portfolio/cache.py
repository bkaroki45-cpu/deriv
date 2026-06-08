from django.core.cache import cache
from .models import Trade


def get_open_trades(symbol):

    key = f"open_trades:{symbol}"

    trades = cache.get(key)

    if trades is None:
        trades = list(
            Trade.objects.filter(status="open", symbol=symbol)
            .values("id", "entry_price", "stake", "direction", "stop_loss", "take_profit")
        )

        cache.set(key, trades, timeout=2)  # 2 sec cache

    return trades