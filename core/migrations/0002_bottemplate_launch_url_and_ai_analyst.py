from django.db import migrations, models


def add_ai_analyst(apps, schema_editor):
    BotTemplate = apps.get_model("core", "BotTemplate")
    BotTemplate.objects.get_or_create(
        slug="ai-digit-market-analyst",
        defaults={
            "title": "AI Digit Market Analyst",
            "kind": "ai",
            "short_description": "Ranks live volatility-index digit signals and opens only the strongest configured opportunity.",
            "description": "A managed, adaptive statistical bot. Configure it in Profiteraa, then start or stop it from your dashboard.",
            "market": "Volatility Indices",
            "risk_level": "User configured",
            "minimum_stake": "0.35",
            "tags": "AI-assisted,Live metrics,Over 2,Under 7",
            "ai_summary": "Continuously scores market imbalance, trigger-digit rarity, and the fit to your selected strategy.",
            "execution_notes": "Users choose demo or, after explicit confirmation, their linked real account and their own limits.",
            "launch_url": "/automation/",
            "is_published": True,
            "is_featured": True,
            "display_order": 0,
        },
    )


class Migration(migrations.Migration):
    dependencies = [("core", "0001_bottemplate")]

    operations = [
        migrations.AlterField(
            model_name="bottemplate", name="strategy_file",
            field=models.FileField(blank=True, help_text="Upload a Deriv Bot XML strategy file.", upload_to="bot_templates/"),
        ),
        migrations.AlterField(
            model_name="bottemplate", name="risk_level",
            field=models.CharField(blank=True, help_text="For example: Low, Medium, High", max_length=24),
        ),
        migrations.AlterField(
            model_name="bottemplate", name="tags",
            field=models.CharField(blank=True, help_text="Comma-separated labels shown on the card.", max_length=180),
        ),
        migrations.AlterField(
            model_name="bottemplate", name="ai_summary",
            field=models.TextField(blank=True, help_text="What the AI analyses and how it supports this strategy."),
        ),
        migrations.AlterField(
            model_name="bottemplate", name="execution_notes",
            field=models.TextField(blank=True, help_text="Required safeguards, limits, and execution notes."),
        ),
        migrations.AddField(
            model_name="bottemplate",
            name="launch_url",
            field=models.CharField(blank=True, help_text="Optional internal destination, for example /automation/ for a managed bot.", max_length=240),
        ),
        migrations.RunPython(add_ai_analyst, migrations.RunPython.noop),
    ]
