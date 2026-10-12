from django.db import migrations


def publish_even_odd_bot(apps, schema_editor):
    database = schema_editor.connection.alias
    AutomationBot = apps.get_model("trading", "AutomationBot")
    BotTemplate = apps.get_model("core", "BotTemplate")

    automation_bot = AutomationBot.objects.using(database).filter(
        name="Even / Odd Pair Recovery",
        strategy="even_odd",
    ).first()
    if automation_bot is None:
        return

    BotTemplate.objects.using(database).update_or_create(
        slug="even-odd-pair-recovery",
        defaults={
            "title": "Even/Odd Pair Recovery",
            "kind": "ai",
            "short_description": "Trades the opposite parity after two consecutive even or odd digits.",
            "description": "A standalone, demo-only parity recovery bot with configurable stake and risk limits.",
            "category": "Digit automation",
            "market": "Volatility Indices",
            "risk_level": "High",
            "minimum_stake": "0.35",
            "tags": "Even/Odd,Pair recovery,Demo only,Recovery staking",
            "ai_summary": "Waits for two consecutive digits with the same parity, then trades the opposite parity.",
            "execution_notes": "Select a demo account, volatility index, stake, capital limit, and maximum recovery retries before starting. The bot stops after a win or when a configured risk limit is reached.",
            "launch_url": f"/automation/?bot={automation_bot.pk}",
            "is_published": True,
            "is_enabled": True,
            "is_featured": True,
            "display_order": 1,
        },
    )


def remove_even_odd_bot_card(apps, schema_editor):
    BotTemplate = apps.get_model("core", "BotTemplate")
    BotTemplate.objects.using(schema_editor.connection.alias).filter(
        slug="even-odd-pair-recovery",
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_bot_file_types"),
        ("trading", "0008_even_odd_pair_recovery"),
    ]

    operations = [
        migrations.RunPython(publish_even_odd_bot, remove_even_odd_bot_card),
    ]