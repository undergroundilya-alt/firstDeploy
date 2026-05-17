const DEFAULTS = { enabled: false, mode: 'hybrid' };

const enabledEl = document.getElementById('enabled');
const modeEl = document.getElementById('mode');
const reloadEl = document.getElementById('reload');

function queryActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs && tabs[0]));
  });
}

function sendSettingsToTab(settings) {
  queryActiveTab().then(tab => {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, {
      type: 'LOCAL_TEST_ADBLOCKER_APPLY',
      settings
    }, () => void chrome.runtime.lastError);
  });
}

function save() {
  const settings = {
    enabled: enabledEl.checked,
    mode: modeEl.value
  };

  chrome.storage.local.set(settings, () => sendSettingsToTab(settings));
}

chrome.storage.local.get(DEFAULTS, settings => {
  enabledEl.checked = !!settings.enabled;
  modeEl.value = settings.mode || DEFAULTS.mode;
});

abledHandlers();

function abledHandlers() {
  enabledEl.addEventListener('change', save);
  modeEl.addEventListener('change', save);
  reloadEl.addEventListener('click', async () => {
    const tab = await queryActiveTab();
    if (tab && tab.id) chrome.tabs.reload(tab.id);
  });
}
