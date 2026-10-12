from django.db import migrations


def publish_high_digit_pair_bot(apps, schema_editor):
    database = schema_editor.connection.alias
    AutomationBot = apps.get_model("trading", "AutomationBot")
    BotTemplate = apps.get_model("core", "BotTemplate")

    automation_bot = AutomationBot.objects.using(database).filter(
        name="High Digit Pair Over 2",
        strategy="high_pair",
    ).first()
    if automation_bot is None:
        return

    BotTemplate.objects.using(database).update_or_create(
        slug="high-digit-pair-over-2",
        defaults={
            "title": "High Digit Pair Over 2",
            "kind": "ai",
            "short_description": "Scans all Volatility markets for rare 0/1/2 digits, then waits for two 7/8/9 digits in a row.",
            "description": "A separate demo-only bot that buys one-tick Over 2 after its distribution screen and high-digit pair trigger both qualify.",
            "category": "Digit automation",
            "market": "All Volatility Indices",
            "risk_level": "High",
            "minimum_stake": "0.35",
            "tags": "Digits 0/1/2 below 10%,Dominant digit 5-9,Two high digits,Over 2,Demo only",
            "ai_summary": "Checks the latest 1,000 ticks on each available Volatility market. All of digits 0, 1, and 2 must each be below 10%, and the most frequent digit must be from 5 through 9.",
            "execution_notes": "After a market qualifies, waits for two consecutive 7, 8, or 9 ticks (including mixed pairs such as 7 then 9) and buys one Over 2 contract. Demo account only; configure a capital limit and daily risk limits before starting.",
            "launch_url": f"/automation/?bot={automation_bot.pk}",
            "is_published": True,
            "is_enabled": True,
            "is_featured": True,
            "display_order": 2,
        },
    )


def remove_high_digit_pair_bot_card(apps, schema_editor):
    BotTemplate = apps.get_model("core", "BotTemplate")
    BotTemplate.objects.using(schema_editor.connection.alias).filter(
        slug="high-digit-pair-over-2",
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_even_odd_pair_recovery_library"),
        ("trading", "0009_high_digit_pair_bot"),
    ]

    operations = [
        migrations.RunPython(publish_high_digit_pair_bot, remove_high_digit_pair_bot_card),
    ]