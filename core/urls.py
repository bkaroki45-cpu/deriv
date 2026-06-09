from django.urls import path
from .views import home, dashboard, bot_builder

urlpatterns = [
    path('', home),
    path('dashboard/', dashboard),
    path('trade/', dashboard),
    path('analytics/', dashboard),
    path('account/', dashboard),
    path('bot-dashboard/', dashboard),
    path('build-bot/', bot_builder),
    path('bot-builder/', bot_builder),
]
