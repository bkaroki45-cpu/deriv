from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.shortcuts import redirect, render
from django.urls import path, reverse

from .models import BotExecution, BotTemplate


class BotUploadForm(forms.ModelForm):
    EXTENSIONS = {
        BotTemplate.BotFileType.PYTHON: (".py",),
        BotTemplate.BotFileType.ZIP: (".zip",),
        BotTemplate.BotFileType.JSON: (".json",),
        BotTemplate.BotFileType.YAML: (".yaml", ".yml"),
        BotTemplate.BotFileType.TOML: (".toml",),
    }

    class Meta:
        model = BotTemplate
        fields = ("title", "short_description", "category", "risk_level", "cover_image", "bot_file_type", "python_file", "is_published")
        labels = {"title": "Bot Name", "short_description": "Description", "python_file": "Bot File"}
        widgets = {"short_description": forms.Textarea(attrs={"rows": 4})}

    def clean_python_file(self):
        uploaded = self.cleaned_data["python_file"]
        file_type = self.cleaned_data.get("bot_file_type")
        extensions = self.EXTENSIONS.get(file_type, ())
        if not uploaded.name.lower().endswith(extensions):
            expected = "/".join(extensions)
            raise ValidationError(f"Bot File must match the selected file type ({expected}).")
        return uploaded


@admin.register(BotTemplate)
class BotTemplateAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "kind", "risk_level", "is_published", "is_enabled", "is_featured", "display_order", "updated_at")
    list_filter = ("kind", "is_published", "is_enabled", "is_featured", "risk_level", "category")
    search_fields = ("title", "short_description", "market", "category", "tags")
    prepopulated_fields = {"slug": ("title",)}
    list_editable = ("is_published", "is_enabled", "is_featured", "display_order")
    change_list_template = "admin/core/bottemplate/change_list.html"
    fieldsets = (
        ("Card", {"fields": ("title", "slug", "kind", "short_description", "description", "cover_image", "category", "market", "risk_level", "minimum_stake", "tags")}),
        ("Strategy", {"fields": ("strategy_file", "bot_file_type", "python_file", "ai_summary", "execution_notes", "launch_url")}),
        ("Publishing", {"fields": ("is_published", "is_enabled", "is_featured", "display_order")}),
    )

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path("bot-upload/", self.admin_site.admin_view(self.bot_upload), name="core_bottemplate_bot_upload"),
        ]
        return custom + urls

    def bot_upload(self, request):
        if request.method == "POST":
            form = BotUploadForm(request.POST, request.FILES)
            if form.is_valid():
                bot = form.save(commit=False)
                bot.kind = BotTemplate.BotKind.AI
                bot.description = bot.short_description
                bot.save()
                self.message_user(request, f'"{bot.title}" was uploaded and registered.', messages.SUCCESS)
                return redirect(reverse("admin:core_bottemplate_changelist"))
        else:
            form = BotUploadForm()
        return render(request, "admin/core/bottemplate/bot_upload.html", {
            **self.admin_site.each_context(request),
            "title": "Bot Upload",
            "form": form,
            "opts": self.model._meta,
        })


@admin.register(BotExecution)
class BotExecutionAdmin(admin.ModelAdmin):
    list_display = ("bot", "user", "account_id", "mode", "pid", "status", "started_at")
    list_filter = ("status", "mode")
    search_fields = ("bot__title", "user__username", "account_id")
    readonly_fields = ("bot", "user", "account_id", "mode", "pid", "status", "started_at")

    def has_add_permission(self, request):
        return False
