from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounts/', include('accounts.urls')),
    path('api/trading/', include('trading.urls')),
    path('', include('core.urls')),
    path("api/portfolio/", include("portfolio.urls")),
    path("api/wallet/", include("wallet.urls")),
]
