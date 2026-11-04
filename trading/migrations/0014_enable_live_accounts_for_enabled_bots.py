from django.db import migrations


def enable_live_accounts_for_enabled_bots(apps, schema_editor):
    AutomationBot = apps.get_model("trading", "AutomationBot")
    AutomationBot.objects.filter(enabled=True).update(
        demo_only=False,
        live_trading_enabled=True,
    )


def restore_demo_only_for_enabled_bots(apps, schema_editor):
    AutomationBot = apps.get_model("trading", "AutomationBot")
    AutomationBot.objects.filter(enabled=True).update(
        demo_only=True,
        live_trading_enabled=False,
    )


class Migration(migrations.Migration):
    dependencies = [("trading", "0013_enable_ai_digit_live_trading")]

    operations = [
        migrations.RunPython(
            enable_live_accounts_for_enabled_bots,
            restore_demo_only_for_enabled_bots,
        ),
    ]
