import re
import unicodedata
from typing import Iterable, List

try:
    import snowballstemmer  # lightweight, no NLTK download needed
    _DE_STEMMER = snowballstemmer.stemmer('german')
except Exception:  # pragma: no cover - fallback no-op
    _DE_STEMMER = None


# Minimal, safe tech whitelist (skip stemming and aggressive transforms)
_TECH_WHITELIST = {
    'kubernetes', 'k8s', 'docker', 'fastapi', 'flask', 'django',
    'ci/cd', 'ci', 'cd', 'github actions', 'helm', 'prometheus', 'grafana',
    'aws', 'azure', 'gcp', 'postgres', 'postgresql', 'mysql', 'sqlite',
    '.net', 'node.js', 'nodejs', 'react', 'next.js', 'nextjs', 'typescript', 'python',
}


# Curated, compact DE synonym map (extend over time)
_DE_SYNONYMS_PHRASES = {
    # phrases → canonical
    'continuous integration/continuous delivery': 'ci/cd',
    'continuous integration': 'ci',
    'continuous delivery': 'cd',
    'build-pipelines': 'ci/cd',
    'build pipeline': 'ci/cd',
    'container-orchestrierung': 'kubernetes',
    'orchestrierung mit kubernetes': 'kubernetes',
}

_DE_SYNONYMS_WORDS = {
    # single words → canonical
    'orchestrierung': 'kubernetes',
    'k8s': 'kubernetes',
    'fast api': 'fastapi',
    'containerisierung': 'docker',
}


def _strip_diacritics(text: str) -> str:
    # Keep base letters; German tech terms usually unaffected
    return ''.join(
        ch for ch in unicodedata.normalize('NFKD', text)
        if not unicodedata.combining(ch)
    )


def _pre_normalize(text: str) -> str:
    t = unicodedata.normalize('NFKC', text)
    t = t.lower()
    t = _strip_diacritics(t)
    # unify common punctuation to spaces, keep '/', '.' within tech tokens
    t = re.sub(r"[\u2013\u2014]", "-", t)  # dashes
    t = re.sub(r"[^\w\./\-/+ ]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _apply_synonyms_de(text: str) -> str:
    # phrase-level first (whole word boundaries where possible)
    t = text
    for src, dst in _DE_SYNONYMS_PHRASES.items():
        pattern = re.compile(rf"\b{re.escape(src)}\b", re.IGNORECASE)
        t = pattern.sub(dst, t)
    # word-level fallbacks
    for src, dst in _DE_SYNONYMS_WORDS.items():
        pattern = re.compile(rf"\b{re.escape(src)}\b", re.IGNORECASE)
        t = pattern.sub(dst, t)
    return t


def _tokenize_keep_tech(text: str) -> List[str]:
    # Split on spaces; keep tokens like 'ci/cd', 'node.js', '.net'
    raw = text.split()
    tokens: List[str] = []
    for tok in raw:
        # strip trailing punctuation while keeping tech separators
        tok = tok.strip(' ,;:')
        if not tok:
            continue
        tokens.append(tok)
    return tokens


def _stem_de(tokens: Iterable[str]) -> List[str]:
    out: List[str] = []
    for tok in tokens:
        if tok in _TECH_WHITELIST:
            out.append(tok)
            continue
        if _DE_STEMMER is None:
            out.append(tok)
        else:
            out.append(_DE_STEMMER.stemWord(tok))
    return out


def normalize_tokens_de(items: Iterable[str]) -> List[str]:
    """Normalize a list of short items (keywords, skills) for German.

    Steps: pre-normalize → synonyms → tokenize → stem (skip tech whitelist).
    Returns a deduplicated list of tokens suitable for set comparisons.
    """
    bag: List[str] = []
    for it in items:
        if not it:
            continue
        t = _pre_normalize(str(it))
        t = _apply_synonyms_de(t)
        toks = _tokenize_keep_tech(t)
        bag.extend(toks)
    stemmed = _stem_de(bag)
    # dedupe while preserving order mildly
    seen = set()
    out: List[str] = []
    for tok in stemmed:
        if tok and tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


def normalize_text_de_block(texts: Iterable[str]) -> str:
    """Normalize a longer block by applying DE synonyms and pre-normalization.

    Intended for concatenated resume/job snippets before lightweight lexical matching.
    Not used for embeddings; keep original text for semantic models.
    """
    parts: List[str] = []
    for t in texts:
        if not t:
            continue
        norm = _apply_synonyms_de(_pre_normalize(str(t)))
        parts.append(norm)
    return ' '.join(parts)
