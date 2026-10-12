from django.db import migrations, models


def create_high_digit_pair_bot(apps, schema_editor):
    AutomationBot = apps.get_model("trading", "AutomationBot")
    AutomationBot.objects.using(schema_editor.connection.alias).update_or_create(
        name="High Digit Pair Over 2",
        defaults={
            "description": "Scans every Volatility market for rare 0, 1, and 2 digits, then buys Over 2 after two consecutive 7, 8, or 9 digits.",
            "strategy": "high_pair",
            "enabled": True,
            "demo_only": True,
            "live_trading_enabled": False,
        },
    )


def remove_high_digit_pair_bot(apps, schema_editor):
    AutomationBot = apps.get_model("trading", "AutomationBot")
    AutomationBot.objects.using(schema_editor.connection.alias).filter(
        name="High Digit Pair Over 2",
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("trading", "0008_even_odd_pair_recovery")]

    operations = [
        migrations.AlterField(
            model_name="automationbot",
            name="strategy",
            field=models.CharField(
                choices=[
                    ("auto", "Automatic digit scanner"),
                    ("even_odd", "Even/Odd pair recovery"),
                    ("high_pair", "High Digit Pair Over 2"),
                ],
                default="auto",
                max_length=12,
            ),
        ),
        migrations.AlterField(
            model_name="automationrun",
            name="strategy",
            field=models.CharField(
                choices=[
                    ("auto", "Automatic"),
                    ("over_2", "Over 2"),
                    ("under_7", "Under 7"),
                    ("even_odd", "Even/Odd"),
                    ("high_pair", "High Digit Pair Over 2"),
                ],
                default="over_2",
                max_length=12,
            ),
        ),
        migrations.RunPython(create_high_digit_pair_bot, remove_high_digit_pair_bot),
    ]