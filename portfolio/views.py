from django.shortcuts import render

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Trade


# =========================
# 📊 PORTFOLIO API VIEW
# =========================
class PortfolioView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):

        trades = Trade.objects.filter(user=request.user).order_by("-created_at")

        data = []

        for t in trades:
            data.append({
                "id": t.id,
                "symbol": t.symbol,
                "direction": t.direction,

                "stake": str(t.stake),

                # safe null handling (VERY IMPORTANT)
                "entry_price": str(t.entry_price) if t.entry_price else None,
                "exit_price": str(t.exit_price) if t.exit_price else None,

                "profit": str(t.profit),
                "status": t.status,

                "contract_id": t.contract_id,

                "created_at": t.created_at.isoformat() if t.created_at else None,
                "closed_at": t.closed_at.isoformat() if t.closed_at else None,
            })

        return Response({
            "count": len(data),
            "trades": data
        })


# =========================
# 🖥️ PORTFOLIO PAGE (UI)
# =========================
def portfolio_page(request):
    return render(request, "portfolio/portfolio.html")