"""Configurable, bounded request timeout (issue #776).

The improve/tailor request timeout must be env-configurable (slow local LLMs
need more than 240s) but bounded so a stuck request can't hold a worker
indefinitely, and robust to blank/garbage env values (which must not crash
startup).
"""

from app.config import Settings


class TestRequestTimeoutSetting:
    def test_default_is_240(self):
        assert Settings.model_fields["request_timeout_seconds"].default == 240

    def test_clamps_below_minimum(self):
        assert Settings(request_timeout_seconds=5).request_timeout_seconds == 30

    def test_clamps_above_maximum(self):
        assert Settings(request_timeout_seconds=99999).request_timeout_seconds == 1800

    def test_accepts_in_range(self):
        assert Settings(request_timeout_seconds=900).request_timeout_seconds == 900

    def test_blank_string_falls_back_to_default(self):
        # A blank env var (REQUEST_TIMEOUT_SECONDS=) must not crash; defaults to 240.
        assert Settings(request_timeout_seconds="").request_timeout_seconds == 240

    def test_garbage_falls_back_to_default(self):
        assert Settings(request_timeout_seconds="abc").request_timeout_seconds == 240

    def test_float_string_is_coerced(self):
        assert Settings(request_timeout_seconds="300.0").request_timeout_seconds == 300
