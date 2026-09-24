/**
 * ShareGPT JSONL builder for AI Studio conversations.
 *
 * One conversation is one JSONL line:
 *   {"conversations":[{"from":"human","value":"..."},{"from":"gpt","value":"..."}]}
 *
 * A system turn is inserted only when the caller found a real system
 * prompt AND system saving is enabled:
 *   {"conversations":[{"from":"system","value":"..."}, ...]}
 *
 * Skip turns drops N opening user+assistant pairs (0, 1, 2, 3, ...).
 * The system turn is never counted.
 */
(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.AIStudioShareGPT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class AlignmentError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AlignmentError';
    }
  }

  function replaceAll(text, search, replacement) {
    return String(text).split(search).join(replacement);
  }

  function convertMindTags(text) {
    return replaceAll(replaceAll(text, '[MIND]', '<think>'), '[/MIND]', '</think>');
  }

  function stripMindBlocks(text) {
    return String(text)
      .replace(/\[MIND\][\s\S]*?\[\/MIND\]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function speakerForRole(role) {
    const name = String(role || '').trim().toLowerCase();

    if (name === 'user' || name === 'human') {
      return 'human';
    }

    if (name === 'model' || name === 'assistant' || name === 'gemini' || name === 'gpt') {
      return 'gpt';
    }

    if (name === 'system') {
      return 'system';
    }

    return null;
  }

  function normalizeSkipTurns(skipTurns) {
    if (!Number.isInteger(skipTurns) || skipTurns < 0) {
      throw new Error('skipTurns must be a whole number: 0, 1, 2, 3, ...');
    }

    return skipTurns;
  }

  /**
   * @param {Array<{role: string, text: string, position?: number}>} turns
   * @param {{
   *   skipTurns?: number,
   *   includeReasoning?: boolean,
   *   includeSystem?: boolean,
   *   system?: string,
   *   allowMerge?: boolean
   * }} [options]
   * @returns {{record: {conversations: Array<{from: string, value: string}>}, warnings: string[], jsonl: string}}
   */
  function buildShareGPT(turns, options = {}) {
    const skipTurns = normalizeSkipTurns(options.skipTurns ?? 0);
    const includeReasoning = options.includeReasoning !== false;
    const allowMerge = options.allowMerge !== false;
    const includeSystem = options.includeSystem === true;
    const system = options.system == null ? '' : String(options.system).trim();
    const warnings = [];
    const pending = [];

    (turns || []).forEach((turn, index) => {
      const position = turn && turn.position != null ? turn.position : index + 1;
      const speaker = speakerForRole(turn && turn.role);

      if (speaker === 'system') {
        warnings.push(
          `turn #${position}: ignored an in-chat system role; system is read from the system-instructions field`
        );
        return;
      }

      if (!speaker) {
        return;
      }

      const rawText = turn.text == null ? '' : String(turn.text);
      const value = includeReasoning ? convertMindTags(rawText) : stripMindBlocks(rawText);

      if (!value.trim()) {
        throw new AlignmentError(
          `turn #${position} (${turn.role}) has no usable text - dropping it would break human/gpt alternation`
        );
      }

      pending.push({
        position,
        message: {
          from: speaker,
          value
        }
      });
    });

    let messages;

    if (allowMerge) {
      const merged = [];

      pending.forEach((item) => {
        const last = merged[merged.length - 1];

        if (last && last.message.from === item.message.from) {
          warnings.push(
            `turns #${last.position}+#${item.position}: consecutive '${item.message.from}' turns merged (export likely dropped a turn in between)`
          );
          last.message.value += `\n${item.message.value}`;
          return;
        }

        merged.push({
          position: item.position,
          message: {
            from: item.message.from,
            value: item.message.value
          }
        });
      });

      messages = merged.map((item) => item.message);
    } else {
      messages = pending.map((item) => item.message);
    }

    for (let i = 1; i < messages.length; i += 1) {
      if (messages[i].from === messages[i - 1].from) {
        throw new AlignmentError(
          `messages #${i} and #${i + 1} are both '${messages[i].from}' - conversation does not strictly alternate human/gpt`
        );
      }
    }

    while (messages.length && messages[0].from !== 'human') {
      warnings.push(
        `dropped leading '${messages[0].from}' turn so pairs start with a user message`
      );
      messages.shift();
    }

    if (skipTurns > 0) {
      messages = messages.slice(skipTurns * 2);
    }

    if (!messages.length) {
      throw new AlignmentError(
        skipTurns > 0
          ? `conversation is empty after skipping ${skipTurns} opening pair${skipTurns === 1 ? '' : 's'}`
          : 'conversation has no usable messages'
      );
    }

    // System is independent of skip-turns. Insert it only when the setting
    // is on AND this chat actually has a system prompt. Otherwise the file
    // starts at the first remaining message.
    if (includeSystem && system) {
      messages.unshift({
        from: 'system',
        value: system
      });
    }

    const record = {
      conversations: messages
    };

    return {
      record,
      warnings,
      jsonl: `${JSON.stringify(record)}\n`
    };
  }

  return {
    AlignmentError,
    convertMindTags,
    stripMindBlocks,
    speakerForRole,
    buildShareGPT
  };
});
