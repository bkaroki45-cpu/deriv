from django.contrib import admin
from django.urls import path, include
from portfolio.views import portfolio_page

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounts/', include('accounts.urls')),
    path('api/trading/', include('trading.urls')),
    path('', include('core.urls')),
    path("markets/", include("markets.urls")),
    path("portfolio/", portfolio_page, name="portfolio-page"),
    path("api/portfolio/", include("portfolio.urls")),
    path("api/wallet/", include("wallet.urls")),
]
