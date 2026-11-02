from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("trading", "0011_automationtrade_result_digit")]

    operations = [
        migrations.AlterField(
            model_name="automationbot",
            name="demo_only",
            field=models.BooleanField(
                default=True,
                help_text="Keep this bot restricted to Demo accounts, even when live trading is enabled.",
            ),
        ),
    ]
