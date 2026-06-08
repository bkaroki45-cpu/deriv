import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

# =========================
# DJANGO SETTINGS
# =========================
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "deriv.settings")

django_asgi_app = get_asgi_application()

# =========================
# WEBSOCKET ROUTES
# =========================

from markets.routing import websocket_urlpatterns as market_routes
from portfolio.routing import websocket_urlpatterns as portfolio_routes


# =========================
# COMBINE ALL ROUTES
# =========================
websocket_urlpatterns = (
    market_routes +
    portfolio_routes
)


# =========================
# APPLICATION ROUTER
# =========================
application = ProtocolTypeRouter({
    "http": django_asgi_app,

    "websocket": URLRouter(
        websocket_urlpatterns
    ),
})
