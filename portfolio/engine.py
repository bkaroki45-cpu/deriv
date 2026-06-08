from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def broadcast_portfolio_update(data):
    channel_layer = get_channel_layer()

    async_to_sync(channel_layer.group_send)(
        "portfolio_updates",
        {
            "type": "portfolio_update",
            "data": data
        }
    )