#!/usr/bin/env node
import { handleClaudeHookEvent } from '../src/hooks/claude-hooks.js';

const readStdin = async () => {
  let buffer = '';
  for await (const chunk of process.stdin) {
    buffer += chunk;
  }
  return buffer.trim();
};

const main = async () => {
  const raw = await readStdin();
  if (!raw) {
    return;
  }

  const input = JSON.parse(raw);
  const result = await handleClaudeHookEvent(input);

  if (!result) {
    return;
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
};

main().catch((error) => {
  if (process.env.DEVCTX_DEBUG === '1') {
    process.stderr.write(`devctx claude hook error: ${error.message}\n`);
  }
  process.exit(0);
});
