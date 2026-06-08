from django.urls import path
from .views import WalletView, DepositView, WithdrawView

urlpatterns = [
    path("", WalletView.as_view()),
    path("deposit/", DepositView.as_view()),
    path("withdraw/", WithdrawView.as_view()),
]