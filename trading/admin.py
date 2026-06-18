from django.contrib import admin

from .models import Commission, Portfolio, TradingLog, Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("user", "account_id", "transaction_id", "action", "amount", "currency", "created_at")
    search_fields = ("user__username", "account_id", "transaction_id", "action")


@admin.register(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ("user", "account_id", "contract_id", "symbol", "status", "profit", "updated_at")
    list_filter = ("status", "symbol")
    search_fields = ("user__username", "account_id", "contract_id", "symbol")


@admin.register(Commission)
class CommissionAdmin(admin.ModelAdmin):
    list_display = ("user", "account_id", "amount", "currency", "trade_volume", "period", "created_at")
    search_fields = ("user__username", "account_id", "period")


@admin.register(TradingLog)
class TradingLogAdmin(admin.ModelAdmin):
    list_display = ("user", "action", "account_id", "symbol", "contract_id", "status", "created_at")
    search_fields = ("action", "account_id", "symbol", "contract_id")
