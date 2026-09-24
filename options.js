const elements = {
  includeSystem: document.getElementById('includeSystem'),
  skipTurns: document.getElementById('skipTurns'),
  skipTurnsHint: document.getElementById('skipTurnsHint'),
  scrapeReasoning: document.getElementById('scrapeReasoning'),
  loadDelay: document.getElementById('loadDelay'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  statusMsg: document.getElementById('statusMsg')
};

document.addEventListener('DOMContentLoaded', loadSettings);
elements.saveBtn.addEventListener('click', saveSettings);
elements.resetBtn.addEventListener('click', resetSettings);
elements.skipTurns.addEventListener('input', updateSkipHint);

function updateSkipHint() {
  const value = Number(elements.skipTurns.value);
  const count = elements.skipTurns.value.trim() !== '' && Number.isInteger(value) && value >= 0
    ? value
    : 0;

  elements.skipTurnsHint.textContent = describeSkipTurns(count);
}

function loadSettings() {
  chrome.storage.sync.get(AI_STUDIO_DEFAULT_SETTINGS, (settings) => {
    const safeSettings = sanitizeSettings(settings);

    elements.includeSystem.checked = safeSettings.includeSystem;
    elements.skipTurns.value = safeSettings.skipTurns;
    elements.scrapeReasoning.checked = safeSettings.scrapeReasoning;
    elements.loadDelay.value = safeSettings.loadDelay;
    updateSkipHint();
  });
}

function readSkipTurns() {
  if (elements.skipTurns.value.trim() === '') {
    return null;
  }

  const value = Number(elements.skipTurns.value);
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function persistSettings(settings, message) {
  chrome.storage.sync.set(settings, () => {
    chrome.storage.sync.remove(OBSOLETE_SETTING_KEYS, () => {
      if (chrome.runtime.lastError) {
        showStatus(chrome.runtime.lastError.message);
        return;
      }

      showStatus(message);
    });
  });
}

function saveSettings() {
  const skipTurns = readSkipTurns();
  if (skipTurns === null) {
    showStatus('Skip turns must be a whole number: 0, 1, 2, 3, ...');
    return;
  }

  const settings = sanitizeSettings({
    includeSystem: elements.includeSystem.checked,
    skipTurns,
    scrapeReasoning: elements.scrapeReasoning.checked,
    loadDelay: elements.loadDelay.value
  });

  elements.skipTurns.value = settings.skipTurns;
  elements.loadDelay.value = settings.loadDelay;
  updateSkipHint();
  persistSettings(settings, 'Settings saved');
}

function resetSettings() {
  if (!confirm('Reset all settings to default?')) {
    return;
  }

  chrome.storage.sync.set(AI_STUDIO_DEFAULT_SETTINGS, () => {
    chrome.storage.sync.remove(OBSOLETE_SETTING_KEYS, () => {
      loadSettings();
      showStatus('Settings reset to defaults');
    });
  });
}

function showStatus(message) {
  elements.statusMsg.textContent = message;
  elements.statusMsg.classList.add('show');
  setTimeout(() => {
    elements.statusMsg.classList.remove('show');
  }, 3000);
}
