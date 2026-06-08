from django.urls import re_path
from .consumer import MarketConsumer, ChartConsumer

websocket_urlpatterns = [
    re_path(r"ws/markets/$", MarketConsumer.as_asgi()),
    re_path(r"ws/chart/$", ChartConsumer.as_asgi()),
    re_path(r"ws/charts/$", ChartConsumer.as_asgi()),
]
