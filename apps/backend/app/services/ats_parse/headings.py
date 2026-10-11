"""Standard section headings an ATS looks for, per supported locale."""

HEADINGS: dict[str, dict[str, tuple[str, ...]]] = {
    "en": {
        "summary": (
            "summary",
            "profile",
            "professional summary",
            "about me",
            "objective",
        ),
        "experience": (
            "experience",
            "work experience",
            "professional experience",
            "employment history",
            "work history",
            "employment",
        ),
        "education": ("education", "academic background", "qualifications"),
        "skills": ("skills", "technical skills", "core competencies", "competencies"),
        "projects": ("projects", "personal projects"),
    },
    "es": {
        "summary": ("resumen", "perfil", "perfil profesional", "sobre mí"),
        "experience": ("experiencia", "experiencia laboral", "experiencia profesional"),
        "education": ("educación", "formación", "formación académica"),
        "skills": ("habilidades", "competencias", "aptitudes"),
        "projects": ("proyectos",),
    },
    "fr": {
        "summary": ("résumé", "profil", "à propos"),
        "experience": ("expérience", "expériences", "expérience professionnelle"),
        "education": ("formation", "éducation", "diplômes"),
        "skills": ("compétences", "compétences techniques"),
        "projects": ("projets",),
    },
    "pt": {
        "summary": ("resumo", "perfil", "sobre mim"),
        "experience": ("experiência", "experiência profissional"),
        "education": ("formação", "educação", "formação acadêmica"),
        "skills": ("habilidades", "competências"),
        "projects": ("projetos",),
    },
    "ja": {
        "summary": ("概要", "自己pr", "プロフィール"),
        "experience": ("職歴", "職務経歴", "経歴"),
        "education": ("学歴",),
        "skills": ("スキル", "技術", "資格"),
        "projects": ("プロジェクト",),
    },
    "ko": {
        "summary": ("요약", "소개", "자기소개"),
        "experience": ("경력", "경력 사항", "업무 경력"),
        "education": ("학력", "교육"),
        "skills": ("기술", "보유 기술", "역량"),
        "projects": ("프로젝트",),
    },
    "zh": {
        "summary": ("个人简介", "简介", "概要", "自我评价"),
        "experience": ("工作经历", "工作经验", "经历"),
        "education": ("教育背景", "教育经历", "学历"),
        "skills": ("技能", "专业技能"),
        "projects": ("项目经历", "项目经验", "项目"),
    },
}

REQUIRED_SECTIONS = ("experience", "education", "skills")


def synonyms(kind: str, locale: str | None) -> tuple[str, ...]:
    """Synonyms for one section kind: the given locale plus English, else every locale."""
    base = (locale or "").split("-")[0].lower()
    locales = [base, "en"] if base in HEADINGS else list(HEADINGS)
    return tuple(
        s for loc in dict.fromkeys(locales) for s in HEADINGS[loc].get(kind, ())
    )
