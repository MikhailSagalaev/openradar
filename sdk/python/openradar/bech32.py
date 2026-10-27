"""bech32 (BIP-173) for nsec / npub keys."""

from __future__ import annotations

from typing import List, Tuple

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _polymod(values: List[int]) -> int:
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if ((top >> i) & 1) else 0
    return chk


def _hrp_expand(hrp: str) -> List[int]:
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def _convert(data: bytes | List[int], frombits: int, tobits: int, pad: bool) -> List[int]:
    acc = bits = 0
    ret: List[int] = []
    maxv = (1 << tobits) - 1
    for value in data:
        acc = (acc << frombits) | value
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad and bits:
        ret.append((acc << (tobits - bits)) & maxv)
    elif not pad and (bits >= frombits or ((acc << (tobits - bits)) & maxv)):
        raise ValueError("invalid padding")
    return ret


def encode(hrp: str, data: bytes) -> str:
    values = _convert(data, 8, 5, True)
    polymod = _polymod(_hrp_expand(hrp) + values + [0] * 6) ^ 1
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + "1" + "".join(CHARSET[d] for d in values + checksum)


def decode(text: str) -> Tuple[str, bytes]:
    text = text.strip().lower()
    pos = text.rfind("1")
    if pos < 1 or pos + 7 > len(text):
        raise ValueError("invalid bech32 string")
    hrp = text[:pos]
    data = [CHARSET.find(c) for c in text[pos + 1 :]]
    if -1 in data or _polymod(_hrp_expand(hrp) + data) != 1:
        raise ValueError("invalid bech32 checksum")
    return hrp, bytes(_convert(data[:-6], 5, 8, False))
