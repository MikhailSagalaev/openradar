"""Telegram -> radar/2 observation, for Telethon or Pyrogram messages.

No Telegram library is imported: the functions read the usual attributes.

    from telethon import TelegramClient, events
    from openradar import HubClient, Key
    from openradar.telegram import observation_from_telethon

    hub = HubClient("https://openradar.fun", Key.from_string(os.environ["RADAR_KEY"]))

    @client.on(events.NewMessage(chats=CHANNELS))
    async def handler(event):
        chat = await event.get_chat()
        sender = await event.get_sender()
        obs = observation_from_telethon(event.message, chat, sender)
        if obs:
            hub.observe([obs])
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _iso(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return None


def _visibility(chat: Any) -> str:
    return "public" if getattr(chat, "username", None) else "private"


def observation_from_telethon(message: Any, chat: Any, sender: Any = None, min_length: int = 40) -> Optional[Dict[str, Any]]:
    """Builds an observation; None for short or empty messages."""
    text = (getattr(message, "message", None) or getattr(message, "text", None) or "").strip()
    if len(text) < min_length:
        return None
    chat_id = getattr(chat, "id", None)
    if chat_id is None:
        return None
    # Telethon gives channels a positive id; the Bot API form is -100<id>.
    channel = f"-100{chat_id}" if getattr(chat, "broadcast", False) or getattr(chat, "megagroup", False) else str(chat_id)
    username = getattr(chat, "username", None)
    url = f"https://t.me/{username}/{message.id}" if username else None
    author: Dict[str, Any] = {}
    if sender is not None:
        handle = getattr(sender, "username", None)
        name = " ".join(filter(None, [getattr(sender, "first_name", None), getattr(sender, "last_name", None)])) or getattr(sender, "title", None)
        if name:
            author["name"] = name
        if handle:
            author["handle"] = f"@{handle}"
            author["contacts"] = [{"type": "telegram", "value": f"@{handle}"}]
    return {
        "schema": "radar/2.observation",
        "source": {
            "platform": "telegram",
            "channel": channel,
            "channel_title": getattr(chat, "title", None),
            "visibility": _visibility(chat),
            "message_id": str(message.id),
            "url": url,
        },
        "posted_at": _iso(getattr(message, "date", None)),
        "edited_at": _iso(getattr(message, "edit_date", None)),
        "author": author or None,
        "text": text[:20000],
    }


def observation_from_pyrogram(message: Any, min_length: int = 40) -> Optional[Dict[str, Any]]:
    """Pyrogram keeps chat and sender on the message; chat ids are already in the -100 form."""
    chat = getattr(message, "chat", None)
    text = (getattr(message, "text", None) or getattr(message, "caption", None) or "").strip()
    if chat is None or len(text) < min_length:
        return None
    sender = getattr(message, "from_user", None) or getattr(message, "sender_chat", None)
    username = getattr(chat, "username", None)
    author: Dict[str, Any] = {}
    if sender is not None:
        handle = getattr(sender, "username", None)
        name = " ".join(filter(None, [getattr(sender, "first_name", None), getattr(sender, "last_name", None)])) or getattr(sender, "title", None)
        if name:
            author["name"] = name
        if handle:
            author["handle"] = f"@{handle}"
            author["contacts"] = [{"type": "telegram", "value": f"@{handle}"}]
    message_id = getattr(message, "id", None) or getattr(message, "message_id", None)
    return {
        "schema": "radar/2.observation",
        "source": {
            "platform": "telegram",
            "channel": str(chat.id),
            "channel_title": getattr(chat, "title", None),
            "visibility": "public" if username else "private",
            "message_id": str(message_id),
            "url": f"https://t.me/{username}/{message_id}" if username else None,
        },
        "posted_at": _iso(getattr(message, "date", None)),
        "edited_at": _iso(getattr(message, "edit_date", None)),
        "author": author or None,
        "text": text[:20000],
    }
