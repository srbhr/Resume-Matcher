// apps/extension/content/glassdoor.js
// Depends on shared/parsers.js and content/shared.js being loaded first.

(function () {
  'use strict';

  const JD_SELECTORS = [
    '[class*="JobDescription_jobDescription"]',
    '[data-test="jobDescriptionText"]',
    '[class*="jobDescriptionContent"]',
    '.desc',
  ];

  const APPLY_SELECTORS = [
    '[data-test="applyButton"]',
    '[class*="ApplyButton"]',
    'button[class*="apply"]',
  ];

  function extractJobTitle() {
    const el = document.querySelector(
      '[data-test="job-title"], [class*="JobDetails_jobTitle"], h1'
    );
    return el ? el.innerText.trim() : document.title.split(' - ')[0].trim();
  }

  function extractCompany() {
    const el = document.querySelector(
      '[data-test="employer-name"], [class*="EmployerProfile_name"]'
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
      applyContainer = await waitForElement(selector, 5000);
      if (applyContainer) break;
    }

    if (!isContextValid()) return; // extension reloaded while waiting

    if (!applyContainer) {
      console.debug('[RM] Glassdoor: apply button not found');
      return;
    }

    const jobText = extractJD();
    if (!jobText) {
      console.debug('[RM] Glassdoor: could not extract JD');
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
