from django.urls import path
from .views import PortfolioView, portfolio_page

urlpatterns = [
    path("", PortfolioView.as_view(), name="portfolio-api"),   # ✅ CLEAN API ROOT
    path("view/", portfolio_page, name="portfolio-page"),      # UI page
]