// apps/extension/content/linkedin.js
// Depends on shared/parsers.js and content/shared.js being loaded first (see manifest).

(function () {
  'use strict';

  // ── Extension context guard ───────────────────────────────────────────────────
  function safeSendMessage(msg) {
    try { chrome.runtime.sendMessage(msg); } catch (_) {}
  }

  // ── JD extraction — multiple strategies ──────────────────────────────────────
  const JD_SELECTORS = [
    '.jobs-description__content',
    '.jobs-description',
    '.job-details-about-the-job-module__description',
    '.jobs-box__html-content',
    '[data-job-id] .description__text',
    '.jobs-details__main-content',
    // Collections / split-pane layout
    '.scaffold-layout__detail .jobs-search__job-details',
  ];

  function extractJD() {
    // Strategy 1: known selectors (scoped to the right-hand detail panel first)
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

    // Strategy 2: largest text block INSIDE the detail panel only
    // (avoids picking up the search-results sidebar on /jobs/search/ pages)
    if (detailPanel) {
      let best = null, bestLen = 300;
      detailPanel.querySelectorAll('div, section, article').forEach(el => {
        const txt = el.innerText.trim();
        if (txt.length > bestLen && txt.split('\n').length > 5) {
          best = txt;
          bestLen = txt.length;
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
    // Prefer job-specific title elements (inside the detail panel) over page-level h1
    // which on /jobs/search/ is the search count like "(4) Product Manager Jobs"
    return (
      document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText.trim() ||
      document.querySelector('.jobs-unified-top-card__job-title h1')?.innerText.trim() ||
      document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText.trim() ||
      document.querySelector('[class*="unified-top-card__job-title"]')?.innerText.trim() ||
      document.querySelector('.scaffold-layout__detail h1')?.innerText.trim() ||
      document.querySelector('h1.t-24')?.innerText.trim() ||
      // Last resort: page title — but strip the search-results prefix "(N) "
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
  function tryDetectNow() {
    const jobText = extractJD();
    if (!jobText) return null;
    const jobTitle = extractJobTitle();
    const company  = extractCompany();
    console.log('[RM] Sending JOB_DETECTED:', jobTitle, '|', company);
    safeSendMessage({ type: 'JOB_DETECTED', payload: { jobText, jobTitle, company } });
    return { jobText, jobTitle, company };
  }

  function waitForJD() {
    return new Promise((resolve) => {
      const found = tryDetectNow();
      if (found) return resolve(found);

      const obs = new MutationObserver(() => {
        const result = tryDetectNow();
        if (result) { obs.disconnect(); resolve(result); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, 7000);
    });
  }

  // ── Phase 2: Inject button ────────────────────────────────────────────────────
  function findApplyContainer() {
    // Try aria-label on the button itself
    const byAria = document.querySelector(
      'button[aria-label*="Easy Apply"], a[aria-label*="Easy Apply"], button[aria-label*="Apply now"]'
    );
    if (byAria?.offsetParent) return byAria;

    // Try visible text
    for (const el of document.querySelectorAll('button, a[role="button"]')) {
      const txt = (el.innerText || el.textContent || '').trim();
      if (/^(Easy Apply|Apply now|Apply)$/.test(txt) && el.offsetParent !== null) return el;
    }

    // Try class names
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

  async function injectButton(jobData) {
    if (_buttonInjected) return;

    // Wait up to 5 s for the apply button
    const applyEl = await new Promise((resolve) => {
      const found = findApplyContainer();
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const btn = findApplyContainer();
        if (btn) { obs.disconnect(); resolve(btn); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, 5000);
    });

    if (_buttonInjected) return;
    _buttonInjected = true;

    if (applyEl) {
      // Insert into the button's parent container so it sits alongside Apply
      const container = applyEl.closest(
        '[class*="primary-actions"], [class*="apply-button"], .jobs-s-apply'
      ) || applyEl.parentElement || applyEl;
      console.log('[RM] Injecting ATS button next to:', container.className || 'element');
      injectAtsButton(container, (btn) => {
        setButtonFeedback(btn, '✓ Ready — click the toolbar icon', 2500);
        safeSendMessage({ type: 'JOB_DETECTED', payload: jobData });
      });
    } else {
      // Fallback: floating button pinned to bottom-right of the detail panel
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
      btn.textContent = '✓ Ready — click the toolbar icon';
      safeSendMessage({ type: 'JOB_DETECTED', payload: jobData });
      setTimeout(() => { btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ATS Screen`; }, 2500);
    });
    document.body.appendChild(btn);
  }

  // ── Debug helper (call window.__rmDebug() in DevTools console) ───────────────
  window.__rmDebug = function () {
    console.group('[RM] Debug info');
    console.log('URL:', location.href);
    console.log('JD selectors found:');
    JD_SELECTORS.forEach(sel => {
      const el = document.querySelector(sel);
      console.log(' ', sel, '→', el ? `found (${el.innerText.trim().length} chars)` : 'not found');
    });
    console.log('Apply button (aria):', document.querySelector('button[aria-label*="Easy Apply"], a[aria-label*="Easy Apply"]'));
    console.log('Apply button (text):',
      Array.from(document.querySelectorAll('button')).find(b => /Apply/.test(b.innerText)));
    console.log('JD extraction result:', (extractJD() || '').slice(0, 100) + '...');
    console.log('Job title:', extractJobTitle());
    console.log('Company:', extractCompany());
    console.groupEnd();
  };
  console.log('[RM] LinkedIn script loaded. Run window.__rmDebug() to diagnose.');

  // ── Main init ─────────────────────────────────────────────────────────────────
  let _running = false;

  async function init() {
    if (_running) return;
    _running = true;
    _buttonInjected = false;

    const old = document.getElementById('rm-ats-btn');
    if (old) old.remove();

    try {
      const jobData = await waitForJD();
      if (jobData) {
        injectButton(jobData).catch(() => {});
      } else {
        console.log('[RM] LinkedIn: no JD found within 7 s — run window.__rmDebug() for details');
      }
    } finally {
      _running = false;
    }
  }

  init();

  // ── SPA navigation ────────────────────────────────────────────────────────────
  let _lastUrl = location.href;
  setInterval(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      setTimeout(init, 1000);
    }
  }, 1000);

})();
