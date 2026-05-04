"""Unit tests for ATS scorer service — pure logic, no LLM calls."""

import pytest
from app.services.ats_scorer import (
    _clamp_scores,
    _determine_decision,
    _pad_warning_flags,
)
from app.schemas.ats import ScoreBreakdown


class TestClampScores:
    def test_clamps_skills_match_to_30(self):
        result = _clamp_scores({
            "skills_match": 40, "experience_match": 0,
            "domain_match": 0, "tools_match": 0, "achievement_match": 0,
        })
        assert result.skills_match == 30.0

    def test_clamps_experience_match_to_25(self):
        result = _clamp_scores({
            "skills_match": 0, "experience_match": 35,
            "domain_match": 0, "tools_match": 0, "achievement_match": 0,
        })
        assert result.experience_match == 25.0

    def test_clamps_domain_match_to_20(self):
        result = _clamp_scores({
            "skills_match": 0, "experience_match": 0,
            "domain_match": 99, "tools_match": 0, "achievement_match": 0,
        })
        assert result.domain_match == 20.0

    def test_clamps_tools_match_to_15(self):
        result = _clamp_scores({
            "skills_match": 0, "experience_match": 0,
            "domain_match": 0, "tools_match": 50, "achievement_match": 0,
        })
        assert result.tools_match == 15.0

    def test_clamps_achievement_match_to_10(self):
        result = _clamp_scores({
            "skills_match": 0, "experience_match": 0,
            "domain_match": 0, "tools_match": 0, "achievement_match": 99,
        })
        assert result.achievement_match == 10.0

    def test_recalculates_total_after_clamping(self):
        result = _clamp_scores({
            "skills_match": 30, "experience_match": 25,
            "domain_match": 20, "tools_match": 15, "achievement_match": 10,
        })
        assert result.total == 100.0

    def test_handles_missing_keys_as_zero(self):
        result = _clamp_scores({})
        assert result.total == 0.0

    def test_returns_score_breakdown_instance(self):
        result = _clamp_scores({
            "skills_match": 10, "experience_match": 10,
            "domain_match": 10, "tools_match": 5, "achievement_match": 5,
        })
        assert isinstance(result, ScoreBreakdown)
        assert result.total == 40.0


class TestDetermineDecision:
    def test_75_is_pass(self):
        assert _determine_decision(75.0) == "PASS"

    def test_100_is_pass(self):
        assert _determine_decision(100.0) == "PASS"

    def test_74_is_borderline(self):
        assert _determine_decision(74.0) == "BORDERLINE"

    def test_60_is_borderline(self):
        assert _determine_decision(60.0) == "BORDERLINE"

    def test_59_is_reject(self):
        assert _determine_decision(59.0) == "REJECT"

    def test_0_is_reject(self):
        assert _determine_decision(0.0) == "REJECT"


class TestPadWarningFlags:
    def test_pads_to_10_on_reject_with_few_flags(self):
        flags = ["flag1", "flag2"]
        result = _pad_warning_flags(flags, "REJECT")
        assert len(result) >= 10

    def test_does_not_pad_on_pass(self):
        flags = ["flag1"]
        result = _pad_warning_flags(flags, "PASS")
        assert result == ["flag1"]

    def test_does_not_pad_on_borderline(self):
        flags = ["flag1", "flag2"]
        result = _pad_warning_flags(flags, "BORDERLINE")
        assert result == ["flag1", "flag2"]

    def test_does_not_duplicate_existing_flags(self):
        flags = ["Missing quantified achievements in work experience"]
        result = _pad_warning_flags(flags, "REJECT")
        lower = [f.lower() for f in result]
        assert lower.count("missing quantified achievements in work experience") == 1

    def test_does_not_pad_when_already_10_or_more(self):
        flags = [f"flag{i}" for i in range(12)]
        result = _pad_warning_flags(flags, "REJECT")
        assert len(result) == 12

    def test_preserves_original_flags_at_start(self):
        flags = ["original flag 1", "original flag 2"]
        result = _pad_warning_flags(flags, "REJECT")
        assert result[0] == "original flag 1"
        assert result[1] == "original flag 2"
