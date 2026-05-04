"""Unit tests for synonym normalization."""
import pytest
from app.utils.synonyms import normalize


class TestNormalize:
    def test_product_owner_to_product_manager(self):
        result = normalize("We need a Product Owner with 3 years")
        assert "product manager" in result.lower()

    def test_case_insensitive_ml(self):
        result = normalize("ML experience required")
        assert "machine learning" in result.lower()

    def test_kpi_expansion(self):
        result = normalize("Must track KPIs quarterly")
        assert "key performance indicator" in result.lower()

    def test_okr_expansion(self):
        result = normalize("Set OKRs with the team")
        assert "objective and key result" in result.lower()

    def test_b2b_expansion(self):
        result = normalize("B2B SaaS background preferred")
        assert "business to business" in result.lower()

    def test_gtm_expansion(self):
        result = normalize("Lead the GTM strategy")
        assert "go-to-market" in result.lower()

    def test_ux_expansion(self):
        result = normalize("Strong UX skills needed")
        assert "user experience" in result.lower()

    def test_does_not_mangle_unrelated_text(self):
        text = "Experienced software engineer building great products"
        result = normalize(text)
        assert "software engineer building great products" in result.lower()

    def test_empty_string(self):
        assert normalize("") == ""

    def test_po_abbreviation(self):
        result = normalize("Hiring a PO for our team")
        assert "product manager" in result.lower()

    def test_does_not_corrupt_email_with_ai(self):
        result = normalize("Contact ai@example.com for details")
        assert "ai@example.com" in result

    def test_ai_standalone_expands(self):
        result = normalize("Strong AI background required")
        assert "artificial intelligence" in result.lower()
