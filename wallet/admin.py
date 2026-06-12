from django.contrib import admin

from .models import Wallet, WalletTransaction


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ["user", "balance", "equity", "currency", "updated_at"]
    search_fields = ["user__username", "user__email"]


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ["wallet", "amount", "type", "description", "created_at"]
    list_filter = ["type", "created_at"]
    ordering = ["-created_at"]
