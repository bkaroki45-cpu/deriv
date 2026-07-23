from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='BotTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=120)), ('slug', models.SlugField(blank=True, unique=True)),
                ('kind', models.CharField(choices=[('deriv', 'Deriv strategy'), ('ai', 'AI-assisted strategy')], default='deriv', max_length=12)),
                ('short_description', models.CharField(max_length=220)), ('description', models.TextField(blank=True)),
                ('strategy_file', models.FileField(blank=True, upload_to='bot_templates/')),
                ('cover_image', models.ImageField(blank=True, upload_to='bot_covers/')),
                ('market', models.CharField(blank=True, max_length=80)), ('risk_level', models.CharField(blank=True, max_length=24)),
                ('minimum_stake', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('tags', models.CharField(blank=True, max_length=180)), ('ai_summary', models.TextField(blank=True)),
                ('execution_notes', models.TextField(blank=True)), ('is_published', models.BooleanField(default=False)),
                ('is_featured', models.BooleanField(default=False)), ('display_order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ], options={'ordering': ('display_order', '-is_featured', 'title')},
        ),
    ]
