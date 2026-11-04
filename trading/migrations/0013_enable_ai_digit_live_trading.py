from django.db import migrations


def enable_ai_digit_live_trading(apps, schema_editor):
    AutomationBot = apps.get_model("trading", "AutomationBot")
    AutomationBot.objects.filter(name="AI Digit Market Analyst").update(
        enabled=True,
        demo_only=False,
        live_trading_enabled=True,
    )


def restore_ai_digit_demo_only(apps, schema_editor):
    AutomationBot = apps.get_model("trading", "AutomationBot")
    AutomationBot.objects.filter(name="AI Digit Market Analyst").update(
        demo_only=True,
        live_trading_enabled=False,
    )


class Migration(migrations.Migration):
    dependencies = [("trading", "0012_automationbot_demo_only_editable")]

    operations = [
        migrations.RunPython(enable_ai_digit_live_trading, restore_ai_digit_demo_only),
    ]
