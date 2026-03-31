import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('runtime config defaults project root to cwd when no project root env is provided', async () => {
  const runtimeConfig = pathToFileURL(
    path.resolve(__dirname, '..', 'src', 'utils', 'runtime-config.js')
  ).href;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-runtime-config-'));
  const originalCwd = process.cwd();
  const originalProjectRootEnv = process.env.DEVCTX_PROJECT_ROOT;
  const originalMcpProjectRootEnv = process.env.MCP_PROJECT_ROOT;

  try {
    process.chdir(tmpDir);
    delete process.env.DEVCTX_PROJECT_ROOT;
    delete process.env.MCP_PROJECT_ROOT;

    const runtimeModule = await import(`${runtimeConfig}?cwd=${Date.now()}`);
    assert.strictEqual(runtimeModule.projectRoot, tmpDir);
    assert.strictEqual(runtimeModule.projectRootSource, 'cwd');
  } finally {
    process.chdir(originalCwd);
    if (originalProjectRootEnv === undefined) {
      delete process.env.DEVCTX_PROJECT_ROOT;
    } else {
      process.env.DEVCTX_PROJECT_ROOT = originalProjectRootEnv;
    }
    if (originalMcpProjectRootEnv === undefined) {
      delete process.env.MCP_PROJECT_ROOT;
    } else {
      process.env.MCP_PROJECT_ROOT = originalMcpProjectRootEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
