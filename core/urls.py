from django.urls import path
from .views import (
    bot_builder,
    dashboard,
    deriv_login,
    deriv_logout,
    deriv_oauth_callback,
    deriv_register,
    home,
)

urlpatterns = [
    path('', home, name="home"),
    path('dashboard/', dashboard, name="dashboard"),
    path('trade/', dashboard, name="trade"),
    path('analytics/', dashboard, name="analytics"),
    path('account/', dashboard, name="account"),
    path('bot-dashboard/', dashboard, name="bot_dashboard"),
    path('build-bot/', bot_builder, name="build_bot"),
    path('bot-builder/', bot_builder, name="bot_builder"),
    path('auth/deriv/login/', deriv_login, name="deriv_login"),
    path('auth/deriv/register/', deriv_register, name="deriv_register"),
    path('auth/deriv/callback/', deriv_oauth_callback, name="deriv_oauth_callback"),
    path('auth/deriv/logout/', deriv_logout, name="deriv_logout"),
]
