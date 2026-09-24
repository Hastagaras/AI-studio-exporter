const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const {
  AlignmentError,
  buildShareGPT,
  convertMindTags
} = require('../sharegpt.js');

function pythonJsonl(record) {
  const script = [
    'import json, sys',
    'record = json.loads(sys.stdin.read())',
    'sys.stdout.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\\n")'
  ].join('\n');

  return execFileSync('python3', ['-c', script], {
    input: JSON.stringify(record),
    encoding: 'utf8'
  });
}

function exportTurns(turns, options) {
  const result = buildShareGPT(turns, options);
  assert.equal(result.jsonl, pythonJsonl(result.record));
  assert.equal(result.jsonl.endsWith('\n'), true);
  assert.equal(result.jsonl.trim().includes('\n'), false);
  return result;
}

test('converts MIND tags without reformatting the rest of the text', () => {
  assert.equal(
    convertMindTags('[MIND]\nthought\n[/MIND]\nanswer'),
    '<think>\nthought\n</think>\nanswer'
  );
});

test('saves system as the first turn only when the chat has one and the setting is on', () => {
  const turns = [
    { role: 'user', text: 'Hello' },
    { role: 'model', text: 'Hi' }
  ];

  const withSystem = exportTurns(turns, {
    includeSystem: true,
    system: 'You are a tutor.',
    skipTurns: 0
  });

  assert.deepEqual(withSystem.record, {
    conversations: [
      { from: 'system', value: 'You are a tutor.' },
      { from: 'human', value: 'Hello' },
      { from: 'gpt', value: 'Hi' }
    ]
  });

  const settingOff = exportTurns(turns, {
    includeSystem: false,
    system: 'You are a tutor.',
    skipTurns: 0
  });
  assert.deepEqual(settingOff.record.conversations[0], { from: 'human', value: 'Hello' });
  assert.equal(
    settingOff.record.conversations.some((message) => message.from === 'system'),
    false
  );

  const noSystem = exportTurns(turns, {
    includeSystem: true,
    system: '   ',
    skipTurns: 0
  });
  assert.equal(noSystem.record.conversations[0].from, 'human');
  assert.equal(Object.keys(noSystem.record).join(','), 'conversations');
});

test('skip turns accepts any whole number and does not count system', () => {
  const turns = [
    { role: 'user', text: 'H1' },
    { role: 'model', text: 'G1' },
    { role: 'user', text: 'H2' },
    { role: 'model', text: 'G2' },
    { role: 'user', text: 'H3' },
    { role: 'model', text: 'G3' },
    { role: 'user', text: 'H4' },
    { role: 'model', text: 'G4' }
  ];
  const system = 'Be brief.';

  assert.equal(exportTurns(turns, { skipTurns: 0, includeSystem: true, system }).record.conversations.length, 9);

  const skippedOne = exportTurns(turns, { skipTurns: 1, includeSystem: true, system });
  assert.deepEqual(skippedOne.record.conversations.map((message) => message.value), [
    'Be brief.',
    'H2',
    'G2',
    'H3',
    'G3',
    'H4',
    'G4'
  ]);

  const skippedThree = exportTurns(turns, { skipTurns: 3, includeSystem: false, system });
  assert.deepEqual(skippedThree.record.conversations, [
    { from: 'human', value: 'H4' },
    { from: 'gpt', value: 'G4' }
  ]);
});

test('skipping every pair refuses to write an empty file', () => {
  assert.throws(
    () => buildShareGPT(
      [
        { role: 'user', text: 'H1' },
        { role: 'model', text: 'G1' }
      ],
      { skipTurns: 1, includeSystem: true, system: 'still here' }
    ),
    AlignmentError
  );
});

test('rejects a non-whole skip count', () => {
  assert.throws(
    () => buildShareGPT([{ role: 'user', text: 'Hi' }], { skipTurns: 1.5 }),
    /whole number/
  );
});

test('keeps a trailing human after an even pair skip, matching the converter', () => {
  const result = exportTurns(
    [
      { role: 'user', text: 'H1' },
      { role: 'model', text: 'G1' },
      { role: 'user', text: 'H2' }
    ],
    { skipTurns: 1, includeSystem: false }
  );

  assert.deepEqual(result.record.conversations, [
    { from: 'human', value: 'H2' }
  ]);
});

test('converts inline MIND tags inside the assistant turn', () => {
  const result = exportTurns(
    [
      { role: 'user', text: 'Why?' },
      { role: 'model', text: '[MIND]\nplan\n[/MIND]\nBecause.' }
    ],
    { includeReasoning: true, skipTurns: 0 }
  );

  assert.equal(result.record.conversations[1].value, '<think>\nplan\n</think>\nBecause.');
});

test('strips thinking when reasoning is disabled', () => {
  const result = exportTurns(
    [
      { role: 'user', text: 'Why?' },
      { role: 'model', text: '[MIND]\nsecret\n[/MIND]\nBecause.' }
    ],
    { includeReasoning: false, skipTurns: 0 }
  );

  assert.equal(result.record.conversations[1].value, 'Because.');
});

test('merges consecutive same-role turns from DOM extraction', () => {
  const result = exportTurns(
    [
      { role: 'user', text: 'Part A', position: 1 },
      { role: 'user', text: 'Part B', position: 2 },
      { role: 'model', text: 'Done', position: 3 }
    ],
    { allowMerge: true, skipTurns: 0 }
  );

  assert.equal(result.record.conversations[0].value, 'Part A\nPart B');
  assert.equal(result.warnings.length, 1);
});

test('does not silently drop an empty user or assistant turn', () => {
  assert.throws(
    () => buildShareGPT(
      [
        { role: 'user', text: '   ', position: 4 },
        { role: 'model', text: 'Answer' }
      ],
      { allowMerge: false }
    ),
    /turn #4/
  );
});

test('drops a leading model turn instead of mis-aligning skip', () => {
  const result = exportTurns(
    [
      { role: 'model', text: 'orphan' },
      { role: 'user', text: 'H1' },
      { role: 'model', text: 'G1' }
    ],
    { skipTurns: 0 }
  );

  assert.deepEqual(result.record.conversations, [
    { from: 'human', value: 'H1' },
    { from: 'gpt', value: 'G1' }
  ]);
  assert.match(result.warnings[0], /dropped leading 'gpt'/);
});

test('preserves unicode the same way Python json.dumps does', () => {
  const result = exportTurns(
    [
      { role: 'user', text: 'café — 你好' },
      { role: 'model', text: 'ok' }
    ],
    { skipTurns: 0, includeSystem: true, system: '系统' }
  );

  assert.equal(
    result.jsonl,
    '{"conversations":[{"from":"system","value":"系统"},{"from":"human","value":"café — 你好"},{"from":"gpt","value":"ok"}]}\n'
  );
});
