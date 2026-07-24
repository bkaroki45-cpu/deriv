from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("trading", "0005_enable_live_automation")]
    operations = [
        migrations.AlterField(
            model_name="automationrun", name="strategy",
            field=models.CharField(choices=[("auto", "Automatic"), ("over_2", "Over 2"), ("under_7", "Under 7")], default="over_2", max_length=12),
        ),
    ]
