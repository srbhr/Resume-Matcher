"""Unit tests for the posting-metadata keyword filter (app/services/jd_metadata.py)."""

from app.services.jd_metadata import (
    filter_metadata_keywords,
    is_metadata_value,
    posting_body,
)

CHINESE_POSTING = """公司：深圳深浦电气有限公司
岗位：上位机软件工程师
城市：深圳市（南山）
薪资：9K-15K/月
学历：本科及以上
截止：2026-12-31
招聘人数：5
职位类别：嵌入式软件开发
需求专业：人工智能，物联网工程，计算机科学与技术，软件工程，通信工程

岗位职责：
负责位移传感器上位机研发工作

岗位要求：
1.本科及以上学历，电子信息类、自动化等相关专业
2.熟悉C++/C#/Python等语言及界面开发（QT/WPF等）
3.熟悉PCL、OpenCV等库应用
"""


class TestPostingBody:
    def test_labelled_metadata_lines_are_removed(self) -> None:
        body = posting_body(CHINESE_POSTING)
        for metadata in ("深圳深浦电气有限公司", "9K-15K/月", "2026-12-31", "嵌入式软件开发"):
            assert metadata not in body

    def test_requirement_sections_are_kept(self) -> None:
        body = posting_body(CHINESE_POSTING)
        assert "岗位职责" in body
        assert "PCL、OpenCV" in body
        assert "位移传感器" in body

    def test_empty_text_is_empty_body(self) -> None:
        assert posting_body("") == ""


class TestIsMetadataValue:
    def test_salary_date_headcount_and_links(self) -> None:
        for value in (
            "9K-15K/月",
            "2026-12-31",
            "2026年10月",
            "招聘5人",
            "5人",
            "100%",
            "https://www.iguopin.com/job/detail?id=1",
            "hr@example.com",
            "14:00",
        ):
            assert is_metadata_value(value), value

    def test_skill_terms_are_not_metadata(self) -> None:
        for value in ("C++", "Qt", "界面开发", "上位机软件工程师", "PCL"):
            assert not is_metadata_value(value), value


class TestFilterMetadataKeywords:
    def test_header_terms_are_dropped_from_every_field(self) -> None:
        keywords = {
            "company": "深圳深浦电气有限公司",
            "role": "上位机软件工程师",
            "required_skills": ["C++", "界面开发", "PCL", "嵌入式软件开发"],
            "preferred_skills": ["9K-15K/月"],
            "keywords": ["人工智能", "计算机科学与技术", "通信工程", "深圳"],
        }
        filtered = filter_metadata_keywords(keywords, CHINESE_POSTING)
        assert filtered["required_skills"] == ["C++", "界面开发", "PCL"]
        assert filtered["preferred_skills"] == []
        assert filtered["keywords"] == []

    def test_role_and_company_are_untouched(self) -> None:
        keywords = {"company": "深浦", "role": "上位机软件工程师", "required_skills": []}
        filtered = filter_metadata_keywords(keywords, CHINESE_POSTING)
        assert filtered["company"] == "深浦"
        assert filtered["role"] == "上位机软件工程师"

    def test_skill_named_in_the_body_survives(self) -> None:
        keywords = {"required_skills": ["位移传感器", "C#"]}
        filtered = filter_metadata_keywords(keywords, CHINESE_POSTING)
        assert filtered["required_skills"] == ["位移传感器", "C#"]

    def test_invented_term_is_dropped(self) -> None:
        keywords = {"required_skills": ["Kubernetes"]}
        filtered = filter_metadata_keywords(keywords, CHINESE_POSTING)
        assert filtered["required_skills"] == []

    def test_short_posting_drops_only_metadata_values(self) -> None:
        keywords = {"required_skills": ["C++", "9K-15K/月", "招聘5人"]}
        filtered = filter_metadata_keywords(keywords, "公司：某公司")
        assert filtered["required_skills"] == ["C++"]

    def test_terms_absent_from_a_substantive_body_are_dropped(self) -> None:
        keywords = {"required_skills": ["Rust", "Kubernetes"]}
        filtered = filter_metadata_keywords(keywords, CHINESE_POSTING)
        assert filtered["required_skills"] == []

    def test_missing_or_non_string_entries_are_tolerated(self) -> None:
        keywords = {"required_skills": ["C++", None, "  "], "keywords": "not-a-list"}
        filtered = filter_metadata_keywords(keywords, CHINESE_POSTING)
        assert filtered["required_skills"] == ["C++"]
        assert filtered["keywords"] == "not-a-list"

    def test_english_posting_keeps_boundaries(self) -> None:
        posting = (
            "Company: Acme\nRole: Senior Backend Engineer\nSalary: 90K-120K\n\n"
            "Requirements:\n5+ years with Python and Kubernetes.\n"
        )
        keywords = {"required_skills": ["Python", "Kubernetes", "Companyside"]}
        filtered = filter_metadata_keywords(keywords, posting)
        assert filtered["required_skills"] == ["Python", "Kubernetes"]
