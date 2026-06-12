import os
import json
import asyncio
import websockets

from channels.layers import get_channel_layer

from portfolio.tasks import process_risk_batch


class DerivMarketStream:

    def __init__(self):
        self.app_id = os.getenv("DERIV_WS_APP_ID", "1089")
        self.url = f"wss://ws.derivws.com/websockets/v3?app_id={self.app_id}"

        # candle storage (1-second aggregation)
        self.candles = {}

    # =========================
    # CONNECT TO DERIV
    # =========================
    async def connect(self):
        async with websockets.connect(self.url) as ws:

            await ws.send(json.dumps({
                "ticks": "R_100",
                "subscribe": 1
            }))

            await self.listen(ws)

    # =========================
    # MAIN LOOP
    # =========================
    async def listen(self, ws):

        channel_layer = get_channel_layer()

        while True:
            msg = await ws.recv()
            data = json.loads(msg)

            if "tick" not in data:
                continue

            tick = data["tick"]

            symbol = tick.get("symbol", "R_100")
            price = float(tick.get("quote"))
            epoch = tick.get("epoch")

            # =========================
            # 1. BUILD CANDLE
            # =========================
            candle = self.build_candle(symbol, price, epoch)

            # =========================
            # 2. SEND TO FRONTEND (CHARTS + MARKET FEED)
            # =========================
            await channel_layer.group_send(
                "chart_data",
                {
                    "type": "send.candle",
                    "candle": candle
                }
            )

            await channel_layer.group_send(
                "market_data",
                {
                    "type": "send.tick",
                    "tick": tick
                }
            )

            # =========================
            # 3. TRIGGER RISK ENGINE (ASYNC CELERY)
            # =========================
            process_risk_batch.delay(symbol, price)

    # =========================
    # CANDLE BUILDER
    # =========================
    def build_candle(self, symbol, price, epoch):

        bucket = int(epoch)

        if symbol not in self.candles:
            self.candles[symbol] = {}

        if bucket not in self.candles[symbol]:
            self.candles[symbol][bucket] = {
                "open": price,
                "high": price,
                "low": price,
                "close": price,
                "time": bucket
            }

        candle = self.candles[symbol][bucket]

        candle["high"] = max(candle["high"], price)
        candle["low"] = min(candle["low"], price)
        candle["close"] = price

        return {
            "symbol": symbol,
            **candle
        }
