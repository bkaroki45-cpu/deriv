import asyncio
from .services.deriv_ws import DerivWebSocketClient

def start():
    client = DerivWebSocketClient()
    asyncio.run(client.connect())