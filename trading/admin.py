from django.contrib import admin

from .models import AutomationBot, AutomationRun, AutomationTrade, Commission, Portfolio, TradingLog, Transaction

@admin.register(AutomationBot)
class AutomationBotAdmin(admin.ModelAdmin):
    list_display = ("name", "enabled", "live_trading_enabled", "demo_only", "max_stake", "max_daily_loss", "max_trades_per_day")
    list_editable = ("enabled", "live_trading_enabled")

@admin.register(AutomationRun)
class AutomationRunAdmin(admin.ModelAdmin):
    list_display = ("user", "bot", "account", "strategy", "status", "selected_symbol", "updated_at")
    list_filter = ("status", "strategy", "bot")
    readonly_fields = ("stats", "active_contract_id", "error_message")

@admin.register(AutomationTrade)
class AutomationTradeAdmin(admin.ModelAdmin):
    list_display = ("run", "symbol", "strategy", "trigger_digit", "contract_id", "stake", "status", "profit", "opened_at")
    list_filter = ("status", "strategy")


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
