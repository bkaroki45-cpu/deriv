from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("portfolio", "0002_trade_stop_loss_trade_take_profit_trade_updated_at_and_more")]

    operations = [
        migrations.AddField(model_name="trade", name="contract_type", field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name="trade", name="duration", field=models.PositiveIntegerField(blank=True, null=True)),
        migrations.AddField(model_name="trade", name="duration_unit", field=models.CharField(blank=True, max_length=10)),
    ]
