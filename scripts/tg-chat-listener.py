#!/usr/bin/env python3
"""
OpenRadar Event-Driven Telegram Listener (Telethon)
===================================================
Streams real-time messages from Telegram channels, supergroups, and discussion
chats directly into OpenRadar (Hub or Node) without polling and without triggering
FloodWait / rate-limits.

Requirements:
    pip install telethon
    pip install ./sdk/python   (or runs with PYTHONPATH=./sdk/python)

Usage:
    # Stream from specific chats to a local or remote node:
    python scripts/tg-chat-listener.py \\
        --api-id 123456 \\
        --api-hash abcdef... \\
        --chats @tildoshnaya,@job_webdev,@freelance_rabota \\
        --node-url http://127.0.0.1:8787 \\
        --node-token <YOUR_RADAR_API_TOKEN> \\
        --source-id <SOURCE_ID>

    # Or stream via an entire Telegram Folder directly to the Hub with a signed key:
    python scripts/tg-chat-listener.py \\
        --api-id 123456 \\
        --api-hash abcdef... \\
        --folder "Radar Orders" \\
        --hub-url https://openradar.fun \\
        --hub-key <RADAR_KEY_NSEC>
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path
from typing import List, Optional, Set

# Ensure local Python SDK is importable even if not installed via pip
ROOT_DIR = Path(__file__).resolve().parent.parent
SDK_DIR = ROOT_DIR / "sdk" / "python"
if str(SDK_DIR) not in sys.path:
    sys.path.insert(0, str(SDK_DIR))

try:
    from openradar import HubClient, Key, NodeClient
    from openradar.telegram import observation_from_telethon
except ImportError as e:
    print(f"Error importing openradar SDK: {e}", file=sys.stderr)
    print("Ensure sdk/python is present or run: pip install ./sdk/python", file=sys.stderr)
    sys.exit(1)

# Default scam/spam stop-words for instant local rejection
DEFAULT_STOP_PATTERNS = [
    re.compile(r"(?:накрутк[а-я]*|подписчик[а-я]*\s+за\s+деньги|отзывы\s+за\s+деньги)", re.I),
    re.compile(r"(?:дроп[а-я]*\s+карты|обнал[а-я]*|верификац[а-я]*\s+(?:кошельк|бирж|авито))", re.I),
    re.compile(r"(?:сигналы\s+крипт|крипто\s*сигналы|арбитраж\s+трафика\s+схема|p2p\s+связк)", re.I),
    re.compile(r"(?:казино\s*онлайн|раскрутка\s*счета|договорные\s*матчи)", re.I),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Stream Telegram messages directly into OpenRadar in real time."
    )
    parser.add_argument(
        "--api-id",
        type=int,
        default=os.getenv("RADAR_TELEGRAM_API_ID"),
        help="Telegram API ID from my.telegram.org (or env RADAR_TELEGRAM_API_ID)",
    )
    parser.add_argument(
        "--api-hash",
        type=str,
        default=os.getenv("RADAR_TELEGRAM_API_HASH"),
        help="Telegram API Hash from my.telegram.org (or env RADAR_TELEGRAM_API_HASH)",
    )
    parser.add_argument(
        "--session",
        type=str,
        default=os.getenv("RADAR_TELEGRAM_SESSION_NAME", "openradar_listener"),
        help="Telethon session file name (default: openradar_listener)",
    )
    parser.add_argument(
        "--chats",
        type=str,
        default="",
        help="Comma-separated list of @channels or -100... chat IDs to monitor",
    )
    parser.add_argument(
        "--folder",
        type=str,
        default="",
        help="Telegram folder name: reads all channels/groups inside this folder",
    )
    parser.add_argument(
        "--hub-url",
        type=str,
        default=os.getenv("RADAR_HUB_URL", "https://openradar.fun"),
        help="OpenRadar Hub URL (default: https://openradar.fun)",
    )
    parser.add_argument(
        "--hub-key",
        type=str,
        default=os.getenv("RADAR_KEY"),
        help="BIP-340 Schnorr private key (nsec...) to sign observations",
    )
    parser.add_argument(
        "--node-url",
        type=str,
        default=os.getenv("RADAR_NODE_URL"),
        help="Direct OpenRadar Node URL (e.g. http://127.0.0.1:8787)",
    )
    parser.add_argument(
        "--node-token",
        type=str,
        default=os.getenv("RADAR_API_TOKEN"),
        help="Node API token for authenticated ingestion",
    )
    parser.add_argument(
        "--source-id",
        type=str,
        default=os.getenv("RADAR_SOURCE_ID"),
        help="Source ID on the node for ingesting leads",
    )
    parser.add_argument(
        "--min-length",
        type=int,
        default=50,
        help="Minimum message text length (default: 50 characters)",
    )
    parser.add_argument(
        "--require-keywords",
        type=str,
        default="",
        help="Comma-separated keywords required in chat posts (e.g. 'вакансия,ищу,заказ,проект')",
    )
    return parser.parse_args()


def is_spam(text: str) -> bool:
    for pattern in DEFAULT_STOP_PATTERNS:
        if pattern.search(text):
            return True
    return False


async def get_folder_chats(client: any, folder_title: str) -> List[any]:
    """Retrieves all chat/channel entities from a Telegram folder by its title."""
    from telethon.tl.functions.messages import GetDialogFiltersRequest
    from telethon.tl.types import DialogFilter, DialogFilterChatlist, InputPeerChannel, InputPeerChat

    res = await client(GetDialogFiltersRequest())
    target_filter = None
    for f in getattr(res, "filters", []):
        if isinstance(f, (DialogFilter, DialogFilterChatlist)):
            title_obj = getattr(f, "title", None)
            title = getattr(title_obj, "text", title_obj) if hasattr(title_obj, "text") else str(title_obj)
            if title.strip() == folder_title.strip():
                target_filter = f
                break

    if not target_filter:
        print(f"Warning: Folder '{folder_title}' not found in Telegram account.", file=sys.stderr)
        return []

    peers = []
    peers.extend(getattr(target_filter, "pinned_peers", []) or [])
    peers.extend(getattr(target_filter, "include_peers", []) or [])

    chats = []
    for peer in peers:
        try:
            entity = await client.get_entity(peer)
            chats.append(entity)
        except Exception as e:
            print(f"Could not resolve peer in folder: {e}", file=sys.stderr)
    return chats


async def main() -> None:
    args = parse_args()

    if not args.api_id or not args.api_hash:
        print("Error: --api-id and --api-hash are required (or set RADAR_TELEGRAM_API_ID/HASH)", file=sys.stderr)
        sys.exit(1)

    try:
        from telethon import TelegramClient, events
    except ImportError:
        print("Error: Telethon is not installed. Run: pip install telethon", file=sys.stderr)
        sys.exit(1)

    # Ingestion destination setup
    hub_client: Optional[HubClient] = None
    node_client: Optional[NodeClient] = None

    if args.node_url and args.source_id and args.node_token:
        print(f"Configured destination: Node at {args.node_url} (source: {args.source_id})")
        node_client = NodeClient(args.node_url, source_id=args.source_id, token=args.node_token)
    elif args.hub_key:
        print(f"Configured destination: Hub at {args.hub_url} (signed with BIP-340 key)")
        hub_client = HubClient(args.hub_url, Key.from_string(args.hub_key))
    else:
        print("Warning: Neither Hub key nor Node credentials provided. Running in DRY-RUN mode (printing only).")

    # Required keywords filter
    required_keywords: Set[str] = set()
    if args.require_keywords:
        required_keywords = {k.strip().lower() for k in args.require_keywords.split(",") if k.strip()}

    client = TelegramClient(args.session, args.api_id, args.api_hash)
    await client.start()
    me = await client.get_me()
    print(f"Logged in to Telegram as: {me.first_name} (@{me.username or me.id})")

    # Prime entity cache so numeric peer IDs (-100...) can be resolved without crashing
    try:
        await client.get_dialogs(limit=100)
    except Exception as e:
        print(f"Dialogs prime note: {e}", file=sys.stderr)

    # Resolve target chats
    target_chats = []
    if args.chats:
        for chat_ref in args.chats.split(","):
            chat_ref = chat_ref.strip()
            if not chat_ref:
                continue
            try:
                # Handle numeric IDs or usernames
                target = int(chat_ref) if chat_ref.startswith("-") or chat_ref.isdigit() else chat_ref
                entity = await client.get_entity(target)
                target_chats.append(entity)
                print(f"Listening to chat: {getattr(entity, 'title', chat_ref)} ({getattr(entity, 'id', '')})")
            except Exception as e:
                print(f"Failed to join/find chat {chat_ref}: {e}", file=sys.stderr)

    if args.folder:
        folder_chats = await get_folder_chats(client, args.folder)
        for entity in folder_chats:
            if entity not in target_chats:
                target_chats.append(entity)
                print(f"Listening to folder chat: {getattr(entity, 'title', '')} ({getattr(entity, 'id', '')})")

    if not target_chats:
        print("No specific chats/folder specified. Listening to ALL joined groups and channels.")
        chat_filter = None
    else:
        print(f"Total monitored chats/channels: {len(target_chats)}")
        chat_filter = target_chats

    @client.on(events.NewMessage(chats=chat_filter))
    async def handler(event: any) -> None:
        message = event.message
        text = (getattr(message, "message", None) or "").strip()

        # 1. Length check
        if len(text) < args.min_length:
            return

        # 2. Local anti-spam check
        if is_spam(text):
            return

        # 3. Required keywords check (if configured)
        if required_keywords:
            text_lower = text.lower()
            if not any(kw in text_lower for kw in required_keywords):
                return

        chat = await event.get_chat()
        sender = await event.get_sender()

        # Build radar/2 observation
        obs = observation_from_telethon(message, chat, sender, min_length=args.min_length)
        if not obs:
            return

        chat_title = getattr(chat, "title", str(getattr(chat, "id", "")))
        first_line = text.split("\n")[0][:80]
        print(f"[{chat_title}] New Lead: {first_line}...")

        # Push observation in background thread so blocking HTTP doesn't stall the Telethon event loop
        try:
            if hub_client:
                results = await asyncio.to_thread(hub_client.observe, [obs])
                print(f" -> Hub Ingested: {results}")
            elif node_client:
                await asyncio.to_thread(node_client.push, [obs])
                print(" -> Node Ingested successfully")
            else:
                print(f" -> [DRY-RUN] Observation: {obs['source']['channel']} / {obs['source'].get('message_id')}")
        except Exception as e:
            print(f"Failed to ingest lead: {e}", file=sys.stderr)

    print("Listener active. Waiting for new messages (Press Ctrl+C to stop)...")
    await client.run_until_disconnected()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nListener stopped.")
