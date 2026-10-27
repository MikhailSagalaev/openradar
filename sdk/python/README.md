# openradar (Python SDK)

Send job and gig posts from any parser to an OpenRadar node or to the hub, using the radar/2 protocol ([docs/PROTOCOL.md](../../docs/PROTOCOL.md)). Standard library only; Python 3.9+.

```bash
pip install "git+https://github.com/MikhailSagalaev/openradar#subdirectory=sdk/python"
# or, from a clone of the repository:
pip install ./sdk/python
```

## Key

Your hub rating is bound to a key. Create one once and keep the nsec secret:

```python
from openradar import Key
key = Key.generate()
print(key.nsec, key.pubkey)
```

or `radar key` on a node.

## Hub

```python
import os
from openradar import HubClient, Key

hub = HubClient("https://openradar.fun", Key.from_string(os.environ["RADAR_KEY"]))
results = hub.observe([{
    "source": {"platform": "telegram", "channel": "-1001234567890", "channel_title": "Frontend jobs",
               "visibility": "private", "message_id": "48213"},
    "posted_at": "2026-10-26T11:02:00Z",
    "author": {"handle": "@irina_hr"},
    "text": "Ищем React-разработчика...",
    "type": "job",
}])
print(results)          # [{'status': 'accepted', 'leadId': '...', 'merged': False}]
print(hub.me())         # rating, tier, ledger
hub.signal(results[0]["leadId"], "useful")
```

`raw` is never sent. The account your parser reads a channel with is not part of the protocol.

## Your own node

```python
from openradar import NodeClient
node = NodeClient("http://127.0.0.1:8787", source_id="...", token="...")
node.push([...observations...])
```

## Telegram

`openradar.telegram.observation_from_telethon(message, chat, sender)` and `observation_from_pyrogram(message)` turn a message into an observation (no Telegram library is imported). Example with Telethon:

```python
from telethon import TelegramClient, events
from openradar.telegram import observation_from_telethon

@client.on(events.NewMessage(chats=CHANNELS))
async def on_message(event):
    obs = observation_from_telethon(event.message, await event.get_chat(), await event.get_sender())
    if obs:
        hub.observe([obs])
```

## Tests

```bash
python -m unittest discover -s sdk/python/tests
```

Signing is pure Python BIP-340 (checked against the BIP test vectors); it is slow but enough for a few events per second.
