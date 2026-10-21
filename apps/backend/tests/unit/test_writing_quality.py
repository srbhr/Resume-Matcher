"""Writing rules, score and the rewrite fact check (no LLM)."""

from app.services.writing_quality import (
    check_writing,
    fact_violations,
    hard_paths,
    iter_writing_units,
    scrub_em_dashes,
    writing_report,
    writing_score,
)


def _resume(*bullets: str, summary: str = "", styles: list[str] | None = None) -> dict:
    entry: dict = {"title": "Engineer", "company": "Acme", "description": list(bullets)}
    if styles is not None:
        entry["descriptionStyles"] = styles
    return {"summary": summary, "workExperience": [entry]}


def _rules(data: dict, language: str = "en") -> set[tuple[str, str]]:
    return {(f.path, f.rule) for f in check_writing(data, language)}


def test_units_cover_summary_and_bullets_but_skip_plain_rows() -> None:
    data = _resume(
        "Built X", "Heading", summary="Engineer.", styles=["bullet", "plain"]
    )
    assert list(iter_writing_units(data)) == [
        ("summary", "Engineer."),
        ("workExperience[0].description[0]", "Built X"),
    ]


def test_em_dash_and_double_hyphen_are_hard() -> None:
    data = _resume(
        "Built the API — used by 3 teams", "Cut costs -- 20%", "Built a co-op tool"
    )
    rules = _rules(data)
    assert ("workExperience[0].description[0]", "em_dash") in rules
    assert ("workExperience[0].description[1]", "em_dash") in rules
    assert ("workExperience[0].description[2]", "em_dash") not in rules
    assert hard_paths(check_writing(data)) == [
        "workExperience[0].description[0]",
        "workExperience[0].description[1]",
    ]


def test_weak_openers_are_hard_and_strong_verbs_are_not() -> None:
    data = _resume(
        "Responsible for the billing service",
        "Helped with onboarding 4 hires",
        "Worked on search",
        "Led the billing migration for 12 services",
    )
    rules = _rules(data)
    for j in range(3):
        assert (f"workExperience[0].description[{j}]", "weak_opener") in rules
    assert ("workExperience[0].description[3]", "weak_opener") not in rules


def test_soft_rules() -> None:
    long_bullet = "Built " + " ".join(["thing"] * 40)
    data = _resume(
        "I built my first service",
        "Leveraged Kafka for 2 pipelines",
        long_bullet,
        "Built the search page",
    )
    rules = _rules(data)
    assert ("workExperience[0].description[0]", "first_person") in rules
    assert ("workExperience[0].description[1]", "ai_phrase") in rules
    assert ("workExperience[0].description[2]", "long_bullet") in rules
    assert ("workExperience[0].description[3]", "no_metric") in rules
    assert ("workExperience[0].description[1]", "no_metric") not in rules
    assert all(f.severity == "soft" for f in check_writing(data))


def test_repeated_opener_flags_third_use_in_one_role() -> None:
    data = _resume("Built A in 1 week", "Built B in 2 weeks", "Built C in 3 weeks")
    repeated = [f.path for f in check_writing(data) if f.rule == "repeated_opener"]
    assert repeated == [
        "workExperience[0].description[1]",
        "workExperience[0].description[2]",
    ]


def test_non_english_checks_em_dash_only() -> None:
    data = _resume("Responsable de la API — 3 equipos", "Ayudé con el soporte")
    assert _rules(data, "es") == {("workExperience[0].description[0]", "em_dash")}


def test_score_rewards_clean_bullets() -> None:
    clean = _resume("Led the migration of 12 services to Kubernetes")
    dirty = _resume("Responsible for the migration — of services")
    assert writing_report(clean).score == 100
    # 100 - 40 (em dash) - 40 (weak opener) - 5 (no number)
    assert writing_report(dirty).score == 15
    assert writing_score({}, []) is None


def test_fact_check_accepts_a_faithful_rewrite() -> None:
    before = "Responsible for migrating 12 services to Kubernetes at Acme"
    after = "Migrated 12 services to Kubernetes at Acme, ending manual deploys"
    assert fact_violations(before, after, known_terms=["Kubernetes"]) == []


def test_fact_check_rejects_added_and_dropped_numbers() -> None:
    assert "added_number" in fact_violations(
        "Built the API", "Built the API for 40% faster loads"
    )
    assert "dropped_number" in fact_violations("Built 3 APIs", "Built several APIs")


def test_fact_check_rejects_dropped_and_added_names() -> None:
    dropped = fact_violations(
        "Built dashboards in Grafana for SRE", "Built dashboards for SRE"
    )
    assert any(v.startswith("dropped_term") and "grafana" in v for v in dropped)
    added = fact_violations("Built dashboards", "Built dashboards in Grafana")
    assert any(v.startswith("added_term") and "grafana" in v for v in added)


def test_fact_check_known_skills_both_directions() -> None:
    assert fact_violations(
        "Wrote python jobs", "Wrote jobs", known_terms=["python"]
    ) == ["dropped_skill:python"]
    assert fact_violations(
        "Wrote jobs", "Wrote python jobs", known_terms=["python"]
    ) == ["added_skill:python"]


def test_fact_check_allows_forced_keywords_only() -> None:
    before = "Deployed services to the cloud"
    after = "Deployed services to AWS using Terraform"
    assert fact_violations(before, after, allowed_additions=["AWS", "Terraform"]) == []
    assert fact_violations(before, after, allowed_additions=["AWS"]) == [
        "added_term:terraform"
    ]


def test_fact_check_ignores_sentence_case_moves() -> None:
    before = "Managed the release train. Shipping weekly cut rollbacks"
    after = "Ran the weekly release train, which cut rollbacks"
    assert fact_violations(before, after) == []


def test_scrub_em_dashes() -> None:
    assert scrub_em_dashes("Built X — used by Y") == "Built X, used by Y"
    assert scrub_em_dashes("Built X -- used by Y") == "Built X, used by Y"
    assert scrub_em_dashes("co-op") == "co-op"
