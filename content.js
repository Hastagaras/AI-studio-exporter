/***
 * Content script for AI Studio ShareGPT Exporter
 * Extracts a Google AI Studio conversation and downloads one ShareGPT JSONL line.
 *
 * System is the first turn only when this chat actually has system instructions
 * and the setting is on. Otherwise the file starts at the first message.
 * Skip turns drops N opening user+assistant pairs (0, 1, 2, 3, ...).
 *
 * @version 2.0.0
 * @license MIT
 */

(function () {
  'use strict';

  const CONFIG = {
    ELEMENT_LOAD_DELAY: 700
  };

  let isExporting = false;
  let shouldCancel = false;
  const ALLOWED_ACTIONS = new Set(['export', 'getStatus', 'cancel']);
  console.log('AI Studio ShareGPT Exporter content script loaded');

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const sleep = async (ms) => {
    let remaining = ms;

    while (remaining > 0) {
      if (shouldCancel) {
        throw new Error('Export cancelled by user');
      }

      const chunk = Math.min(100, remaining);
      await wait(chunk);
      remaining -= chunk;
    }
  };

  function showLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'ai-studio-export-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      backdrop-filter: blur(8px);
      pointer-events: all;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: #25262b;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      text-align: center;
      max-width: 440px;
      width: 90%;
      border: 1px solid #2c2e33;
      color: #e9ecef;
    `;

    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 50px;
      height: 50px;
      border: 3px solid rgba(102, 126, 234, 0.2);
      border-top: 3px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px;
    `;

    if (!document.querySelector('#ai-studio-export-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'ai-studio-export-spinner-style';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    const title = document.createElement('h2');
    title.id = 'ai-studio-export-title';
    title.textContent = 'Exporting ShareGPT JSONL...';
    title.style.cssText = `
      margin: 0 0 12px 0;
      color: #fff;
      font-size: 20px;
      font-weight: 600;
    `;

    const message = document.createElement('p');
    message.id = 'ai-studio-export-status';
    message.textContent = 'Initializing export process...';
    message.style.cssText = `
      margin: 0;
      color: #a5a5a5;
      font-size: 14px;
      line-height: 1.6;
      word-break: break-word;
    `;

    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #2c2e33;
    `;

    const progressText = document.createElement('div');
    progressText.id = 'ai-studio-export-progress';
    progressText.textContent = 'Starting...';
    progressText.style.cssText = `
      color: #667eea;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel Export';
    cancelBtn.style.cssText = `
      background: transparent;
      border: 1px solid #c92a2a;
      color: #ff8787;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 500;
    `;
    cancelBtn.onmouseover = () => {
      cancelBtn.style.background = 'rgba(201, 42, 42, 0.1)';
    };
    cancelBtn.onmouseout = () => {
      cancelBtn.style.background = 'transparent';
    };
    cancelBtn.onclick = () => {
      shouldCancel = true;
      cancelBtn.textContent = 'Cancelling...';
      cancelBtn.disabled = true;
      cancelBtn.style.opacity = '0.7';
      cancelBtn.style.cursor = 'not-allowed';
    };

    progressContainer.appendChild(progressText);
    progressContainer.appendChild(cancelBtn);
    content.appendChild(spinner);
    content.appendChild(title);
    content.appendChild(message);
    content.appendChild(progressContainer);
    overlay.appendChild(content);

    overlay.addEventListener('mousedown', (event) => event.stopPropagation());
    overlay.addEventListener('mouseup', (event) => event.stopPropagation());
    overlay.addEventListener('click', (event) => event.stopPropagation());
    overlay.addEventListener('scroll', (event) => event.preventDefault());
    overlay.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
    overlay.addEventListener('keydown', (event) => event.preventDefault());
    overlay.addEventListener('keyup', (event) => event.preventDefault());

    document.body.appendChild(overlay);
    return overlay;
  }

  function updateLoadingStatus(message, progress) {
    const statusEl = document.getElementById('ai-studio-export-status');
    const progressEl = document.getElementById('ai-studio-export-progress');

    if (statusEl) {
      statusEl.textContent = message;
    }

    if (progressEl && progress) {
      progressEl.textContent = progress;
    }
  }

  function showExportFailure(message) {
    const title = document.getElementById('ai-studio-export-title');
    if (title) {
      title.textContent = 'Export failed';
    }

    updateLoadingStatus(message, 'Nothing was saved');

    const button = document.querySelector('#ai-studio-export-overlay button');
    if (button) {
      button.style.display = 'none';
    }
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('ai-studio-export-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
    }
  }

  function queryAllDeep(selector, root = document, out = []) {
    if (root.querySelectorAll) {
      out.push(...root.querySelectorAll(selector));
    }

    const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const element of elements) {
      if (element.shadowRoot) {
        queryAllDeep(selector, element.shadowRoot, out);
      }
    }

    return out;
  }

  function fieldLabel(element) {
    return [
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
      element.getAttribute('name'),
      element.getAttribute('id')
    ].filter(Boolean).join(' ');
  }

  function isSystemInstructionField(element) {
    return /system instructions?/i.test(fieldLabel(element));
  }

  function readFieldValue(element) {
    if (!element) {
      return '';
    }

    if (typeof element.value === 'string') {
      return element.value.trim();
    }

    if (element.isContentEditable) {
      return (element.innerText || '').trim();
    }

    return '';
  }

  function findSystemField() {
    const fields = queryAllDeep('textarea, input, [contenteditable="true"]');
    const labeled = fields.find(isSystemInstructionField);
    if (labeled) {
      return labeled;
    }

    const hosts = queryAllDeep('ms-system-instructions, ms-system-instruction, [class*="system-instruction"]');
    for (const host of hosts) {
      const nested = host.querySelector?.('textarea, input, [contenteditable="true"]');
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  function findSystemInstructionButton() {
    return queryAllDeep('button').find((button) => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.innerText || ''}`;
      return /system instructions?/i.test(label);
    }) || null;
  }

  // null means the field is not in the DOM yet. An empty string means this
  // chat has no system instructions.
  function readSystemInstructionValue() {
    const field = findSystemField();
    if (!field) {
      return null;
    }

    return readFieldValue(field);
  }

  async function extractSystemInstructions() {
    const already = readSystemInstructionValue();

    // Field is already in the page. Empty means this chat has no system prompt.
    if (already !== null) {
      return already;
    }

    const button = findSystemInstructionButton();

    if (!button) {
      return '';
    }

    button.click();

    try {
      await sleep(CONFIG.ELEMENT_LOAD_DELAY);
      const opened = readSystemInstructionValue();
      return opened || '';
    } finally {
      const closeButton = findSystemInstructionButton() || button;
      closeButton.click();
      await wait(Math.min(CONFIG.ELEMENT_LOAD_DELAY, 300));
    }
  }

  function chunkText(element) {
    const visible = (element.innerText || '').trim();
    if (visible) {
      return visible;
    }

    return (element.textContent || '').replace(/^\s+/, '').replace(/\s+$/, '');
  }

  function extractTurnText(chatTurn) {
    const chunks = Array.from(chatTurn.querySelectorAll('ms-text-chunk'))
      .filter((element) => !element.closest('.mat-expansion-panel-body'));

    return chunks
      .map(chunkText)
      .filter(Boolean)
      .join('\n');
  }

  function hasMindMarker(text) {
    return text.includes('[MIND]')
      || text.includes('[/MIND]')
      || text.includes('<think>')
      || text.includes('</think>');
  }

  async function extractReasoningText(chatTurn) {
    const chevronButton = Array.from(chatTurn.querySelectorAll('span')).find(
      (span) => span.textContent.trim() === 'chevron_right'
    );

    if (!chevronButton) {
      return null;
    }

    let opened = false;

    try {
      chevronButton.click();
      opened = true;
      await sleep(CONFIG.ELEMENT_LOAD_DELAY);

      const expansionPanel = chatTurn.querySelector('.mat-expansion-panel-body ms-text-chunk');
      if (!expansionPanel) {
        return null;
      }

      return expansionPanel.textContent.replace(/^\s+/, '').replace(/\s+$/, '');
    } finally {
      if (opened) {
        chevronButton.click();
        await wait(CONFIG.ELEMENT_LOAD_DELAY);
      }
    }
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        AI_STUDIO_DEFAULT_SETTINGS,
        (settings) => resolve(sanitizeSettings(settings))
      );
    });
  }

  async function processChatTurn(chatTurn, settings, position) {
    chatTurn.scrollIntoView();
    await sleep(CONFIG.ELEMENT_LOAD_DELAY);

    const turnContainer = chatTurn.querySelector('[data-turn-role]');
    if (!turnContainer) {
      return null;
    }

    const role = turnContainer.getAttribute('data-turn-role') || '';
    const normalized = role.toLowerCase();

    if (normalized !== 'user' && normalized !== 'model') {
      return null;
    }

    let text = extractTurnText(chatTurn);

    if (normalized === 'model' && settings.scrapeReasoning) {
      const reasoningText = await extractReasoningText(chatTurn);

      if (reasoningText && !hasMindMarker(text)) {
        text = text
          ? `[MIND]\n${reasoningText}\n[/MIND]\n${text}`
          : `[MIND]\n${reasoningText}\n[/MIND]`;
      }
    }

    if (!text.trim()) {
      const media = chatTurn.querySelector('img, ms-file-chunk, video, audio');
      if (media) {
        throw new AIStudioShareGPT.AlignmentError(
          `turn #${position} (${role}) is media-only. Image and file export was removed, and dropping this turn would break human/gpt alternation.`
        );
      }

      throw new AIStudioShareGPT.AlignmentError(
        `turn #${position} (${role}) has no usable text - dropping it would break human/gpt alternation`
      );
    }

    return {
      role: normalized,
      text,
      position
    };
  }

  function isRawModeEnabled() {
    return document.body.innerHTML.includes('Show conversation with markdown formatting');
  }

  function getMoreActionsButton() {
    return document.querySelector('button[aria-label="View more actions"]');
  }

  function getRawOutputToggleButton() {
    return document.querySelector('button[aria-label="Toggle viewing raw output"]');
  }

  async function ensureMoreActionsMenuOpen() {
    const moreActionsButton = getMoreActionsButton();
    if (!moreActionsButton) {
      throw new Error('Could not find "View more actions" button');
    }

    let rawOutputButton = getRawOutputToggleButton();
    if (rawOutputButton) {
      return { moreActionsButton, rawOutputButton };
    }

    moreActionsButton.click();
    await sleep(CONFIG.ELEMENT_LOAD_DELAY / 5);

    rawOutputButton = getRawOutputToggleButton();
    if (!rawOutputButton) {
      throw new Error('Could not find "Toggle viewing raw output" button');
    }

    return { moreActionsButton, rawOutputButton };
  }

  async function closeMoreActionsMenuIfOpen() {
    if (!getRawOutputToggleButton()) {
      return;
    }

    const moreActionsButton = getMoreActionsButton();
    if (!moreActionsButton) {
      return;
    }

    moreActionsButton.click();
    await wait(CONFIG.ELEMENT_LOAD_DELAY / 5);
  }

  async function revertRawMode() {
    try {
      const { rawOutputButton } = await ensureMoreActionsMenuOpen();
      rawOutputButton.click();
      await wait(CONFIG.ELEMENT_LOAD_DELAY);

      if (isRawModeEnabled()) {
        console.warn('Warning: Failed to disable raw output mode');
      }
    } catch (revertError) {
      console.warn('Warning: Failed to revert raw output mode', revertError);
    } finally {
      await closeMoreActionsMenuIfOpen();
    }
  }

  function safeFilename(title) {
    const cleaned = String(title || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, 80);

    return cleaned || 'conversation';
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'application/jsonl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function exportConversation() {
    if (isExporting) {
      return { success: false, message: 'Export already in progress' };
    }

    if (!globalThis.AIStudioShareGPT) {
      return { success: false, message: 'ShareGPT exporter failed to load' };
    }

    let rawModeToggledOn = false;

    try {
      isExporting = true;
      shouldCancel = false;

      const settings = await getSettings();
      CONFIG.ELEMENT_LOAD_DELAY = settings.loadDelay;

      showLoadingOverlay();

      let systemText = '';
      if (settings.includeSystem) {
        updateLoadingStatus('Checking this chat for system instructions...', 'Step 1/5: System');
        systemText = await extractSystemInstructions();

        if (systemText) {
          console.log(`System instructions found (${systemText.length} chars)`);
        } else {
          console.log('No system instructions in this chat; file will start at the first message');
        }
      } else {
        console.log('System prompt saving is off');
      }

      if (shouldCancel) {
        throw new Error('Export cancelled by user');
      }

      updateLoadingStatus(
        'Enabling raw output mode...',
        settings.includeSystem ? 'Step 2/5: Setup' : 'Step 1/4: Setup'
      );

      let initialRawModeEnabled = false;
      try {
        const { rawOutputButton } = await ensureMoreActionsMenuOpen();
        initialRawModeEnabled = isRawModeEnabled();
        console.log(`Initial raw mode state: ${initialRawModeEnabled ? 'ON' : 'OFF'}`);

        if (!initialRawModeEnabled) {
          console.log('Toggling raw output mode ON...');
          rawOutputButton.click();
          rawModeToggledOn = true;
          await sleep(CONFIG.ELEMENT_LOAD_DELAY * 5);

          if (!isRawModeEnabled()) {
            throw new Error('Failed to enable raw output mode');
          }
        }
      } finally {
        await closeMoreActionsMenuIfOpen();
      }

      if (shouldCancel) {
        throw new Error('Export cancelled by user');
      }

      updateLoadingStatus('Scanning conversation...', 'Scanning');
      const chatTurns = document.querySelectorAll('ms-chat-turn');
      console.log(`Found ${chatTurns.length} chat turns`);

      if (chatTurns.length === 0) {
        throw new Error('No chat turns found');
      }

      const turns = [];

      for (let i = 0; i < chatTurns.length; i += 1) {
        if (shouldCancel) {
          throw new Error('Export cancelled by user');
        }

        updateLoadingStatus(
          'Extracting messages...',
          `Processing ${i + 1}/${chatTurns.length}`
        );

        const turn = await processChatTurn(chatTurns[i], settings, i + 1);
        if (turn) {
          turns.push(turn);
        }
      }

      if (shouldCancel) {
        throw new Error('Export cancelled by user');
      }

      updateLoadingStatus('Writing ShareGPT JSONL...', 'Packaging');

      const built = AIStudioShareGPT.buildShareGPT(turns, {
        skipTurns: settings.skipTurns,
        includeReasoning: settings.scrapeReasoning,
        includeSystem: settings.includeSystem,
        system: systemText,
        allowMerge: true
      });

      built.warnings.forEach((warning) => {
        console.warn(`[WARN] ${warning}`);
      });

      const titleElement = document.querySelector('.actions.pointer.mode-title');
      const conversationTitle = titleElement ? titleElement.innerText.trim() : 'Untitled Conversation';
      const filename = `${safeFilename(conversationTitle)}.jsonl`;

      downloadTextFile(filename, built.jsonl);

      const savedSystem = built.record.conversations[0]?.from === 'system';
      const summary = savedSystem
        ? `Saved ${built.record.conversations.length} messages, including system`
        : `Saved ${built.record.conversations.length} messages`;

      if (built.warnings.length) {
        updateLoadingStatus(built.warnings[0], `${summary}, with ${built.warnings.length} warning(s)`);
        await wait(2200);
      } else {
        updateLoadingStatus(`Downloaded ${filename}`, summary);
        await wait(700);
      }

      console.log('Export completed successfully', filename);

      return {
        success: true,
        message: `${summary} to ${filename}`,
        filename
      };
    } catch (error) {
      console.error('Export failed:', error);
      showExportFailure(error.message || 'Export failed');
      await wait(/cancelled by user/i.test(error.message || '') ? 800 : 3200);

      return {
        success: false,
        message: error.message
      };
    } finally {
      shouldCancel = false;

      if (rawModeToggledOn) {
        console.log('Reverting raw output mode to original state...');
        await revertRawMode();
      }

      isExporting = false;
      hideLoadingOverlay();
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const senderUrl = sender?.url;
    const isInternalMessage = sender?.id === chrome.runtime.id &&
      (!senderUrl || senderUrl.startsWith(chrome.runtime.getURL('')));

    if (!isInternalMessage) {
      sendResponse?.({ success: false, message: 'Invalid sender' });
      return false;
    }

    if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.action !== 'string') {
      sendResponse?.({ success: false, message: 'Invalid request' });
      return false;
    }

    if (!ALLOWED_ACTIONS.has(request.action)) {
      sendResponse({ success: false, message: 'Unsupported action' });
      return false;
    }

    if (request.action === 'export') {
      exportConversation().then(sendResponse);
      return true;
    }

    if (request.action === 'getStatus') {
      sendResponse({ isExporting });
      return false;
    }

    shouldCancel = true;
    sendResponse({ success: true });
    return false;
  });
})();
