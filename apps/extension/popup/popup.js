// apps/extension/popup/popup.js

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const resumeSel   = $('resume-select');
const pill        = $('pill');
const pillText    = $('pill-text');
const runBtn      = $('run-btn');
const settingsLnk = $('settings-link');

const vReady   = $('v-ready');
const vLoading = $('v-loading');
const vError   = $('v-error');
const vResults = $('v-results');

const VIEWS = [vReady, vLoading, vError, vResults];
const show  = (el) => VIEWS.forEach(v => v.classList.toggle('hidden', v !== el));

// ── State ─────────────────────────────────────────────────────────────────────
let appState   = null;  // populated by GET_STATE
let lastResult = null;  // populated after RUN_SCREEN

// ── Error helper ──────────────────────────────────────────────────────────────
function showError(icon, msg) {
  $('err-icon').textContent = icon;
  $('err-msg').textContent  = msg;
  show(vError);
}

// ── Resume selector ───────────────────────────────────────────────────────────
async function loadResumes() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_RESUMES' });
  if (res.error === 'BACKEND_OFFLINE') {
    showError('🔌', 'Resume Matcher is not running. Start the backend and try again.');
    return;
  }
  const resumes = (res.resumes || []).filter(r => r.processing_status === 'ready' || r.is_master);
  resumeSel.innerHTML = '<option value="">Select resume…</option>';
  resumes.forEach(r => {
    const opt = document.createElement('option');
    opt.value       = r.resume_id;
    opt.textContent = r.title || r.filename || 'Untitled';
    if (r.resume_id === appState.lastResumeId) opt.selected = true;
    resumeSel.appendChild(opt);
  });
}

// ── Status pill ───────────────────────────────────────────────────────────────
function updatePill() {
  if (appState.currentJobTitle) {
    pill.className = 'pill found';
    const label = appState.currentJobTitle +
      (appState.currentCompany ? ' · ' + appState.currentCompany : '');
    pillText.textContent = 'Job detected: ' + label;
  } else {
    pill.className = 'pill missing';
    pillText.textContent = 'Navigate to a job listing on LinkedIn, Indeed, or Glassdoor.';
  }
}

function updateRunBtn() {
  runBtn.disabled = !resumeSel.value || !appState.currentJobTitle;
}

// ── Render results ────────────────────────────────────────────────────────────
const VISA_CFG = {
  available:     { icon: '✅', title: 'Available',     sub: 'Employer sponsors work visas',          cls: 'available' },
  not_available: { icon: '🚫', title: 'Not available', sub: 'Employer does not sponsor work visas',  cls: 'not_available' },
  unclear:       { icon: '❓', title: 'Unclear',        sub: 'Not mentioned in the job description', cls: 'unclear' },
};

const FLAG_MAP = {
  German: '🇩🇪', English: '🇬🇧', French: '🇫🇷', Spanish: '🇪🇸',
  Mandarin: '🇨🇳', Chinese: '🇨🇳', Dutch: '🇳🇱', Italian: '🇮🇹',
  Portuguese: '🇵🇹', Japanese: '🇯🇵', Korean: '🇰🇷', Arabic: '🇸🇦',
  Russian: '🇷🇺', Polish: '🇵🇱', Swedish: '🇸🇪',
};

function renderResults(result, languages, visa) {
  lastResult = result;
  const { score, decision, missing_keywords = [] } = result;

  // Badge + score
  $('r-badge').textContent = decision === 'PASS' ? '✓ PASS'
                           : decision === 'REJECT' ? '✗ REJECT' : '~ BORDERLINE';
  $('r-badge').className = 'badge ' + decision;
  $('r-score').textContent = Math.round(score.total);
  $('r-bar').style.width = Math.round(score.total) + '%';

  // Breakdown
  const rows = [
    ['Skills',      score.skills_match,     30],
    ['Experience',  score.experience_match, 25],
    ['Domain',      score.domain_match,     20],
    ['Tools',       score.tools_match,      15],
  ];
  $('r-breakdown').innerHTML = rows.map(([lbl, val, max]) => {
    const warn = val < max * 0.6 ? ' w' : '';
    return `<div class="bk-row"><span>${lbl}</span><span class="bk-val${warn}">${Math.round(val)}/${max}</span></div>`;
  }).join('');

  // Languages
  const langBox = $('r-lang');
  const langLbl = $('lang-lbl');
  if (languages.length > 0) {
    langBox.classList.remove('hidden');
    langLbl.classList.remove('hidden');
    langBox.innerHTML = languages.map(({ language, level, required }) =>
      `<div class="lang-row">
        <span>${FLAG_MAP[language] || '🌐'}</span>
        <span><strong>${language}</strong>${level ? ' — ' + level : ''}</span>
        <span class="lang-badge ${required ? 'req' : 'pref'}">${required ? 'REQUIRED' : 'PREFERRED'}</span>
      </div>`
    ).join('');
  } else {
    langBox.classList.add('hidden');
    langLbl.classList.add('hidden');
  }

  // Visa
  const vc = VISA_CFG[visa] || VISA_CFG.unclear;
  $('r-visa').className = 'visa ' + vc.cls;
  $('r-visa-icon').textContent  = vc.icon;
  $('r-visa-title').textContent = vc.title;
  $('r-visa-sub').textContent   = vc.sub;

  // Missing keywords
  const shown = missing_keywords.slice(0, 5);
  const extra = missing_keywords.length - 5;
  $('r-kws').innerHTML = shown.map(k => `<span class="kw">${k}</span>`).join('') +
    (extra > 0 ? `<span class="kw more">+${extra} more</span>` : '');

  show(vResults);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  appState = await chrome.runtime.sendMessage({ type: 'GET_STATE' });

  settingsLnk.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  await loadResumes();
  if (!vError.classList.contains('hidden')) return; // backend offline was shown
  updatePill();
  updateRunBtn();
  show(vReady);

  resumeSel.addEventListener('change', updateRunBtn);

  runBtn.addEventListener('click', async () => {
    const resumeId    = resumeSel.value;
    const resumeTitle = resumeSel.options[resumeSel.selectedIndex]?.textContent || '';
    if (!resumeId) return;

    show(vLoading);

    const res = await chrome.runtime.sendMessage({
      type: 'RUN_SCREEN',
      payload: { resumeId, resumeTitle, jobText: appState.currentJobText },
    });

    if (res.error) {
      const msgs = {
        BACKEND_OFFLINE: ['🔌', 'Resume Matcher is not running. Start the backend and try again.'],
        NO_RESUME:       ['📄', 'Select a resume to get started.'],
        NO_JOB:          ['🔍', 'Navigate to a job listing first.'],
      };
      const isTimeout = /timed?\s*out|timeout|abort/i.test(res.error || '');
      const [icon, msg] = msgs[res.error] ||
        (isTimeout
          ? ['⏱️', 'Screening timed out — the AI model is busy. Please try again.']
          : ['⚠️', 'Screening failed: ' + res.error]);
      showError(icon, msg);
      return;
    }

    const jobText = appState.currentJobText || '';
    renderResults(res.result, parseLanguages(jobText), parseVisa(jobText));
  });

  $('full-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'OPEN_FULL_RESULTS',
      payload: {
        jobText:  appState.currentJobText,
        resumeId: resumeSel.value || null,
        result:   lastResult,
      },
    });
  });

  $('tailored-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'OPEN_FULL_RESULTS',
      payload: {
        jobText:          appState.currentJobText,
        resumeId:         resumeSel.value || null,
        result:           lastResult,   // full result, optimized_resume included
        showOptimization: true,         // auto-expand the optimization panel
      },
    });
  });
}

init();
