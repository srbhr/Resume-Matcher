from app.core.redaction import redact


def test_redact_email_and_phone():
    text = "Contact me at john.doe@example.com or +1 415 555 1234"
    masked = redact(text)
    assert "john.doe@example.com" not in masked
    # ensure phone sequence not present
    assert "+1 415 555 1234" not in masked
    assert "<email:redacted>" in masked
    assert "<phone:redacted>" in masked


def test_redact_idempotent_on_already_masked():
    once = redact("<email:redacted> <phone:redacted>")
    twice = redact(once)
    assert once == twice
