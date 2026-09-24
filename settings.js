const AI_STUDIO_DEFAULT_SETTINGS = Object.freeze({
  includeSystem: true,
  skipTurns: 0,
  scrapeReasoning: true,
  loadDelay: 700
});

const OBSOLETE_SETTING_KEYS = Object.freeze([
  'scrapeImages',
  'scrapeAttachments',
  'scrapeAttachmentPreview',
  'scrapeAttachmentTitle',
  'scrapeAttachmentSize'
]);

function sanitizeSettings(raw = {}) {
  const sanitized = { ...AI_STUDIO_DEFAULT_SETTINGS };

  const coerceBoolean = (value, fallback) =>
    typeof value === 'boolean' ? value : fallback;

  sanitized.includeSystem = coerceBoolean(raw.includeSystem, sanitized.includeSystem);
  sanitized.scrapeReasoning = coerceBoolean(raw.scrapeReasoning, sanitized.scrapeReasoning);

  const parsedSkip = Number(raw.skipTurns);
  if (Number.isInteger(parsedSkip) && parsedSkip >= 0 && parsedSkip <= Number.MAX_SAFE_INTEGER) {
    sanitized.skipTurns = parsedSkip;
  }

  const parsedDelay = Number(raw.loadDelay);
  if (Number.isFinite(parsedDelay) && parsedDelay >= 200 && parsedDelay <= 5000) {
    sanitized.loadDelay = Math.round(parsedDelay);
  }

  return sanitized;
}

function describeSkipTurns(skipTurns) {
  const count = Number.isInteger(skipTurns) && skipTurns >= 0 ? skipTurns : 0;

  if (count === 0) {
    return '0 keeps every user + assistant pair.';
  }

  if (count === 1) {
    return '1 drops the first user message and its assistant reply. System is not counted.';
  }

  return `${count} drops the first ${count} user + assistant pairs (${count * 2} messages). System is not counted.`;
}

function describeExportSettings(settings) {
  const safe = sanitizeSettings(settings);
  const skipText = safe.skipTurns === 0
    ? 'keeping every pair'
    : `skipping ${safe.skipTurns} opening pair${safe.skipTurns === 1 ? '' : 's'}`;
  const systemText = safe.includeSystem
    ? 'system saved only if this chat has one'
    : 'system omitted';

  return `ShareGPT JSONL, text only, ${skipText}, ${systemText}.`;
}

function isAIStudioUrl(maybeUrl) {
  try {
    const parsed = new URL(maybeUrl);
    return parsed.protocol === 'https:' &&
      parsed.hostname === 'aistudio.google.com' &&
      /^\/(?:u\/\d+\/)?prompts\//.test(parsed.pathname);
  } catch (error) {
    return false;
  }
}
