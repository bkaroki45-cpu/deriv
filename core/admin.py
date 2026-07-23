from django.contrib import admin
from .models import BotTemplate


@admin.register(BotTemplate)
class BotTemplateAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "market", "risk_level", "is_published", "is_featured", "display_order", "updated_at")
    list_filter = ("kind", "is_published", "is_featured", "risk_level")
    search_fields = ("title", "short_description", "market", "tags")
    prepopulated_fields = {"slug": ("title",)}
    list_editable = ("is_published", "is_featured", "display_order")
    fieldsets = (
        ("Card", {"fields": ("title", "slug", "kind", "short_description", "description", "cover_image", "market", "risk_level", "minimum_stake", "tags")}),
        ("Strategy", {"fields": ("strategy_file", "ai_summary", "execution_notes")}),
        ("Publishing", {"fields": ("is_published", "is_featured", "display_order")}),
    )
