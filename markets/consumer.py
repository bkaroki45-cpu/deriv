import json
from channels.generic.websocket import AsyncWebsocketConsumer


# =========================
# 📡 MARKET TICK CONSUMER
# =========================
class MarketConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        await self.channel_layer.group_add(
            "market_data",
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            "market_data",
            self.channel_name
        )

    async def send_tick(self, event):
        tick = event["tick"]

        await self.send(text_data=json.dumps({
            "type": "tick",
            "symbol": tick.get("symbol"),
            "price": tick.get("quote"),
            "time": tick.get("epoch"),
        }))


# =========================
# 📊 CANDLESTICK CONSUMER
# =========================
class ChartConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        await self.channel_layer.group_add(
            "chart_data",
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            "chart_data",
            self.channel_name
        )

    async def send_candle(self, event):
        candle = event["candle"]

        await self.send(text_data=json.dumps({
            "type": "candle",
            "symbol": candle.get("symbol"),
            "open": candle.get("open"),
            "high": candle.get("high"),
            "low": candle.get("low"),
            "close": candle.get("close"),
            "time": candle.get("time"),
        }))