// apps/extension/content/linkedin.js
// Depends on shared/parsers.js and content/shared.js being loaded first (see manifest).

(function () {
  'use strict';

  // ── Shutdown registry ─────────────────────────────────────────────────────────
  const _intervals = new Set();
  let _dead = false;

  function trackInterval(fn, ms) {
    const id = setInterval(() => {
      if (_dead || !isContextValid()) { shutdown(); return; }
      fn();
    }, ms);
    _intervals.add(id);
    return id;
  }

  function clearTracked(id) {
    clearInterval(id);
    _intervals.delete(id);
  }

  function shutdown() {
    _dead = true;
    _intervals.forEach(clearInterval);
    _intervals.clear();
  }

  // ── JD extraction ─────────────────────────────────────────────────────────────
  const JD_SELECTORS = [
    '.jobs-description__content',
    '.jobs-description',
    '.job-details-about-the-job-module__description',
    '.jobs-box__html-content',
    '[data-job-id] .description__text',
    '.jobs-details__main-content',
    '.scaffold-layout__detail .jobs-search__job-details',
  ];

  function expandJD() {
    const panel = document.querySelector(
      '.scaffold-layout__detail, .jobs-search__job-details--detail-panel, [data-view-name="job-details"]'
    ) || document;

    const btnSelectors = [
      '.jobs-description__footer-button',
      '.jobs-description__see-more-button',
      'button.jobs-description__footer-button',
    ];
    for (const sel of btnSelectors) {
      const btn = panel.querySelector(sel);
      if (btn && btn.offsetParent && btn.getAttribute('aria-expanded') !== 'true') {
        btn.click(); return;
      }
    }
    for (const el of panel.querySelectorAll('button, a')) {
      const txt = (el.innerText || '').trim().toLowerCase();
      if ((txt === 'show more' || txt === 'see more') && el.offsetParent) {
        el.click(); return;
      }
    }
  }

  function extractJD() {
    const detailPanel = document.querySelector(
      '.scaffold-layout__detail, .jobs-search__job-details--detail-panel, [data-view-name="job-details"]'
    );
    const searchRoot = detailPanel || document;

    for (const sel of JD_SELECTORS) {
      const el = searchRoot.querySelector(sel);
      if (el && el.innerText.trim().length > 150) {
        console.log('[RM] JD via selector:', sel);
        return el.innerText.trim();
      }
    }

    if (detailPanel) {
      let best = null, bestLen = 300;
      detailPanel.querySelectorAll('div, section, article').forEach(el => {
        const txt = el.innerText.trim();
        if (txt.length > bestLen && txt.split('\n').length > 5) {
          best = txt; bestLen = txt.length;
        }
      });
      if (best) {
        console.log('[RM] JD via detail-panel fallback, length:', bestLen);
        return best;
      }
    }
    return null;
  }

  function extractJobTitle() {
    return (
      document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText.trim() ||
      document.querySelector('.jobs-unified-top-card__job-title h1')?.innerText.trim() ||
      document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText.trim() ||
      document.querySelector('[class*="unified-top-card__job-title"]')?.innerText.trim() ||
      document.querySelector('.scaffold-layout__detail h1')?.innerText.trim() ||
      document.querySelector('h1.t-24')?.innerText.trim() ||
      document.title.replace(/^\(\d+\)\s*/, '').replace(' | LinkedIn', '').trim()
    );
  }

  function extractCompany() {
    return (
      document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText.trim() ||
      document.querySelector('.jobs-unified-top-card__company-name a')?.innerText.trim() ||
      ''
    );
  }

  // ── Phase 1: Detect job ───────────────────────────────────────────────────────
  function tryDetectNow(session) {
    if (_dead || session !== _initSession) return null;
    const jobText = extractJD();
    if (!jobText) return null;
    const jobTitle = extractJobTitle();
    const company  = extractCompany();
    console.log('[RM] Job detected:', jobTitle, '|', company);
    storeJobData(jobText, jobTitle, company);
    return { jobText, jobTitle, company };
  }

  // ── Wait for JD — polling, session-aware ──────────────────────────────────────
  // skipImmediate: true when triggered by SPA navigation — wait at least one
  // poll cycle (500 ms) before checking so LinkedIn has time to update the panel.
  function waitForJD(session, skipImmediate) {
    return new Promise((resolve) => {
      if (_dead || session !== _initSession) return resolve(null);

      if (!skipImmediate) {
        const found = tryDetectNow(session);
        if (found) return resolve(found);
      }

      expandJD();

      let attempts = 0;
      const poll = trackInterval(() => {
        // Abort if the URL has changed (new job clicked)
        if (session !== _initSession) { clearTracked(poll); resolve(null); return; }
        attempts++;
        const result = tryDetectNow(session);
        if (result) { clearTracked(poll); resolve(result); return; }
        if (attempts === 3) expandJD();
        if (attempts >= 14) { clearTracked(poll); resolve(null); }
      }, 500);
    });
  }

  // ── Phase 2: Inject button ────────────────────────────────────────────────────
  function findApplyContainer() {
    const byAria = document.querySelector(
      'button[aria-label*="Easy Apply"], a[aria-label*="Easy Apply"], button[aria-label*="Apply now"]'
    );
    if (byAria?.offsetParent) return byAria;

    for (const el of document.querySelectorAll('button, a[role="button"]')) {
      const txt = (el.innerText || el.textContent || '').trim();
      if (/^(Easy Apply|Apply now|Apply)$/.test(txt) && el.offsetParent !== null) return el;
    }

    for (const sel of [
      '.jobs-apply-button--top-card',
      '.jobs-apply-button',
      '.jobs-s-apply',
      '.job-details-jobs-unified-top-card__primary-actions',
      '.jobs-unified-top-card__primary-actions',
    ]) {
      const el = document.querySelector(sel);
      if (el?.offsetParent) return el;
    }
    return null;
  }

  let _buttonInjected = false;

  function waitForApplyButton(session) {
    return new Promise((resolve) => {
      if (_dead || session !== _initSession) return resolve(null);

      const found = findApplyContainer();
      if (found) return resolve(found);

      let attempts = 0;
      const poll = trackInterval(() => {
        if (session !== _initSession) { clearTracked(poll); resolve(null); return; }
        attempts++;
        const btn = findApplyContainer();
        if (btn) { clearTracked(poll); resolve(btn); return; }
        if (attempts >= 10) { clearTracked(poll); resolve(null); }
      }, 500);
    });
  }

  async function injectButton(jobData, session) {
    if (_buttonInjected || _dead || session !== _initSession) return;

    const applyEl = await waitForApplyButton(session);

    if (_buttonInjected || _dead || session !== _initSession) return;
    _buttonInjected = true;

    if (applyEl) {
      const container = applyEl.closest(
        '[class*="primary-actions"], [class*="apply-button"], .jobs-s-apply'
      ) || applyEl.parentElement || applyEl;
      console.log('[RM] Injecting ATS button next to:', container.className || 'element');
      injectAtsButton(container, (btn) => {
        setButtonFeedback(btn, '✓ Ready — click the toolbar icon', 2500);
        storeJobData(jobData.jobText, jobData.jobTitle, jobData.company);
      });
    } else {
      console.log('[RM] Apply button not found — injecting floating fallback');
      _injectFloatingButton(jobData);
    }
  }

  function _injectFloatingButton(jobData) {
    const existing = document.getElementById('rm-ats-btn');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.id = 'rm-ats-btn';
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/></svg> ATS Screen`;
    btn.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99999',
      'display:inline-flex', 'align-items:center', 'gap:6px',
      'background:#1D4ED8', 'color:white', 'border:none', 'cursor:pointer',
      'padding:10px 18px', 'border-radius:24px',
      'font-size:13px', 'font-weight:700',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
      'box-shadow:0 4px 12px rgba(29,78,216,0.45)',
    ].join(';');
    btn.addEventListener('click', () => {
      if (_dead) return;
      btn.textContent = '✓ Ready — click the toolbar icon';
      storeJobData(jobData.jobText, jobData.jobTitle, jobData.company);
      setTimeout(() => {
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ATS Screen`;
      }, 2500);
    });
    document.body.appendChild(btn);
  }

  // ── Debug helper ──────────────────────────────────────────────────────────────
  window.__rmDebug = function () {
    console.group('[RM] Debug info');
    console.log('URL:', location.href);
    console.log('Context valid:', isContextValid());
    console.log('Script dead:', _dead);
    console.log('Active intervals:', _intervals.size);
    console.log('Init session:', _initSession);
    console.log('Running:', _running);
    JD_SELECTORS.forEach(sel => {
      const el = document.querySelector(sel);
      console.log(' ', sel, '→', el ? `found (${el.innerText.trim().length} chars)` : 'not found');
    });
    console.log('JD result:', (extractJD() || '').slice(0, 100) + '...');
    console.log('Job title:', extractJobTitle());
    console.log('Company:', extractCompany());
    console.groupEnd();
  };

  // ── Main init ─────────────────────────────────────────────────────────────────
  let _running = false;
  let _initSession = 0; // incremented on each URL change to cancel stale runs

  function isJobPage() {
    return /^\/jobs\//.test(location.pathname);
  }

  // skipImmediate: set true when called from SPA navigation so we wait for
  // LinkedIn to update the detail panel before reading the JD.
  async function init(skipImmediate = false) {
    if (_dead) return;
    if (!isContextValid()) { shutdown(); return; }
    if (!isJobPage()) return;
    if (_running) return;

    const session = _initSession; // capture at start
    _running = true;
    _buttonInjected = false;

    const old = document.getElementById('rm-ats-btn');
    if (old) old.remove();

    try {
      const jobData = await waitForJD(session, skipImmediate);
      if (session !== _initSession || _dead) return;
      if (!isContextValid()) { shutdown(); return; }

      if (jobData) {
        await injectButton(jobData, session);
      } else {
        console.log('[RM] LinkedIn: no JD found within 7 s — run window.__rmDebug() for details');
      }
    } finally {
      // Only release the lock if we're still the active session
      if (session === _initSession) _running = false;
    }
  }

  console.log('[RM] LinkedIn script loaded. Run window.__rmDebug() to diagnose.');
  init();

  // ── SPA navigation ────────────────────────────────────────────────────────────
  let _lastUrl = location.href;
  trackInterval(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;

      // Cancel the currently running init (if any) by bumping the session.
      _initSession++;
      _running = false;
      _buttonInjected = false;

      // Immediately wipe stored job data so the popup never shows stale info
      // from the previous job while the new one is being detected.
      storeJobData('', '', '');

      const old = document.getElementById('rm-ats-btn');
      if (old) old.remove();

      // 600 ms is enough for LinkedIn's panel to swap content.
      // skipImmediate=true adds one extra 500 ms poll so we don't read the
      // panel mid-transition. Total time to first JD check: ~1100 ms.
      setTimeout(() => init(true), 600);
    }
  // Poll every 500 ms so URL changes are detected within half a second.
  }, 500);

})();
