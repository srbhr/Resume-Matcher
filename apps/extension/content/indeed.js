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

  async function init() {
    if (!isContextValid()) return;

    let applyContainer = null;
    for (const selector of APPLY_SELECTORS) {
      applyContainer = await waitForElement(selector, 4000);
      if (applyContainer) break;
    }

    if (!isContextValid()) return; // extension reloaded while waiting

    if (!applyContainer) {
      console.debug('[RM] Indeed: apply button not found');
      return;
    }

    const jobText = extractJD();
    if (!jobText) {
      console.debug('[RM] Indeed: could not extract JD');
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
