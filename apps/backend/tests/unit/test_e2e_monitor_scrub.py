"""Offline tests for the e2e_monitor secret scrubber."""

from __future__ import annotations

from e2e_monitor.scrub import scrub_text, scrub_config


def test_scrub_text_redacts_sk_keys() -> None:
    out = scrub_text("authorization: Bearer sk-abcdef0123456789ABCDEF more")
    assert "sk-abcdef0123456789ABCDEF" not in out
    assert "[REDACTED]" in out


def test_scrub_text_redacts_long_hex_and_jwt() -> None:
    out = scrub_text("token=eyJhbGciOi.JOIN.payloadsig key=0123456789abcdef0123456789abcdef")
    assert "eyJhbGciOi" not in out
    assert "0123456789abcdef0123456789abcdef" not in out


def test_scrub_text_redacts_google_and_bearer() -> None:
    out = scrub_text("key=AIzaSyA1234567890abcdefghijklmnopqrstuv0 auth: Bearer abc.def-123_xyz")
    assert "AIzaSyA1234567890abcdefghijklmnopqrstuv0" not in out
    assert "Bearer abc.def-123_xyz" not in out
    assert "[REDACTED]" in out


def test_scrub_config_redacts_key_fields_keeps_provider() -> None:
    cfg = {
        "provider": "anthropic",
        "model": "claude-haiku-4-5",
        "api_key": "sk-ant-secret-value-here",
        "api_keys": {"openai": "sk-openai-secret", "anthropic": "sk-ant-x"},
        "api_base": "http://localhost:11434",
    }
    out = scrub_config(cfg)
    assert out["provider"] == "anthropic"
    assert out["model"] == "claude-haiku-4-5"
    assert out["api_key"] == "[REDACTED]"
    assert out["api_keys"]["openai"] == "[REDACTED]"
    assert out["api_keys"]["anthropic"] == "[REDACTED]"
    assert out["api_base"] == "http://localhost:11434"
    assert cfg["api_key"] == "sk-ant-secret-value-here"
