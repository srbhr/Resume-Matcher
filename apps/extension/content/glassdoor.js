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

  /** Poll for JD text — mirrors linkedin.js waitForJD pattern. */
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

    // Poll for JD — Glassdoor sometimes loads the description after the button
    const jobText = await waitForJD();
    if (!jobText) {
      console.debug('[RM] Glassdoor: could not extract JD after polling');
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
