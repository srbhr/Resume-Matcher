// apps/extension/content/linkedin.js
// Depends on shared/parsers.js and content/shared.js being loaded first (see manifest).

(function () {
  'use strict';

  // ── JD extraction ─────────────────────────────────────────────────────────────
  // Tries class-based selectors first, then falls back to the largest text block.

  const JD_SELECTORS = [
    '.jobs-description__content',
    '.jobs-description',
    '.job-details-about-the-job-module__description',
    '.jobs-box__html-content',
    '[data-job-id] .description__text',
    '.jobs-details__main-content',
    'article.jobs-details',
  ];

  function extractJD() {
    for (const selector of JD_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && (el.innerText || '').trim().length > 150) {
        return el.innerText.trim();
      }
    }
    // Fallback: find largest text block on the right-hand detail pane
    const candidates = document.querySelectorAll(
      '.scaffold-layout__detail section, .scaffold-layout__detail article, main section'
    );
    let best = null, bestLen = 150;
    for (const el of candidates) {
      const len = (el.innerText || '').trim().length;
      if (len > bestLen) { best = el; bestLen = len; }
    }
    return best ? best.innerText.trim() : null;
  }

  // ── Title / company extraction ────────────────────────────────────────────────

  function extractJobTitle() {
    // Look for h1 anywhere in the job detail pane, then fall back to page title
    const el =
      document.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
      document.querySelector('.jobs-unified-top-card__job-title h1') ||
      document.querySelector('h1.t-24') ||
      document.querySelector('h1');
    return el ? el.innerText.trim() : document.title.replace(' | LinkedIn', '').trim();
  }

  function extractCompany() {
    const el =
      document.querySelector('.job-details-jobs-unified-top-card__company-name a') ||
      document.querySelector('.jobs-unified-top-card__company-name a') ||
      document.querySelector('[data-tracking-control-name="public_jobs_topcard-org-name"]');
    return el ? el.innerText.trim() : '';
  }

  // ── Apply button finder ───────────────────────────────────────────────────────
  // LinkedIn class names change often — find the button by visible text instead.

  function findApplyButton() {
    // 1. Look for any visible button whose text includes "Apply"
    const buttons = Array.from(document.querySelectorAll(
      'button, a[role="button"]'
    ));
    const applyBtn = buttons.find(b => {
      const txt = (b.innerText || b.textContent || '').trim();
      return (txt === 'Easy Apply' || txt === 'Apply' || txt === 'Apply now') &&
             b.offsetParent !== null; // must be visible
    });
    if (applyBtn) return applyBtn;

    // 2. Class-based fallbacks
    const classSelectors = [
      '.jobs-apply-button--top-card',
      '.jobs-apply-button',
      '.jobs-s-apply',
      '.job-details-jobs-unified-top-card__primary-actions',
      '.jobs-unified-top-card__primary-actions',
    ];
    for (const sel of classSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  // ── Main init ─────────────────────────────────────────────────────────────────

  let _injected = false; // prevent duplicate buttons within the same page load

  async function init() {
    _injected = false;

    // Wait up to 5 s for an apply button to appear
    const applyBtn = await new Promise((resolve) => {
      const check = () => {
        const btn = findApplyButton();
        if (btn) return resolve(btn);
      };
      check();
      const obs = new MutationObserver(check);
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, 5000);
    });

    if (!applyBtn) {
      console.debug('[RM] LinkedIn: apply button not found within 5 s');
      return;
    }
    if (_injected) return;
    _injected = true;

    const jobText = extractJD();
    if (!jobText) {
      console.debug('[RM] LinkedIn: could not extract JD');
      return;
    }

    const jobTitle = extractJobTitle();
    const company  = extractCompany();

    // Pre-cache for popup
    chrome.runtime.sendMessage({
      type: 'JOB_DETECTED',
      payload: { jobText, jobTitle, company },
    });

    injectAtsButton(applyBtn, (btn) => {
      setButtonFeedback(btn, '✓ Ready — click the toolbar icon', 2500);
      chrome.runtime.sendMessage({
        type: 'JOB_DETECTED',
        payload: { jobText, jobTitle, company },
      });
    });
  }

  init();

  // ── SPA navigation handler ────────────────────────────────────────────────────
  // LinkedIn is a SPA — re-run when the URL changes (clicking a different job).

  let _lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      setTimeout(init, 900); // wait for LinkedIn to finish rendering the new job
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
