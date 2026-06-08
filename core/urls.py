from django.urls import path
from .views import home, dashboard

urlpatterns = [
    path('', home),
    path('dashboard/', dashboard),
    path('trade/', dashboard),
    path('analytics/', dashboard),
    path('account/', dashboard),
    path('bot-dashboard/', dashboard),
    path('build-bot/', dashboard),
]
