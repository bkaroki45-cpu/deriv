from django.contrib import admin

from .models import Trade


@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = [
        "id", "user", "symbol", "direction", "stake",
        "profit", "status", "contract_id", "created_at",
    ]
    list_filter = ["status", "direction", "symbol", "created_at"]
    search_fields = ["user__username", "symbol", "contract_id"]
    ordering = ["-created_at"]
