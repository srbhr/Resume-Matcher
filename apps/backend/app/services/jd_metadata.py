r"""Drop posting metadata from the extracted job-keyword list.

The keyword extractor reads whatever text was pasted as the job description,
and pasted postings usually carry a metadata header: 公司 / 岗位 / 城市 / 学历 /
截止日期 / 薪资 / 招聘人数 / 需求专业 / 职位类别. The model dutifully turns parts
of that header into "skills", so a Chinese posting's keyword list ends up
containing the majors it accepts ("人工智能", "计算机科学与技术", "通信工程"), the
platform's job category ("嵌入式软件开发"), and literal price tags
("9K-15K/月"). None of those are things a candidate can have: every one of them
is a missed keyword that can never be matched, so it deflates the ATS score for
reasons the candidate cannot act on.

The rule here is deterministic rather than prompt-only: a term survives when it
occurs in the posting *body* (the text with labelled metadata lines removed) and
does not look like a metadata value. Terms the model invented, and terms that
only exist in the header, both fall out.
"""

import re
from typing import Any

from app.services.text_match import keyword_in_text

KEYWORD_FIELDS: tuple[str, ...] = ("required_skills", "preferred_skills", "keywords")

# Label on the left of a "label: value" line that marks posting metadata rather
# than a requirement. Section labels such as 岗位职责 / 任职要求 / 职位描述 are
# deliberately absent: their text is body content.
METADATA_LABELS: frozenset[str] = frozenset(
    {
        "公司",
        "公司名",
        "公司名称",
        "单位",
        "单位名称",
        "招聘单位",
        "岗位",
        "岗位名",
        "岗位名称",
        "职位",
        "职位名",
        "职位名称",
        "职位类别",
        "城市",
        "地点",
        "工作地点",
        "工作城市",
        "学历",
        "学历要求",
        "学位",
        "截止",
        "截止日期",
        "截止时间",
        "报名截止",
        "发布日期",
        "发布时间",
        "更新时间",
        "详情",
        "详情链接",
        "链接",
        "来源",
        "薪资",
        "月薪",
        "年薪",
        "薪资范围",
        "招聘人数",
        "人数",
        "需求专业",
        "专业要求",
        "专业名称",
        "专业",
        "单位性质",
        "公司性质",
        "企业性质",
        "部门",
        "工作类型",
        "届别",
        "学校",
        "投递方式",
        "company",
        "role",
        "title",
        "location",
        "salary",
        "deadline",
        "posted",
        "source",
        "url",
    }
)

_LABELLED_LINE_RE = re.compile(r"^[ \t]*([^：:\s]{1,16})[ \t]*[：:][ \t]*(.*)$", re.MULTILINE)
# Values that are plainly metadata wherever they appear.
_METADATA_VALUE_RE = re.compile(
    r"""
    ^\s*(?:
        \d+(?:\.\d+)?\s*[kK千]?\s*[-~—–至]\s*\d+(?:\.\d+)?\s*[kK千万]?\s*(?:元)?\s*(?:/|每)?\s*(?:月|年|天|小时)?\s*      # 9K-15K/月
      | \d+(?:\.\d+)?\s*元\s*(?:/|每)?\s*(?:月|年|天|小时)?                                                        # 12000元
      | (?:招聘|计划|需求|共|约)?\s*\d+\s*(?:人|名|个|位)\s*                                            # 招聘5人
      | \d{4}\s*[-/.年]\s*\d{1,2}(?:\s*[-/.月]\s*\d{1,2}\s*日?)?                                                   # 2026-12-31
      | \d{1,2}\s*[:：]\s*\d{2}                                                                                     # 14:00
      | (?:19|20)\d{2}\s*年(?:\s*\d{1,2}\s*月)?\s*                                                              # 2026年10月
      | \d+(?:\.\d+)?\s*%                                                                                           # 100%
      | \d+\s*[-~—–]\s*\d+\s*(?:届|年)                                                                             # 2024-2027届
      | https?://\S+
      | [\w.+-]+@[\w-]+\.[\w.]+
      | \+?\d[\d\s-]{7,}\d
      | \d+
    )\s*$
    """,
    re.VERBOSE,
)

# Below this body length the posting is header-only or a summary; the terms are
# then judged on their metadata-value shape alone (see filter_metadata_keywords).
_MIN_BODY_CHARS = 40


def posting_body(text: str) -> str:
    """Return the posting text with labelled metadata lines removed."""
    if not text:
        return ""
    body_lines: list[str] = []
    for line in text.splitlines():
        match = _LABELLED_LINE_RE.match(line)
        if match and match.group(1).strip() in METADATA_LABELS:
            continue
        body_lines.append(line)
    return "\n".join(body_lines)


def is_metadata_value(term: str) -> bool:
    """True when the term is a value only a header would carry (price, date, count)."""
    return bool(_METADATA_VALUE_RE.match(term or ""))


def _kept(values: Any, body: str) -> list[str] | None:
    """Terms that are neither metadata values nor absent from the body."""
    if not isinstance(values, list):
        return None
    return [
        term
        for term in values
        if isinstance(term, str)
        and term.strip()
        and not is_metadata_value(term)
        and keyword_in_text(term, body)
    ]


def filter_metadata_keywords(
    keywords: dict[str, Any], job_description: str
) -> dict[str, Any]:
    """Drop keyword terms that come from posting metadata rather than requirements.

    Two rules, applied in order:

    1. A term whose shape is a posting value (9K-15K/月, 2026-12-31, 招聘5人, a URL,
       an email) is never a requirement and always goes.
    2. A term that does not occur in the posting body goes too - it came from a
       labelled header line or from the model's imagination.

    When the posting has no substantive body at all (a one-line summary, a
    header-only paste) rule 2 has nothing to test against, so only rule 1
    applies. Otherwise an empty result is the honest answer: the extractor found
    no requirement that the posting actually states.

    ``role`` and ``company`` are left alone: they are used for title matching and
    provenance, not as keyword coverage.
    """
    body = posting_body(job_description)
    filtered = dict(keywords)
    used_body_rule = len(body.strip()) >= _MIN_BODY_CHARS

    for field in KEYWORD_FIELDS:
        values = keywords.get(field)
        if not isinstance(values, list):
            continue
        if used_body_rule:
            filtered[field] = _kept(values, body) or []
        else:
            filtered[field] = [
                term
                for term in values
                if isinstance(term, str) and term.strip() and not is_metadata_value(term)
            ]

    return filtered
