from django.contrib import admin

from .models import ActivityLog, DerivAccount, OAuthToken, Referral, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "email", "deriv_connected", "is_staff", "date_joined")
    search_fields = ("username", "email", "phone")


@admin.register(DerivAccount)
class DerivAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "account_id", "account_type", "currency", "balance", "is_active")
    list_filter = ("account_type", "is_active", "currency")
    search_fields = ("user__username", "account_id")


@admin.register(OAuthToken)
class OAuthTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "token_type", "is_valid", "last_validated_at", "updated_at")
    list_filter = ("token_type", "is_valid")
    search_fields = ("user__username", "user__email")


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ("user", "affiliate_token", "utm_source", "utm_campaign", "utm_medium", "created_at")
    search_fields = ("affiliate_token", "utm_source", "utm_campaign", "user__email")


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("user", "action", "ip_address", "created_at")
    search_fields = ("action", "user__username", "user__email")
