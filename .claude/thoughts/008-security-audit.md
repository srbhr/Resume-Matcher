# Security & Integration Audit — Resume Matcher

**Date:** 2026-03-06
**Repo:** `srbhr/Resume-Matcher`
**Branch:** `main`
**Visibility:** Public

---

## 1. GitHub Actions Workflows

### 1.1 Publish Docker Image

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/docker-publish.yml` |
| **Trigger** | Push to `main`, version tags (`v*.*.*`), manual dispatch |
| **Permissions** | `contents: read`, `packages: write` |
| **Runner** | `ubuntu-latest` |
| **Avg Duration** | ~21 minutes (multi-arch: `amd64` + `arm64` via QEMU) |
| **Status** | Active |

**What it does:**
- Builds multi-platform Docker image
- Pushes to GHCR (`ghcr.io/srbhr/resume-matcher`)
- Pushes to Docker Hub (conditional — only if `DOCKERHUB_USERNAME` secret exists)

**Secrets used:**
- `GITHUB_TOKEN` (auto-provided)
- `DOCKERHUB_USERNAME` (optional)
- `DOCKERHUB_TOKEN` (optional)

**Action:** Candidate for removal. Builds can be handled locally or via Cloud Code for faster iteration.

---

### 1.2 CodeQL (Default Setup — GitHub-managed)

| Field | Value |
|-------|-------|
| **File** | None (dynamic, managed via Settings > Code Security) |
| **Trigger** | Push to `main`, PRs, weekly schedule |
| **Languages** | `actions`, `javascript`, `typescript`, `python` |
| **Query Suite** | `default` |
| **Runner** | Standard GitHub-hosted |
| **Status** | Active |

**Recent run history:**

| Date | JS | Python | Actions | Overall |
|------|----|--------|---------|---------|
| 2026-03-06 | Pass | Pass | Pass | Pass |
| 2026-03-05 (scheduled) | Pass | Pass | Cancelled | **Failure** |
| 2026-03-04 | Pass | Pass | Pass | Pass |

**Open alerts:** 0 (2 historical `py/clear-text-storage-sensitive-data` alerts, both fixed)

**Notes:**
- The `actions` language scanner analyzes workflow YAML files for misconfigurations. With only 1 workflow file (and that potentially being removed), this adds overhead for minimal value.
- The Mar 5 failure was caused by the `actions` job being cancelled (no steps ran — likely a transient GitHub runner issue, not a code problem).

**Action:** Consider removing the `actions` language from the scan. Keep `javascript`, `typescript`, and `python`.

---

### 1.3 Backend Linter (Ruff)

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ruff_check.yaml` (listed in GitHub, **file does not exist on disk**) |
| **Status** | Ghost workflow — registered in GitHub but no file on `main` |

**Action:** This workflow is orphaned. GitHub may eventually clean it up, or you can delete it via the API if it causes confusion.

---

### 1.4 Copilot Code Review

| Field | Value |
|-------|-------|
| **File** | Dynamic (`copilot-pull-request-reviewer`) |
| **Trigger** | Pull request events |
| **Status** | Active |

**Action:** No action needed. This is a GitHub-managed dynamic workflow.

---

### 1.5 Copilot Coding Agent

| Field | Value |
|-------|-------|
| **File** | Dynamic (`copilot-swe-agent/copilot`) |
| **Trigger** | Issue/PR assignment to Copilot |
| **Status** | Active |

**Action:** No action needed.

---

### 1.6 Dependabot Updates

| Field | Value |
|-------|-------|
| **File** | Dynamic (`dependabot/dependabot-updates`) |
| **Trigger** | Scheduled dependency checks |
| **Status** | Active |

**Action:** No action needed. Keeps dependencies up to date.

---

## 2. Installed GitHub Apps (AI Review Bots)

These apps are installed via GitHub Settings > Integrations > Applications. Exact permissions can only be viewed/modified from that page.

### 2.1 GitHub Copilot

