from django.urls import path
from .views import home, dashboard

urlpatterns = [
    path('', home),
    path('dashboard/', dashboard),
]