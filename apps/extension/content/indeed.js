// apps/extension/content/indeed.js
// Depends on shared/parsers.js and content/shared.js being loaded first.

(function () {
  'use strict';

  const JD_SELECTORS = [
    '#jobDescriptionText',
    '.jobsearch-jobDescriptionText',
    '[data-testid="jobDescriptionText"]',
  ];

  const APPLY_SELECTORS = [
    '#applyButtonLinkContainer',
    '.jobsearch-IndeedApplyButton-newDesign',
    '[data-testid="applyButton"]',
    '.ia-IndeedApplyButton',
  ];

  function extractJobTitle() {
    const el = document.querySelector(
      '[data-testid="jobsearch-JobInfoHeader-title"] span, ' +
      '.jobsearch-JobInfoHeader-title span, ' +
      'h1.jobsearch-JobInfoHeader-title'
    );
    return el ? el.innerText.trim() : document.title.split(' - ')[0].trim();
  }

  function extractCompany() {
    const el = document.querySelector(
      '[data-testid="inlineHeader-companyName"] a, ' +
      '.jobsearch-InlineCompanyRating a, ' +
      '[data-company-name]'
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

  /** Race all apply-button selectors in parallel — first one wins. */
  function waitForAnyElement(selectors, timeoutMs) {
    return Promise.race(selectors.map(sel => waitForElement(sel, timeoutMs)));
  }

  /** Poll for JD text until it appears or times out. */
  async function waitForJD(timeoutMs = 8000, intervalMs = 400) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isContextValid()) return null;
      const text = extractJD();
      if (text) return text;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }

  async function init() {
    if (!isContextValid()) return;

    // Race all selectors in parallel instead of waiting 4s per selector sequentially
    const applyContainer = await waitForAnyElement(APPLY_SELECTORS, 8000);

    if (!isContextValid()) return; // extension reloaded while waiting

    if (!applyContainer) {
      console.debug('[RM] Indeed: apply button not found');
      return;
    }

    // Poll for JD — Indeed sometimes renders description after the apply button
    const jobText = await waitForJD();
    if (!jobText) {
      console.debug('[RM] Indeed: could not extract JD after polling');
      return;
    }

    const jobTitle = extractJobTitle();
    const company  = extractCompany();

    storeJobData(jobText, jobTitle, company);

    injectAtsButton(applyContainer, (btn) => {
      setButtonFeedback(btn, '✓ Ready — click the toolbar icon', 2500);
      storeJobData(jobText, jobTitle, company);
    });
  }

  init();

})();
