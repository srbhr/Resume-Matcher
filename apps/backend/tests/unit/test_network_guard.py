"""Proves deny_external_network still blocks real traffic after the Windows
socketpair() fix, and that socketpair() itself now works under the guard.

See tests/conftest.py::deny_external_network for the narrow allow-through.
"""

from __future__ import annotations

import socket

import pytest

from tests.conftest import UnexpectedNetworkAccess


def test_socketpair_succeeds_under_the_guard() -> None:
    """The guard must not break asyncio's self-pipe (ProactorEventLoop on Windows)."""
    ssock, csock = socket.socketpair()
    try:
        assert ssock.getsockname() == csock.getpeername()
    finally:
        ssock.close()
        csock.close()


def test_unrelated_loopback_connect_is_still_blocked() -> None:
    """A plain connect to a port nothing is listening on must still be denied.

    This is not the socketpair() emulation pattern (no listener was just
    opened by this call), so it must not be let through.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        with pytest.raises(UnexpectedNetworkAccess):
            sock.connect(("127.0.0.1", 1))  # port 1 (tcpmux): nothing listens here


def test_external_create_connection_is_still_blocked() -> None:
    """A real outbound (non-loopback) connection attempt must still be denied."""
    with pytest.raises(UnexpectedNetworkAccess):
        socket.create_connection(("example.com", 443), timeout=1)
