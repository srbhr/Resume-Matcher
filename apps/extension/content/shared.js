// apps/extension/content/shared.js
// Loaded before every site-specific content script. Defines globals used by linkedin.js, etc.

/**
 * Returns true if the extension context is still valid.
 * After an extension reload the runtime.id becomes undefined and any API call
 * throws "Extension context invalidated." — this guard prevents those errors.
 */
function isContextValid() {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.id; } catch (_) { return false; }
}

/**
 * Writes job data directly to chrome.storage.local.
 * This avoids chrome.runtime.sendMessage() entirely — sendMessage() routes
 * through the background service worker and Chrome logs a network-level
 * "GET chrome-extension://invalid/ net::ERR_FAILED" entry whenever the
 * context is in a transitional state, even inside try/catch.
 * chrome.storage.local.set() is a direct storage call that does not go
 * through the SW, so it never generates those network entries.
 */
function storeJobData(jobText, jobTitle, company) {
  if (!isContextValid()) return;
  try {
    chrome.storage.local.set({
      currentJobText:  jobText  || '',
      currentJobTitle: jobTitle || '',
      currentCompany:  company  || '',
    });
  } catch (_) {}
}

/**
 * Waits for a DOM element matching selector to appear, up to maxMs milliseconds.
 * Uses polling instead of MutationObserver to avoid the infinite-loop problem
 * that occurs when a MutationObserver callback itself mutates the DOM (e.g. by
 * clicking a button).  Also bails out immediately if the extension context
 * becomes invalid (after a reload).
 *
 * @param {string} selector
 * @param {number} maxMs
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, maxMs = 3000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const interval = 250; // ms between polls
    const maxAttempts = Math.ceil(maxMs / interval);
    let attempts = 0;

    const poll = setInterval(() => {
      attempts++;

      // Stop if extension was reloaded
      if (!isContextValid()) {
        clearInterval(poll);
        resolve(null);
        return;
      }

      const found = document.querySelector(selector);
      if (found) {
        clearInterval(poll);
        resolve(found);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        resolve(null);
      }
    }, interval);
  });
}

/**
 * Injects the ATS Screen button immediately after referenceEl.
 * Removes any previous #rm-ats-btn first (handles page re-navigation).
 * @param {Element} referenceEl  Element to insert after
 * @param {function(HTMLButtonElement): void} onClickFn  Called with the button when clicked
 * @returns {HTMLButtonElement}
 */
function injectAtsButton(referenceEl, onClickFn) {
  const existing = document.getElementById('rm-ats-btn');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = 'rm-ats-btn';
  btn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:6px',
    'background:#1D4ED8',
    'color:white',
    'border:none',
    'cursor:pointer',
    'padding:7px 14px',
    'border-radius:20px',
    'font-size:12px',
    'font-weight:700',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
    'box-shadow:0 2px 6px rgba(29,78,216,0.35)',
    'transition:opacity 0.15s',
    'white-space:nowrap',
  ].join(';');

  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
         stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    ATS Screen`;

  btn.addEventListener('click', () => onClickFn(btn));
  referenceEl.insertAdjacentElement('afterend', btn);
  return btn;
}

/**
 * Temporarily changes the button's inner text, then restores original HTML.
 * @param {HTMLButtonElement} btn
 * @param {string} message  Plain-text message to show
 * @param {number} durationMs
 */
function setButtonFeedback(btn, message, durationMs = 2000) {
  const original = btn.innerHTML;
  btn.textContent = message;
  btn.style.opacity = '0.75';
  setTimeout(() => {
    btn.innerHTML = original;
    btn.style.opacity = '1';
  }, durationMs);
}
