from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import deposit, get_wallet, money, withdraw


class WalletView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet = get_wallet(request.user)

        return Response({
            "balance": str(wallet.balance),
            "equity": str(wallet.equity),
            "currency": wallet.currency,
        })


class DepositView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        wallet = get_wallet(request.user)
        try:
            amount = money(request.data.get("amount"))
            transaction = deposit(wallet, amount)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "message": "Deposit successful",
            "transaction_id": transaction.id,
            "balance": str(transaction.wallet.balance),
        })


class WithdrawView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        wallet = get_wallet(request.user)
        try:
            amount = money(request.data.get("amount"))
            transaction = withdraw(wallet, amount)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "message": "Withdraw successful",
            "transaction_id": transaction.id,
            "balance": str(transaction.wallet.balance),
        })
