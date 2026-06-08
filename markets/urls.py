from django.urls import path
from .views import chart_page

urlpatterns = [
    path("chart/", chart_page),
]