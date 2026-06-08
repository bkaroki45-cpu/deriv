from django.shortcuts import render

def home(request):
    return render(request, "core/home.html")


def dashboard(request):
    wallet = getattr(request.user, "wallet", None) if request.user.is_authenticated else None
    return render(request, "core/dashboard.html", {
        "wallet": wallet,
        "demo_balance": "10000.00",
        "real_balance": getattr(wallet, "balance", "0.00") if wallet else "0.00",
    })
