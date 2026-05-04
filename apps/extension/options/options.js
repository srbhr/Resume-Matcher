// apps/extension/options/options.js

const backendInput = document.getElementById('backend-url');
const frontendInput = document.getElementById('frontend-url');
const saveBtn      = document.getElementById('save-btn');
const testBtn      = document.getElementById('test-btn');
const testStatus   = document.getElementById('test-status');
const savedMsg     = document.getElementById('saved-msg');

async function load() {
  const data = await chrome.storage.local.get(['backendUrl', 'frontendUrl']);
  backendInput.value  = data.backendUrl  || 'http://localhost:8000';
  frontendInput.value = data.frontendUrl || 'http://localhost:3000';
}

saveBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({
    backendUrl:  backendInput.value.trim().replace(/\/$/, ''),
    frontendUrl: frontendInput.value.trim().replace(/\/$/, ''),
  });
  savedMsg.style.display = 'inline';
  setTimeout(() => { savedMsg.style.display = 'none'; }, 2000);
});

testBtn.addEventListener('click', async () => {
  const url = backendInput.value.trim().replace(/\/$/, '');
  testStatus.textContent = 'Testing…';
  testStatus.className   = 'status';
  try {
    const res = await fetch(`${url}/api/v1/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      testStatus.textContent = '✅ Connected';
      testStatus.className   = 'status ok';
    } else {
      testStatus.textContent = `❌ HTTP ${res.status}`;
      testStatus.className   = 'status err';
    }
  } catch {
    testStatus.textContent = '❌ Unreachable';
    testStatus.className   = 'status err';
  }
});

load();
