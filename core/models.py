from django.db import models
from django.utils.text import slugify


class BotTemplate(models.Model):
    class BotKind(models.TextChoices):
        DERIV = "deriv", "Deriv strategy"
        AI = "ai", "AI-assisted strategy"

    title = models.CharField(max_length=120)
    slug = models.SlugField(unique=True, blank=True)
    kind = models.CharField(max_length=12, choices=BotKind.choices, default=BotKind.DERIV)
    short_description = models.CharField(max_length=220)
    description = models.TextField(blank=True)
    strategy_file = models.FileField(upload_to="bot_templates/", blank=True, help_text="Upload a Deriv Bot XML strategy file.")
    cover_image = models.ImageField(upload_to="bot_covers/", blank=True)
    market = models.CharField(max_length=80, blank=True)
    risk_level = models.CharField(max_length=24, blank=True, help_text="For example: Low, Medium, High")
    minimum_stake = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tags = models.CharField(max_length=180, blank=True, help_text="Comma-separated labels shown on the card.")
    ai_summary = models.TextField(blank=True, help_text="What the AI analyses and how it supports this strategy.")
    execution_notes = models.TextField(blank=True, help_text="Required safeguards, limits, and execution notes.")
    launch_url = models.CharField(max_length=240, blank=True, help_text="Optional internal destination, for example /automation/ for a managed bot.")
    is_published = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_order", "-is_featured", "title")

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title) or "bot"
            slug = base
            counter = 2
            while type(self).objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title
