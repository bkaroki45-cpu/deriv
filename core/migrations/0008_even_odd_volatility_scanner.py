from django.db import migrations


def update_even_odd_scanner(apps, schema_editor):
    database = schema_editor.connection.alias
    AutomationBot = apps.get_model("trading", "AutomationBot")
    BotTemplate = apps.get_model("core", "BotTemplate")

    AutomationBot.objects.using(database).filter(strategy="even_odd").update(
        name="Even/Odd Volatility Scanner",
        description="Scans all active Volatility markets and trades the leading even or odd parity only when it reaches at least 51% of the latest 1,000 ticks.",
    )
    BotTemplate.objects.using(database).filter(slug="even-odd-pair-recovery").update(
        title="Even/Odd Volatility Scanner",
        short_description="Scans all Volatility markets and trades the leading parity when it reaches 51% or more.",
        description="A demo-only parity scanner that ranks every active Volatility market by the gap between its even and odd digits.",
        tags="Even/Odd,Volatility scan,51% minimum,Demo only,Recovery staking",
        ai_summary="Compares the even and odd shares in the latest 1,000 ticks across all available Volatility markets. It selects the market with the largest parity gap and trades the leading side only when that side is at least 51%.",
        execution_notes="Select a demo account, starting stake, total capital limit, and recovery limits. The bot scans every active Volatility market, waits when the strongest parity share is below 51%, and trades the leading parity on the selected market when the threshold is met.",
    )


def restore_even_odd_pair_bot(apps, schema_editor):
    database = schema_editor.connection.alias
    AutomationBot = apps.get_model("trading", "AutomationBot")
    BotTemplate = apps.get_model("core", "BotTemplate")

    AutomationBot.objects.using(database).filter(strategy="even_odd").update(
        name="Even / Odd Pair Recovery",
        description="Scans one selected Volatility index and trades the opposite parity after two consecutive same-parity digits. Stops after a win or configured risk limits.",
    )
    BotTemplate.objects.using(database).filter(slug="even-odd-pair-recovery").update(
        title="Even/Odd Pair Recovery",
        short_description="Trades the opposite parity after two consecutive even or odd digits.",
        description="A standalone, demo-only parity recovery bot with configurable stake and risk limits.",
        tags="Even/Odd,Pair recovery,Demo only,Recovery staking",
        ai_summary="Waits for two consecutive digits with the same parity, then trades the opposite parity.",
        execution_notes="Select a demo account, volatility index, stake, capital limit, and maximum recovery retries before starting. The bot stops after a win or when a configured risk limit is reached.",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0007_high_digit_pair_martingale"),
        ("trading", "0010_even_odd_scanner_label"),
    ]

    operations = [
        migrations.RunPython(update_even_odd_scanner, restore_even_odd_pair_bot),
    ]
