from django.urls import path

from .views import (
    AccountOverviewView,
    AccountStreamSnapshotView,
    AdminDashboardDataView,
    CancelContractView,
    DashboardAnalyticsView,
    DerivOTPView,
    MarketDataView,
    MarkupStatisticsView,
    ProposalView,
    ResetDemoBalanceView,
    SellContractView,
    SwitchAccountView,
    TradeView,
)

urlpatterns = [
    path("", TradeView.as_view(), name="trade-execute"),
    path("accounts/", AccountOverviewView.as_view(), name="deriv-accounts"),
    path("accounts/switch/", SwitchAccountView.as_view(), name="deriv-account-switch"),
    path("accounts/<str:account_id>/otp/", DerivOTPView.as_view(), name="deriv-account-otp"),
    path("accounts/<str:account_id>/reset-demo-balance/", ResetDemoBalanceView.as_view(), name="deriv-reset-demo-balance"),
    path("stream/<str:resource>/", AccountStreamSnapshotView.as_view(), name="deriv-account-stream-snapshot"),
    path("markets/<str:resource>/", MarketDataView.as_view(), name="deriv-market-data"),
    path("proposal/", ProposalView.as_view(), name="deriv-proposal"),
    path("contracts/<str:contract_id>/sell/", SellContractView.as_view(), name="deriv-sell-contract"),
    path("contracts/<str:contract_id>/cancel/", CancelContractView.as_view(), name="deriv-cancel-contract"),
    path("analytics/", DashboardAnalyticsView.as_view(), name="deriv-dashboard-analytics"),
    path("markup-statistics/", MarkupStatisticsView.as_view(), name="deriv-markup-statistics"),
    path("admin/dashboard/", AdminDashboardDataView.as_view(), name="profitera-admin-dashboard-data"),
]
