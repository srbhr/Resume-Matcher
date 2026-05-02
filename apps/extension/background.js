// apps/extension/background.js
// Service worker — handles all API calls to backend and all chrome.runtime messages.

const DEFAULT_BACKEND_URL  = 'http://localhost:8000';
const DEFAULT_FRONTEND_URL = 'http://localhost:3000';

// ── Storage helpers ────────────────────────────────────────────────────────────

async function getSettings() {
  const data = await chrome.storage.local.get([
    'backendUrl', 'frontendUrl', 'lastResumeId', 'lastResumeTitle',
  ]);
  return {
    backendUrl:      data.backendUrl      || DEFAULT_BACKEND_URL,
    frontendUrl:     data.frontendUrl     || DEFAULT_FRONTEND_URL,
    lastResumeId:    data.lastResumeId    || null,
    lastResumeTitle: data.lastResumeTitle || null,
  };
}

async function getCurrentJob() {
  const data = await chrome.storage.local.get([
    'currentJobText', 'currentJobTitle', 'currentCompany',
  ]);
  return {
    currentJobText:  data.currentJobText  || null,
    currentJobTitle: data.currentJobTitle || null,
    currentCompany:  data.currentCompany  || null,
  };
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiFetch(backendUrl, path, options = {}, timeoutMs = 120_000) {
  const res = await fetch(`${backendUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Message dispatcher ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  dispatch(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message || String(err) }));
  return true; // keep port open for async response
});

async function dispatch(message) {
  const { type, payload = {} } = message;

  // Content script detected a job page
  if (type === 'JOB_DETECTED') {
    await chrome.storage.local.set({
      currentJobText:  payload.jobText  || '',
      currentJobTitle: payload.jobTitle || '',
      currentCompany:  payload.company  || '',
    });
    return { ok: true };
  }

  // Popup opened — return current state
  if (type === 'GET_STATE') {
    const settings = await getSettings();
    const job      = await getCurrentJob();
    return { ...settings, ...job };
  }

  // Popup requests resume list to populate the selector
  if (type === 'GET_RESUMES') {
    const { backendUrl } = await getSettings();
    try {
      const json = await apiFetch(backendUrl, '/api/v1/resumes/list?include_master=true');
      return { resumes: json.data || [] };
    } catch {
      return { error: 'BACKEND_OFFLINE' };
    }
  }

  // User clicked "Run ATS Screen" in popup
  if (type === 'RUN_SCREEN') {
    const { resumeId, resumeTitle, jobText } = payload;
    if (!resumeId) return { error: 'NO_RESUME' };
    if (!jobText)  return { error: 'NO_JOB' };

    const { backendUrl } = await getSettings();

    // Persist last-used resume immediately
    await chrome.storage.local.set({
      lastResumeId:    resumeId,
      lastResumeTitle: resumeTitle || '',
    });

    try {
      const result = await apiFetch(backendUrl, '/api/v1/ats/screen', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          resume_id:      resumeId,
          job_description: jobText,
          save_optimized: false,
        }),
      });
      return { result };
    } catch (err) {
      return { error: err.message };
    }
  }

  // User clicked "View Full Results" or "Create ATS Tailored Resume" — open the frontend app
  if (type === 'OPEN_FULL_RESULTS') {
    const { jobText, jobTitle, company, resumeId, result, showOptimization } = payload;
    const { frontendUrl } = await getSettings();

    // Verify the frontend is reachable before opening a tab — avoids a blank
    // "This page isn't working" tab when the Next.js dev server isn't running.
    // Note: host_permissions must include localhost for this fetch to succeed.
    try {
      await fetch(`${frontendUrl}/`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
        // Follow redirects (Next.js may redirect / → /dashboard, etc.)
        redirect: 'follow',
      });
      // Any response (even 404) means the server is up — only a network error means offline
    } catch {
      return { error: 'FRONTEND_OFFLINE' };
    }

    const url = new URL(`${frontendUrl}/ats`);

    // Job description (cap at 4000 chars to keep URL manageable)
    url.searchParams.set('jd', (jobText || '').slice(0, 4000));

    // Pre-selected resume
    if (resumeId) url.searchParams.set('resumeId', resumeId);

    // Job title and company (used to name the saved resume)
    if (jobTitle) url.searchParams.set('jobTitle', jobTitle);
    if (company)  url.searchParams.set('company', company);

    // Always strip optimized_resume from the URL — it can be 10 000+ chars and
    // causes "page isn't working" errors when the URL grows too large.
    // The frontend re-fetches optimization via ?optimize=1 + resumeId.
    if (result) {
      const { optimized_resume, ...slim } = result;
      url.searchParams.set('result', JSON.stringify(slim));
    }

    // Signal the page to auto-expand the optimization panel
    if (showOptimization) url.searchParams.set('optimize', '1');

    chrome.tabs.create({ url: url.toString() });
    return { ok: true };
  }

  return { error: 'UNKNOWN_MESSAGE_TYPE' };
}
