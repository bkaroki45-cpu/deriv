from django.urls import path

from .views import TradeView

urlpatterns = [
    path("", TradeView.as_view(), name="trade-execute"),
]
