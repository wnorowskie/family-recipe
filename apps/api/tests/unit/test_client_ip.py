"""Unit tests for client_ip_from_forwarded_for() — the X-Forwarded-For trust
logic behind _client_ip (issue #246).

The security property under test: a client-supplied *leading* XFF entry can
never become the resolved IP. We resolve by counting `trusted_proxy_hops`
entries from the RIGHT, because the trusted proxies always append to the tail
of the chain.
"""
import pytest

from src.utils import client_ip_from_forwarded_for


class TestNoTrustedProxies:
    """hops == 0 → local/dev: XFF is ignored entirely, direct peer wins."""

    def test_direct_connection_no_xff(self):
        assert client_ip_from_forwarded_for(None, "203.0.113.9", 0) == "203.0.113.9"

    def test_xff_present_is_ignored_when_untrusted(self):
        # A client sending XFF with no proxy in front must not be believed.
        assert (
            client_ip_from_forwarded_for("6.6.6.6", "203.0.113.9", 0)
            == "203.0.113.9"
        )

    def test_negative_hops_treated_as_untrusted(self):
        assert client_ip_from_forwarded_for("6.6.6.6", "10.0.0.1", -1) == "10.0.0.1"


class TestSingleTrustedProxy:
    """hops == 1 → one proxy appends the real client; it is the last entry."""

    def test_returns_last_entry(self):
        assert (
            client_ip_from_forwarded_for("203.0.113.9", "10.0.0.1", 1)
            == "203.0.113.9"
        )

    def test_spoofed_leading_entry_is_ignored(self):
        # Client sent "6.6.6.6"; the single trusted proxy appended the real IP.
        assert (
            client_ip_from_forwarded_for("6.6.6.6, 203.0.113.9", "10.0.0.1", 1)
            == "203.0.113.9"
        )


class TestTwoHopChain:
    """hops == 2 → the #241 deployed topology (GFE(Next) + GFE(FastAPI))."""

    def test_returns_client_before_the_two_trusted_entries(self):
        # [real-client, next-egress] as appended by the two Google front-ends.
        assert (
            client_ip_from_forwarded_for("203.0.113.9, 10.8.0.2", "10.0.0.1", 2)
            == "203.0.113.9"
        )

    def test_spoofed_leading_entry_is_ignored(self):
        # Attacker prepends 6.6.6.6; the two trusted appends push it left, so
        # parts[-2] is still the real client.
        assert (
            client_ip_from_forwarded_for(
                "6.6.6.6, 203.0.113.9, 10.8.0.2", "10.0.0.1", 2
            )
            == "203.0.113.9"
        )

    def test_multiple_spoofed_entries_still_ignored(self):
        assert (
            client_ip_from_forwarded_for(
                "1.1.1.1, 2.2.2.2, 203.0.113.9, 10.8.0.2", "10.0.0.1", 2
            )
            == "203.0.113.9"
        )


class TestShortChainFallback:
    """A chain shorter than the trusted-hop count is malformed → direct peer."""

    def test_chain_shorter_than_hops_falls_back(self):
        # Expected 2 trusted entries but only one present — do not trust it.
        assert (
            client_ip_from_forwarded_for("6.6.6.6", "10.0.0.1", 2) == "10.0.0.1"
        )

    def test_empty_header_falls_back(self):
        assert client_ip_from_forwarded_for("", "10.0.0.1", 2) == "10.0.0.1"

    def test_whitespace_only_entries_ignored(self):
        # ", ," has no real entries → too short → fall back.
        assert client_ip_from_forwarded_for(" , ", "10.0.0.1", 2) == "10.0.0.1"

    def test_no_direct_host_returns_none(self):
        assert client_ip_from_forwarded_for(None, None, 2) is None


class TestParsing:
    def test_strips_surrounding_whitespace(self):
        assert (
            client_ip_from_forwarded_for("203.0.113.9 ,  10.8.0.2", "10.0.0.1", 2)
            == "203.0.113.9"
        )

    @pytest.mark.parametrize("hops", [1, 2, 3])
    def test_exact_length_chain_returns_leading_trusted_entry(self, hops):
        # When the client sent nothing, the chain is exactly `hops` trusted
        # entries and parts[-hops] is the outermost one (the real client).
        parts = [f"10.0.0.{i}" for i in range(hops)]
        header = ", ".join(parts)
        assert (
            client_ip_from_forwarded_for(header, "192.168.0.1", hops) == parts[0]
        )
