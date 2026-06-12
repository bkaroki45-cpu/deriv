import asyncio
from .services.deriv_ws import DerivMarketStream

def start():
    client = DerivMarketStream()
    asyncio.run(client.connect())
