from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import get_wallet


class WalletView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet = get_wallet(request.user)

        return Response({
            "balance": str(wallet.balance),
            "equity": str(wallet.equity),
            "currency": wallet.currency,
        })
