// apps/extension/content/linkedin.js
// Depends on shared/parsers.js and content/shared.js being loaded first (see manifest).

(function () {
  'use strict';

  // ── Extension context guard ───────────────────────────────────────────────────
  // When the extension is reloaded while the page is open, chrome.runtime becomes
  // invalid. Wrap every API call so we don't flood the console with errors.
  function safeSendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg);
    } catch (e) {
      // Extension context invalidated — page needs a refresh, nothing we can do.
    }
  }

  // ── JD extraction ─────────────────────────────────────────────────────────────
  const JD_SELECTORS = [
    '.jobs-description__content',
    '.jobs-description',
    '.job-details-about-the-job-module__description',
    '.jobs-box__html-content',
    '[data-job-id] .description__text',
  ];

  function extractJD() {
    for (const selector of JD_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && (el.innerText || '').trim().length > 150) return el.innerText.trim();
    }
    // Fallback: largest text block in the detail pane
    const candidates = document.querySelectorAll(
      '.scaffold-layout__detail section, .scaffold-layout__detail article'
    );
    let best = null, bestLen = 150;
    for (const el of candidates) {
      const len = (el.innerText || '').trim().length;
      if (len > bestLen) { best = el; bestLen = len; }
    }
    return best ? best.innerText.trim() : null;
  }

  function extractJobTitle() {
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
      document.querySelector('.jobs-unified-top-card__company-name a');
    return el ? el.innerText.trim() : '';
  }

  // ── Apply button finder ───────────────────────────────────────────────────────
  // Uses button text rather than brittle CSS class names.
  function findApplyButton() {
    const all = document.querySelectorAll('button, a[role="button"]');
    for (const b of all) {
      const txt = (b.innerText || b.textContent || '').trim();
      if ((txt === 'Easy Apply' || txt === 'Apply' || txt === 'Apply now') &&
          b.offsetParent !== null) return b;
    }
    // Class-based fallbacks
    const classes = [
      '.jobs-apply-button--top-card',
      '.jobs-apply-button',
      '.jobs-s-apply',
      '.job-details-jobs-unified-top-card__primary-actions',
      '.jobs-unified-top-card__primary-actions',
    ];
    for (const sel of classes) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  // ── Main init ─────────────────────────────────────────────────────────────────
  let _busy = false;

  async function init() {
    if (_busy) return;
    _busy = true;

    try {
      // Remove any leftover button from a previous run (SPA navigation)
      const old = document.getElementById('rm-ats-btn');
      if (old) old.remove();

      // Wait up to 5 s for the apply button using MutationObserver
      const applyBtn = await new Promise((resolve) => {
        const found = findApplyButton();
        if (found) return resolve(found);

        const obs = new MutationObserver(() => {
          const btn = findApplyButton();
          if (btn) { obs.disconnect(); resolve(btn); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(null); }, 5000);
      });

      if (!applyBtn) {
        console.debug('[RM] LinkedIn: apply button not found within 5 s');
        return;
      }

      const jobText = extractJD();
      if (!jobText) {
        console.debug('[RM] LinkedIn: could not extract JD');
        return;
      }

      const jobTitle = extractJobTitle();
      const company  = extractCompany();

      safeSendMessage({ type: 'JOB_DETECTED', payload: { jobText, jobTitle, company } });

      injectAtsButton(applyBtn, (btn) => {
        setButtonFeedback(btn, '✓ Ready — click the toolbar icon', 2500);
        safeSendMessage({ type: 'JOB_DETECTED', payload: { jobText, jobTitle, company } });
      });
    } finally {
      _busy = false;
    }
  }

  init();

  // ── SPA navigation — poll instead of MutationObserver ────────────────────────
  // MutationObserver on LinkedIn fires thousands of times/sec and causes console spam.
  // A 1-second interval poll is much cheaper and works just as well for URL detection.
  let _lastUrl = location.href;
  setInterval(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      setTimeout(init, 900); // wait for LinkedIn to finish rendering the new job
    }
  }, 1000);

})();
