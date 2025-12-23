from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit, urlunsplit

from fastapi import status

from ..config import Settings
from ..exceptions import BlockedHostError, InvalidUrlError


def normalize_url(url: str) -> str:
    parsed = urlsplit(url)
    cleaned = parsed._replace(fragment="")
    return urlunsplit(cleaned)


def _validate_scheme(parsed, settings: Settings) -> None:
    if parsed.scheme.lower() not in settings.allowed_schemes:
        raise InvalidUrlError("Only http/https URLs are allowed")


def _validate_port(parsed, settings: Settings) -> None:
    port = parsed.port
    if port is None:
        return
    if port not in settings.allowed_ports:
        raise InvalidUrlError(f"Port {port} is not allowed")


def _validate_hostname(hostname: str, settings: Settings) -> None:
    lower_host = hostname.lower()
    if lower_host in settings.blocked_hostnames:
        raise BlockedHostError(f"Hostname {hostname} is blocked")
    if settings.block_internal_suffixes:
        for suffix in settings.blocked_suffixes:
            if lower_host.endswith(suffix):
                raise BlockedHostError(f"Hostname {hostname} is blocked by suffix policy")


def _resolve_ips(hostname: str) -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise BlockedHostError(f"Failed to resolve hostname {hostname}") from exc
    addrs: set[ipaddress.IPv4Address | ipaddress.IPv6Address] = set()
    for info in infos:
        ip_str = info[4][0]
        try:
            addrs.add(ipaddress.ip_address(ip_str))
        except ValueError:
            continue
    return addrs


def _ip_is_blocked(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return bool(
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_reserved
        or ip_obj.is_multicast
    )


def validate_url_target(url: str, settings: Settings) -> str:
    parsed = urlsplit(url)
    if not parsed.scheme or not parsed.netloc:
        raise InvalidUrlError("URL must include scheme and host")

    _validate_scheme(parsed, settings)
    _validate_port(parsed, settings)
    _validate_hostname(parsed.hostname or "", settings)

    ips = _resolve_ips(parsed.hostname or "")
    if not ips:
        raise BlockedHostError(f"Failed to resolve hostname {parsed.hostname or ''}")

    for ip_obj in ips:
        if _ip_is_blocked(ip_obj):
            raise BlockedHostError(f"Resolved IP {ip_obj} is not allowed")

    return urlunsplit(parsed._replace(fragment=""))


def validate_redirect(target_url: str, settings: Settings, redirect_count: int) -> str:
    if redirect_count >= settings.redirect_limit:
        raise InvalidUrlError(
            f"Redirect limit exceeded ({settings.redirect_limit})"
        )
    return validate_url_target(target_url, settings)
