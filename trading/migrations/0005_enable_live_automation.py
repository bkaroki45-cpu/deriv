from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("trading", "0004_automationrun_digit_thresholds")]

    operations = [
        migrations.AddField(
            model_name="automationbot",
            name="live_trading_enabled",
            field=models.BooleanField(default=False, help_text="Allow users to explicitly opt into real-account automation for this bot."),
        ),
        migrations.AddField(
            model_name="automationrun",
            name="live_trading_confirmed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(
            lambda apps, schema_editor: apps.get_model("trading", "AutomationBot").objects.get_or_create(
                name="AI Digit Market Analyst",
                defaults={
                    "description": "Adaptive statistical signal scanner for Over 2 and Under 7. It ranks every selected volatility market before entering.",
                    "enabled": True,
                    "live_trading_enabled": True,
                    "demo_only": False,
                },
            ),
            migrations.RunPython.noop,
        ),
    ]
