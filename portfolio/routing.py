from django.urls import re_path
from .consumer import PortfolioConsumer

websocket_urlpatterns = [
    re_path(r"ws/portfolio/$", PortfolioConsumer.as_asgi()),
]
