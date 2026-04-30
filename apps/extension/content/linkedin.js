// apps/extension/content/linkedin.js
// Depends on shared/parsers.js and content/shared.js being loaded first (see manifest).

(function () {
  'use strict';

  // Selectors for the job description text
  const JD_SELECTORS = [
    '.jobs-description__content',
    '.jobs-description',
    '[data-job-id] .description__text',
    // Feed / collections layout (right-hand panel)
    '.job-details-about-the-job-module__description',
    '.jobs-box__html-content',
  ];

  // Selectors for the container that holds the Easy Apply / Apply button
  const APPLY_SELECTORS = [
    '.jobs-apply-button--top-card',
    '.jobs-s-apply',
    '.job-details-jobs-unified-top-card__primary-actions',
    '.jobs-unified-top-card__primary-actions',
    // Feed / collections layout
    '.jobs-details__main-content .mt4',
    '.job-details-jobs-unified-top-card__container--two-pane',
  ];

  function extractJobTitle() {
    const el = document.querySelector(
      '.job-details-jobs-unified-top-card__job-title h1, ' +
      '.jobs-unified-top-card__job-title h1, ' +
      '.t-24.t-bold'
    );
    return el ? el.innerText.trim() : document.title.replace(' | LinkedIn', '').trim();
  }

  function extractCompany() {
    const el = document.querySelector(
      '.job-details-jobs-unified-top-card__company-name a, ' +
      '.jobs-unified-top-card__company-name a'
    );
    return el ? el.innerText.trim() : '';
  }

  function extractJD() {
    for (const selector of JD_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && (el.innerText || '').length > 100) return (el.innerText || '').trim();
    }
    return null;
  }

  async function init() {
    // LinkedIn renders dynamically — wait for the apply button container
    let applyContainer = null;
    for (const selector of APPLY_SELECTORS) {
      applyContainer = await waitForElement(selector, 4000);
      if (applyContainer) break;
    }

    if (!applyContainer) {
      console.debug('[RM] LinkedIn: apply button not found');
      return;
    }

    const jobText = extractJD();
    if (!jobText) {
      console.debug('[RM] LinkedIn: could not extract JD');
      return;
    }

    const jobTitle = extractJobTitle();
    const company  = extractCompany();

    // Pre-cache the JD so the popup can read it immediately
    chrome.runtime.sendMessage({
      type: 'JOB_DETECTED',
      payload: { jobText, jobTitle, company },
    });

    injectAtsButton(applyContainer, (btn) => {
      setButtonFeedback(btn, '✓ Ready — click the toolbar icon', 2500);
      // Re-send in case the service worker restarted
      chrome.runtime.sendMessage({
        type: 'JOB_DETECTED',
        payload: { jobText, jobTitle, company },
      });
    });
  }

  init();

  // LinkedIn is a SPA — re-run when the URL changes (user clicks a different job in the feed)
  let _lastJobId = new URL(location.href).searchParams.get('currentJobId') || location.pathname;
  new MutationObserver(() => {
    const jobId = new URL(location.href).searchParams.get('currentJobId') || location.pathname;
    if (jobId !== _lastJobId) {
      _lastJobId = jobId;
      setTimeout(init, 800); // brief delay for LinkedIn to finish rendering the new job
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
