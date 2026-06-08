from django.shortcuts import render

# Create your views here.
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Wallet
from .services import deposit, withdraw


class WalletView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):

        wallet = Wallet.objects.get(user=request.user)

        return Response({
            "balance": str(wallet.balance),
            "equity": str(wallet.equity),
            "currency": wallet.currency,
        })


class DepositView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):

        wallet = Wallet.objects.get(user=request.user)
        amount = float(request.data.get("amount"))

        deposit(wallet, amount)

        return Response({"message": "Deposit successful"})


class WithdrawView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):

        wallet = Wallet.objects.get(user=request.user)
        amount = float(request.data.get("amount"))

        withdraw(wallet, amount)

        return Response({"message": "Withdraw successful"})