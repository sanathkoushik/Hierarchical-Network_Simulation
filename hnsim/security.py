"""Security Module: authenticated encryption, tagging and verification.

Each customer gets its own 256-bit key derived with SHA-256 from a master
secret shared with the headquarters (a simulation shortcut; no key exchange is
modelled). The packet header (source, destination, sequence number) is bound
to the ciphertext as associated data, so changing either the payload or the
header makes verification fail at the headquarters.
"""
import hashlib
import os
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM, ChaCha20Poly1305

CIPHERS = ("chacha20-poly1305", "aes-gcm")


class IntegrityError(Exception):
    """Raised when the authentication tag does not verify."""


@dataclass(frozen=True)
class SealedPacket:
    source: str
    destination: str
    seq: int
    nonce: bytes
    data: bytes  # ciphertext with the 16-byte tag appended

    @property
    def aad(self):
        return f"{self.source}>{self.destination}#{self.seq}".encode()

    @property
    def fingerprint(self):
        return hashlib.sha256(self.data).hexdigest()[:12]

    def flipped(self, index=0):
        """Copy of this packet with one ciphertext bit flipped (an attacker)."""
        buf = bytearray(self.data)
        buf[index % len(buf)] ^= 0x01
        return SealedPacket(self.source, self.destination, self.seq, self.nonce, bytes(buf))


class SecurityModule:
    def __init__(self, cipher="chacha20-poly1305", master_key=None):
        if cipher not in CIPHERS:
            raise ValueError(f"unknown cipher {cipher!r}")
        self.cipher = cipher
        self._master = master_key or os.urandom(32)

    def _aead(self, node):
        key = hashlib.sha256(self._master + node.encode()).digest()
        return ChaCha20Poly1305(key) if self.cipher == "chacha20-poly1305" else AESGCM(key)

    @staticmethod
    def _nonce(seq):
        # sequence numbers are unique per run, so a nonce is never reused
        # with a different plaintext under the same key
        return seq.to_bytes(12, "big")

    def seal(self, source, destination, seq, payload):
        nonce = self._nonce(seq)
        pkt = SealedPacket(source, destination, seq, nonce, b"")
        data = self._aead(source).encrypt(nonce, payload, pkt.aad)
        return SealedPacket(source, destination, seq, nonce, data)

    def open(self, pkt):
        """Verify the tag, then decrypt. Raises IntegrityError on any mismatch."""
        try:
            return self._aead(pkt.source).decrypt(pkt.nonce, pkt.data, pkt.aad)
        except InvalidTag as exc:
            raise IntegrityError("authentication tag mismatch") from exc
