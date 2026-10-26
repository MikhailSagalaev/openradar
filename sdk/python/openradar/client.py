"""radar/2 client: keys, signed events and HTTP calls to a hub or a node.

Only the standard library is used. See docs/PROTOCOL.md in the repository.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

from . import bech32, bip340

PROTOCOL_VERSION = "radar/2"
KIND_OBSERVATION = 4040
KIND_SIGNAL = 4041
KIND_STATUS = 4042
KIND_PROFILE = 30440
KIND_HTTP_AUTH = 27235

SIGNALS = ("useful", "junk", "scam", "closed")
STATUSES = ("deleted", "edited", "closed")


class RadarError(Exception):
    def __init__(self, status: int, body: Any):
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


@dataclass(frozen=True)
class Key:
    """A participant key. The rating on the hub is bound to `pubkey`."""

    secret: bytes

    @classmethod
    def generate(cls) -> "Key":
        while True:
            candidate = os.urandom(32)
            if 1 <= int.from_bytes(candidate, "big") < bip340.N:
                return cls(candidate)

    @classmethod
    def from_string(cls, value: str) -> "Key":
        """Accepts 64 hex characters or an `nsec1...` string."""
        value = value.strip()
        if value.startswith("nsec1"):
            hrp, data = bech32.decode(value)
            if hrp != "nsec" or len(data) != 32:
                raise ValueError("not an nsec key")
            return cls(data)
        raw = bytes.fromhex(value)
        if len(raw) != 32:
            raise ValueError("secret key must be 32 bytes")
        return cls(raw)

    @property
    def pubkey(self) -> str:
        return bip340.pubkey_from_secret(self.secret).hex()

    @property
    def nsec(self) -> str:
        return bech32.encode("nsec", self.secret)

    @property
    def npub(self) -> str:
        return bech32.encode("npub", bytes.fromhex(self.pubkey))


def _serialize(pubkey: str, created_at: int, kind: int, tags: List[List[str]], content: str) -> str:
    # NIP-01: compact JSON, UTF-8, same escaping as JSON.stringify for the characters that matter.
    return json.dumps([0, pubkey, created_at, kind, tags, content], separators=(",", ":"), ensure_ascii=False)


def sign_event(key: Key, kind: int, tags: List[List[str]], content: str, created_at: Optional[int] = None) -> Dict[str, Any]:
    created = int(time.time()) if created_at is None else int(created_at)
    pubkey = key.pubkey
    event_id = hashlib.sha256(_serialize(pubkey, created, kind, tags, content).encode("utf-8")).digest()
    sig = bip340.sign(event_id, key.secret)
    return {
        "id": event_id.hex(),
        "pubkey": pubkey,
        "created_at": created,
        "kind": kind,
        "tags": tags,
        "content": content,
        "sig": sig.hex(),
    }


def verify_event(event: Dict[str, Any]) -> bool:
    try:
        event_id = hashlib.sha256(
            _serialize(event["pubkey"], event["created_at"], event["kind"], event["tags"], event["content"]).encode("utf-8")
        ).digest()
        return event_id.hex() == event["id"] and bip340.verify(event_id, bytes.fromhex(event["pubkey"]), bytes.fromhex(event["sig"]))
    except (KeyError, ValueError, TypeError):
        return False


def observation_event(key: Key, observation: Dict[str, Any], created_at: Optional[int] = None) -> Dict[str, Any]:
    """kind 4040. `raw` is dropped: it stays with you."""
    body = {k: v for k, v in observation.items() if k != "raw"}
    body.setdefault("schema", "radar/2.observation")
    source = body["source"]
    tags = [
        ["v", PROTOCOL_VERSION],
        ["src", f"{source['platform']},{source['channel']}"],
        ["vis", source.get("visibility") or "public"],
    ]
    if source.get("message_id") is not None:
        tags.append(["msg", str(source["message_id"])])
    return sign_event(key, KIND_OBSERVATION, tags, json.dumps(body, ensure_ascii=False, separators=(",", ":")), created_at)


def signal_event(key: Key, lead_id: str, signal: str, comment: str = "", created_at: Optional[int] = None) -> Dict[str, Any]:
    if signal not in SIGNALS:
        raise ValueError(f"signal must be one of {SIGNALS}")
    tags = [["v", PROTOCOL_VERSION], ["lead", lead_id], ["signal", signal]]
    return sign_event(key, KIND_SIGNAL, tags, comment[:500], created_at)


def status_event(key: Key, platform: str, channel: str, message_id: str, status: str, created_at: Optional[int] = None) -> Dict[str, Any]:
    if status not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}")
    tags = [["v", PROTOCOL_VERSION], ["src", f"{platform},{channel}"], ["msg", str(message_id)], ["status", status]]
    return sign_event(key, KIND_STATUS, tags, "", created_at)


def profile_event(key: Key, profile: Dict[str, Any]) -> Dict[str, Any]:
    return sign_event(key, KIND_PROFILE, [], json.dumps(profile, ensure_ascii=False))


def http_auth_header(key: Key, url: str, method: str, body: Optional[bytes] = None) -> str:
    tags = [["u", url], ["method", method.upper()]]
    if body:
        tags.append(["payload", hashlib.sha256(body).hexdigest()])
    event = sign_event(key, KIND_HTTP_AUTH, tags, "")
    return "Nostr " + base64.b64encode(json.dumps(event, separators=(",", ":")).encode("utf-8")).decode("ascii")


def _request(url: str, method: str, body: Optional[bytes], headers: Dict[str, str], timeout: float) -> Any:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            text = res.read().decode("utf-8")
            content_type = res.headers.get("content-type", "")
    except urllib.error.HTTPError as err:
        payload = err.read().decode("utf-8", "replace")
        try:
            raise RadarError(err.code, json.loads(payload)) from None
        except json.JSONDecodeError:
            raise RadarError(err.code, payload) from None
    if "ndjson" in content_type:
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    return json.loads(text) if text else None


class HubClient:
    """Talks to the hub (or any node in hub mode) with a participant key."""

    def __init__(self, url: str, key: Key, timeout: float = 30.0):
        self.url = url.rstrip("/")
        self.key = key
        self.timeout = timeout

    def _call(self, method: str, path: str, payload: Any = None, signed: bool = True) -> Any:
        url = self.url + path
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"accept": "application/json"}
        if body is not None:
            headers["content-type"] = "application/json"
        if signed:
            headers["authorization"] = http_auth_header(self.key, url, method, body)
        return _request(url, method, body, headers, self.timeout)

    def send(self, events: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """POST /v2/events in batches of 500; returns one result per event."""
        results: List[Dict[str, Any]] = []
        batch: List[Dict[str, Any]] = []
        for event in events:
            batch.append(event)
            if len(batch) == 500:
                results.extend(self._call("POST", "/v2/events", batch, signed=False)["results"])
                batch = []
        if batch:
            results.extend(self._call("POST", "/v2/events", batch, signed=False)["results"])
        return results

    def observe(self, observations: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return self.send(observation_event(self.key, o) for o in observations)

    def signal(self, lead_id: str, signal: str, comment: str = "") -> Dict[str, Any]:
        return self.send([signal_event(self.key, lead_id, signal, comment)])[0]

    def status(self, platform: str, channel: str, message_id: str, status: str) -> Dict[str, Any]:
        return self.send([status_event(self.key, platform, channel, message_id, status)])[0]

    def set_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        return self.send([profile_event(self.key, profile)])[0]

    def me(self) -> Dict[str, Any]:
        return self._call("GET", "/v2/me")

    def feed(self, cursor: Optional[str] = None, limit: int = 50, q: Optional[str] = None, type: Optional[str] = None) -> Dict[str, Any]:
        params = [f"limit={int(limit)}"]
        if cursor:
            params.append(f"cursor={urllib.request.quote(cursor)}")
        if q:
            params.append(f"q={urllib.request.quote(q)}")
        if type:
            params.append(f"type={urllib.request.quote(type)}")
        return self._call("GET", "/v2/feed?" + "&".join(params))

    def lead(self, lead_id: str) -> Dict[str, Any]:
        return self._call("GET", f"/v2/leads/{urllib.request.quote(lead_id, safe='')}")


class NodeClient:
    """Pushes observations to your own node through a webhook source token."""

    def __init__(self, url: str, source_id: str, token: str, timeout: float = 30.0):
        self.url = url.rstrip("/")
        self.source_id = source_id
        self.token = token
        self.timeout = timeout

    def push(self, observations: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        items = list(observations)
        summary: Dict[str, Any] = {"received": 0, "accepted": 0, "duplicate": 0, "rejected": 0, "outcomes": []}
        for start in range(0, len(items), 500):
            body = json.dumps(items[start : start + 500], ensure_ascii=False).encode("utf-8")
            res = _request(
                f"{self.url}/api/v2/ingest/{urllib.request.quote(self.source_id, safe='')}",
                "POST",
                body,
                {"content-type": "application/json", "x-radar-token": self.token},
                self.timeout,
            )
            for k in ("received", "accepted", "duplicate", "rejected"):
                summary[k] += res.get(k, 0)
            summary["outcomes"].extend(res.get("outcomes", []))
        return summary