| Field | Value |
|-------|-------|
| **Functions** | Code review on PRs, autonomous coding agent |
| **Expected Permissions** | `pull_requests: write`, `contents: write`, `issues: read` |
| **Observed Activity** | Posts review summaries on PRs |

### 2.2 kilo-code-bot

| Field | Value |
|-------|-------|
| **Functions** | Automated code review on PRs |
| **Expected Permissions** | `pull_requests: write` (to post comments) |
| **Observed Activity** | Posts inline code review comments with warnings/suggestions |

### 2.3 cubic-dev-ai

| Field | Value |
|-------|-------|
| **Functions** | Automated code review on PRs |
| **Expected Permissions** | `pull_requests: write` (to post comments) |
| **Observed Activity** | Posts review summaries (no issues found / issues found) |

**How to audit exact permissions:**
1. Go to https://github.com/settings/installations
2. Click "Configure" next to each app
3. Review repository access and permissions granted

---

## 3. Webhooks

Active webhooks delivering events to external services:

| # | Service | URL Pattern | Content Type | Active |
|---|---------|-------------|-------------|--------|
| 1 | **Streamlit Share** | `share.streamlit.io/hook` | JSON | Yes |
| 2 | **Discord** | `discord.com/api/webhooks/...` | JSON | Yes |
| 3 | **GitKraken** | `api.gitkraken.dev/webhook/github` | JSON | Yes |
| 4 | **Linear** | `client-api.linear.app/connect/github/...` | JSON | Yes |

**Review questions:**
- [ ] Is the **Streamlit Share** webhook still needed? (Project is now Next.js, not Streamlit)
- [ ] Is the **GitKraken** webhook actively used?
- [ ] Is the **Linear** integration actively used for issue tracking?
- [ ] The **Discord** webhook sends repo notifications — confirm this is still desired

---

## 4. Repository Security Settings

| Setting | Status | Recommendation |
|---------|--------|----------------|
| **Dependabot security updates** | Enabled | Keep |
| **Secret scanning** | Disabled | Consider enabling (free for public repos) |
| **Secret scanning push protection** | Disabled | Consider enabling (prevents accidental secret commits) |
| **Secret scanning non-provider patterns** | Disabled | Low priority |
| **Secret scanning validity checks** | Disabled | Low priority |

---

## 5. Secrets & Credentials

Secrets referenced in workflows (cannot view values, only names):

| Secret | Used By | Required |
|--------|---------|----------|
| `GITHUB_TOKEN` | Docker publish (GHCR login) | Auto-provided |
| `DOCKERHUB_USERNAME` | Docker publish (Docker Hub login) | Optional — conditional |
| `DOCKERHUB_TOKEN` | Docker publish (Docker Hub login) | Optional — conditional |

**Action:** If Docker workflow is removed, `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets can be cleaned up from Settings > Secrets.

---

## 6. Collaborators

| User | Role |
|------|------|
| `srbhr` | Admin (owner) |

No external collaborators with push access.

---

## 7. Action Items Summary

### Remove

- [ ] **Delete `.github/workflows/docker-publish.yml`** — Replace with local/Cloud Code Docker builds
- [ ] **Remove `actions` language from CodeQL** — Minimal value, causes flaky failures
- [ ] **Clean up Docker Hub secrets** (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`) after workflow removal
- [ ] **Remove Streamlit Share webhook** — Project no longer uses Streamlit

### Review

- [ ] **Audit GitKraken webhook** — Is this actively used?
- [ ] **Audit Linear webhook** — Is this actively used?
- [ ] **Verify AI bot permissions** — Check exact scopes at github.com/settings/installations
- [ ] **Enable secret scanning** — Free for public repos, catches accidental credential leaks
- [ ] **Enable push protection** — Blocks pushes containing detected secrets

### Keep As-Is

- [x] CodeQL for `javascript`, `typescript`, `python`
- [x] Dependabot security updates
- [x] GitHub Copilot (code review + coding agent)
- [x] Discord webhook (notifications)
