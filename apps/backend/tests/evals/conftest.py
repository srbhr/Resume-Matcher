"""Explicitly enable sockets only for deliberately selected, paid eval cases."""

import os
import socket
from typing import Any

import pytest

_SOCKET_CONNECT = socket.socket.connect
_SOCKET_CONNECT_EX = socket.socket.connect_ex
_CREATE_CONNECTION = socket.create_connection


@pytest.fixture(autouse=True)
def paid_eval_network(
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
    deny_external_network: Any,
) -> None:
    del deny_external_network
    if (
        request.node.get_closest_marker("eval")
        and os.environ.get("RM_RUN_PAID_EVAL") == "1"
    ):
        monkeypatch.setattr(socket.socket, "connect", _SOCKET_CONNECT)
        monkeypatch.setattr(socket.socket, "connect_ex", _SOCKET_CONNECT_EX)
        monkeypatch.setattr(socket, "create_connection", _CREATE_CONNECTION)
