import json
import os
import sys
import unittest
from types import SimpleNamespace
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from openradar import Key, observation_event, signal_event, verify_event, http_auth_header  # noqa: E402
from openradar import bip340  # noqa: E402
from openradar.telegram import observation_from_telethon  # noqa: E402


class Bip340Vectors(unittest.TestCase):
    # Test vectors 0 and 1 from BIP-340.
    def test_vector_0(self):
        sec = bytes.fromhex("0000000000000000000000000000000000000000000000000000000000000003")
        self.assertEqual(bip340.pubkey_from_secret(sec).hex().upper(), "F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9")
        sig = bip340.sign(bytes(32), sec, bytes(32))
        self.assertEqual(
            sig.hex().upper(),
            "E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0",
        )

    def test_vector_1(self):
        sec = bytes.fromhex("B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF")
        msg = bytes.fromhex("243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89")
        aux = bytes.fromhex("0000000000000000000000000000000000000000000000000000000000000001")
        sig = bip340.sign(msg, sec, aux)
        self.assertEqual(
            sig.hex().upper(),
            "6896BD60EEAE296DB48A229FF71DFE071BDE413E6D43F917DC8DCF8C78DE33418906D11AC976ABCCB20B091292BFF4EA897EFCB639EA871CFA95F6DE339E4B0A",
        )
        self.assertTrue(bip340.verify(msg, bip340.pubkey_from_secret(sec), sig))
        self.assertFalse(bip340.verify(msg, bip340.pubkey_from_secret(sec), sig[:-1] + bytes([sig[-1] ^ 1])))


class Events(unittest.TestCase):
    def test_keys_roundtrip(self):
        key = Key.generate()
        self.assertEqual(Key.from_string(key.nsec).pubkey, key.pubkey)
        self.assertEqual(Key.from_string(key.secret.hex()).pubkey, key.pubkey)
        self.assertTrue(key.npub.startswith("npub1"))

    def test_observation_event_drops_raw_and_verifies(self):
        key = Key.generate()
        event = observation_event(key, {
            "source": {"platform": "telegram", "channel": "-100123", "visibility": "private", "message_id": 5},
            "text": "Ищем дизайнера «под ключ» — бюджет 50 000 ₽",
            "raw": {"secret": 1},
        })
        self.assertTrue(verify_event(event))
        self.assertNotIn("secret", event["content"])
        self.assertIn(["msg", "5"], event["tags"])
        tampered = dict(event, content=event["content"].replace("50", "60"))
        self.assertFalse(verify_event(tampered))

    def test_signal_and_auth(self):
        key = Key.generate()
        self.assertTrue(verify_event(signal_event(key, "lead-1", "useful", "ответили")))
        with self.assertRaises(ValueError):
            signal_event(key, "lead-1", "like")
        header = http_auth_header(key, "https://hub.example/v2/me", "GET")
        self.assertTrue(header.startswith("Nostr "))


class Telegram(unittest.TestCase):
    def test_telethon_message(self):
        chat = SimpleNamespace(id=1234567890, broadcast=True, username=None, title="Закрытый канал")
        sender = SimpleNamespace(username="irina_hr", first_name="Ирина", last_name=None)
        message = SimpleNamespace(id=48213, message="Ищем React-разработчика, TypeScript, удалённо, 250 000 ₽",
                                  date=datetime(2026, 10, 26, 11, 2, tzinfo=timezone.utc), edit_date=None)
        obs = observation_from_telethon(message, chat, sender)
        self.assertEqual(obs["source"]["channel"], "-1001234567890")
        self.assertEqual(obs["source"]["visibility"], "private")
        self.assertEqual(obs["author"]["contacts"], [{"type": "telegram", "value": "@irina_hr"}])
        self.assertEqual(obs["posted_at"], "2026-10-26T11:02:00Z")
        self.assertIsNone(observation_from_telethon(SimpleNamespace(id=1, message="hi"), chat))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--emit":
        # Used by test/sdk.test.ts: print signed events for the TypeScript verifier.
        key = Key.generate()
        obs = {"source": {"platform": "telegram", "channel": "-100777", "visibility": "private", "message_id": "1"},
               "text": "Нужен бэкендер на Go, удалённо, 300 000 ₽. Пишите @go_hr — «срочно» ",
               "author": {"handle": "@go_hr"}}
        print(json.dumps({"pubkey": key.pubkey, "events": [observation_event(key, obs), signal_event(key, "x", "junk")],
                          "auth": http_auth_header(key, "http://localhost/v2/me", "GET")}))
    else:
        unittest.main()
