from django.db import migrations


def update_high_digit_pair_card(apps, schema_editor):
    BotTemplate = apps.get_model("core", "BotTemplate")
    BotTemplate.objects.using(schema_editor.connection.alias).filter(
        slug="high-digit-pair-over-2",
    ).update(
        execution_notes="Choose a demo account, starting stake, martingale multiplier, and maximum recovery retries. After a loss the same Over 2 contract is retried at the multiplied stake; scanning resumes after a win, and the run stops when retries are exhausted.",
    )


class Migration(migrations.Migration):
    dependencies = [("core", "0006_high_digit_pair_library")]

    operations = [
        migrations.RunPython(update_high_digit_pair_card, migrations.RunPython.noop),
    ]