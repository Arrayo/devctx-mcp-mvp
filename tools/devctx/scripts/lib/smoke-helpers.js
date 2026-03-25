import assert from 'node:assert/strict';

export const getTextResult = (result) => result.content
  .filter((item) => item.type === 'text')
  .map((item) => item.text)
  .join('\n');

export const parseToolJson = (result) => JSON.parse(getTextResult(result));

export const createRecorder = () => {
  const checks = [];

  return {
    checks,
    record(name, details = {}) {
      checks.push({ name, ok: true, ...details });
    },
  };
};

export const emitJson = (payload) => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

export const assertContains = (value, expected, label) => {
  if (!expected) {
    assert.ok(String(value).length > 0, `${label} is empty`);
    return;
  }

  assert.match(String(value), new RegExp(expected), `${label} did not match ${expected}`);
};

export const formatError = (error, stderrOutput = '') => {
  const sections = [error instanceof Error ? error.stack ?? error.message : String(error)];

  if (stderrOutput.trim()) {
    sections.push(`Captured server stderr:\n${stderrOutput.trim()}`);
  }

  return sections.join('\n\n');
};
