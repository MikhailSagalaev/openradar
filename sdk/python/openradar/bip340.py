"""BIP-340 Schnorr signatures over secp256k1, pure Python.

Follows the reference implementation in BIP-340. Signing uses fresh auxiliary
randomness. Slow compared to libsecp256k1, but fast enough for a parser that
signs a few events per second. Install `coincurve` and pass `signer=` to the
client if you need more.
"""

from __future__ import annotations

import hashlib
import os
from typing import Optional, Tuple

P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)

Point = Optional[Tuple[int, int]]


def _tagged_hash(tag: str, msg: bytes) -> bytes:
    tag_hash = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(tag_hash + tag_hash + msg).digest()


def _add(p1: Point, p2: Point) -> Point:
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    if p1[0] == p2[0] and p1[1] != p2[1]:
        return None
    if p1 == p2:
        lam = (3 * p1[0] * p1[0] * pow(2 * p1[1], P - 2, P)) % P
    else:
        lam = ((p2[1] - p1[1]) * pow(p2[0] - p1[0], P - 2, P)) % P
    x3 = (lam * lam - p1[0] - p2[0]) % P
    return (x3, (lam * (p1[0] - x3) - p1[1]) % P)


def _mul(p: Point, n: int) -> Point:
    r: Point = None
    for i in range(256):
        if (n >> i) & 1:
            r = _add(r, p)
        p = _add(p, p)
    return r


def _bytes_from_int(x: int) -> bytes:
    return x.to_bytes(32, "big")


def _int(b: bytes) -> int:
    return int.from_bytes(b, "big")


def _lift_x(x: int) -> Point:
    if x >= P:
        return None
    y_sq = (pow(x, 3, P) + 7) % P
    y = pow(y_sq, (P + 1) // 4, P)
    if pow(y, 2, P) != y_sq:
        return None
    return (x, y if y & 1 == 0 else P - y)


def pubkey_from_secret(seckey: bytes) -> bytes:
    d = _int(seckey)
    if not 1 <= d <= N - 1:
        raise ValueError("secret key out of range")
    point = _mul(G, d)
    assert point is not None
    return _bytes_from_int(point[0])


def sign(msg: bytes, seckey: bytes, aux_rand: Optional[bytes] = None) -> bytes:
    """Signs a 32-byte message (here: the event id)."""
    if len(msg) != 32:
        raise ValueError("message must be 32 bytes")
    aux = os.urandom(32) if aux_rand is None else aux_rand
    d0 = _int(seckey)
    if not 1 <= d0 <= N - 1:
        raise ValueError("secret key out of range")
    point = _mul(G, d0)
    assert point is not None
    d = d0 if point[1] % 2 == 0 else N - d0
    t = bytes(a ^ b for a, b in zip(_bytes_from_int(d), _tagged_hash("BIP0340/aux", aux)))
    k0 = _int(_tagged_hash("BIP0340/nonce", t + _bytes_from_int(point[0]) + msg)) % N
    if k0 == 0:
        raise RuntimeError("bad nonce")
    r = _mul(G, k0)
    assert r is not None
    k = k0 if r[1] % 2 == 0 else N - k0
    e = _int(_tagged_hash("BIP0340/challenge", _bytes_from_int(r[0]) + _bytes_from_int(point[0]) + msg)) % N
    sig = _bytes_from_int(r[0]) + _bytes_from_int((k + e * d) % N)
    if not verify(msg, _bytes_from_int(point[0]), sig):
        raise RuntimeError("signature self-check failed")
    return sig


def verify(msg: bytes, pubkey: bytes, sig: bytes) -> bool:
    if len(msg) != 32 or len(pubkey) != 32 or len(sig) != 64:
        return False
    point = _lift_x(_int(pubkey))
    r = _int(sig[:32])
    s = _int(sig[32:])
    if point is None or r >= P or s >= N:
        return False
    e = _int(_tagged_hash("BIP0340/challenge", sig[:32] + pubkey + msg)) % N
    rp = _add(_mul(G, s), _mul(point, N - e))
    return rp is not None and rp[1] % 2 == 0 and rp[0] == r
