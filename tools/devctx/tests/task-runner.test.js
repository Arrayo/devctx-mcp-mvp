import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTaskRunner } from '../src/task-runner.js';
import { initializeStateDb } from '../src/storage/sqlite.js';
import { smartSummary } from '../src/tools/smart-summary.js';
import { projectRoot, setProjectRoot } from '../src/utils/runtime-config.js';
import { buildIndex, persistIndex } from '../src/index.js';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const SKIP_SQLITE_TESTS = nodeMajor < 22;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const originalProjectRoot = projectRoot;
let taskRunnerRoot = null;

before(() => {
  if (SKIP_SQLITE_TESTS) return;
  taskRunnerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-task-runner-'));
  setProjectRoot(taskRunnerRoot);
  execFileSync('git', ['init'], { cwd: taskRunnerRoot, stdio: 'ignore' });
  fs.mkdirSync(path.join(taskRunnerRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(taskRunnerRoot, 'src', 'auth.js'), 'export function loginHandler(token) { return { ok: Boolean(token) }; }\n', 'utf8');
  fs.writeFileSync(path.join(taskRunnerRoot, 'src', 'auth.test.js'), 'import { loginHandler } from "./auth.js";\nexport const smoke = () => loginHandler("token").ok;\n', 'utf8');
  const index = buildIndex(taskRunnerRoot);
  persistIndex(index, taskRunnerRoot);
});

after(() => {
  if (SKIP_SQLITE_TESTS) return;
  setProjectRoot(originalProjectRoot);
  if (taskRunnerRoot) {
    fs.rmSync(taskRunnerRoot, { recursive: true, force: true });
  }
});

const waitForLockReady = async ({ child, signalPath }) => {
  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (fs.existsSync(signalPath)) {
      return;
    }

    const exitCode = child.exitCode;
    if (exitCode !== null) {
      throw new Error(`lock holder exited before signaling readiness (code ${exitCode}): ${stderr || 'no stderr'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`lock holder did not signal readiness before timeout: ${stderr || 'no stderr'}`);
};

test('task runner review command uses workflow prompt and wrapper in dry-run mode', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const result = await runTaskRunner({
    commandName: 'review',
    client: 'cursor',
    prompt: 'Review the latest auth changes and call out risks first',
    dryRun: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.command, 'review');
  assert.match(result.prompt, /Perform a code review/i);
  assert.equal(result.workflowPolicy.policyMode, 'review_guided');
  assert.equal(result.workflowPolicy.preflight.tool, 'smart_context');
  assert.ok(Array.isArray(result.workflowPolicy.preflight.topFiles));
  assert.doesNotMatch(result.prompt, /\[object Object\]/);
  assert.match(result.wrappedPrompt, /next tools:/i);
  assert.ok(result.sessionId);

  await smartSummary({ action: 'reset', sessionId: result.sessionId });
});

test('task runner debug command captures smart_search preflight guidance', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const result = await runTaskRunner({
    commandName: 'debug',
    client: 'cursor',
    prompt: 'Investigate loginHandler failures and narrow the root cause',
    dryRun: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.command, 'debug');
  assert.equal(result.workflowPolicy.policyMode, 'debug_guided');
  assert.equal(result.workflowPolicy.preflight.tool, 'smart_search');
  assert.ok(result.workflowPolicy.preflight.totalMatches >= 0);

  await smartSummary({ action: 'reset', sessionId: result.sessionId });
});

test('task runner task command adds generic workflow policy and continuity guidance', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const result = await runTaskRunner({
    commandName: 'task',
    client: 'cursor',
    prompt: 'Inspect loginHandler and continue the auth follow-up safely',
    dryRun: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.command, 'task');
  assert.equal(result.workflowPolicy.policyMode, 'task_guided');
  assert.equal(result.workflowPolicy.preflight.tool, 'smart_context');
  assert.match(result.prompt, /Workflow policy:/i);
  assert.match(result.prompt, /Continuity:/i);

  await smartSummary({ action: 'reset', sessionId: result.sessionId });
});

test('task runner implement command uses implementation-specific policy and preflight', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const result = await runTaskRunner({
    commandName: 'implement',
    client: 'cursor',
    prompt: 'Add a guard around loginHandler token handling and preserve current behavior',
    dryRun: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.command, 'implement');
  assert.equal(result.workflowPolicy.policyMode, 'implement_guided');
  assert.equal(result.workflowPolicy.preflight.tool, 'smart_context');
  assert.match(result.prompt, /Implementation target:/i);

  await smartSummary({ action: 'reset', sessionId: result.sessionId });
});

test('task runner continue command reuses persisted next-step guidance when resuming', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await smartSummary({
    action: 'update',
    sessionId: 'task-runner-continue',
    update: {
      goal: 'Continue the auth follow-up work',
      status: 'in_progress',
      currentFocus: 'Auth token flow',
      nextStep: 'Inspect loginHandler and keep the token guard behavior intact',
    },
  });

  const result = await runTaskRunner({
    commandName: 'continue',
    client: 'cursor',
    sessionId: 'task-runner-continue',
    dryRun: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.command, 'continue');
  assert.equal(result.workflowPolicy.policyMode, 'continue_guided');
  assert.equal(result.workflowPolicy.preflight.tool, 'smart_context');
  assert.match(result.prompt, /Persisted next step:/i);
  assert.match(result.prompt, /loginHandler/i);

  await smartSummary({ action: 'reset', sessionId: 'task-runner-continue' });
});

test('task runner review dry-run tolerates transient SQLite locks', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const filePath = path.join(taskRunnerRoot, '.devctx', 'state.sqlite');
  const lockHolderScript = path.join(taskRunnerRoot, 'lock-holder.mjs');
  const lockSignalPath = path.join(taskRunnerRoot, '.devctx', 'lock-holder.ready');
  const sqliteModulePath = path.resolve(__dirname, '..', 'src', 'storage', 'sqlite.js').replace(/\\/g, '\\\\');

  fs.writeFileSync(lockHolderScript, `
    import { openStateDb } from '${sqliteModulePath}';
    import fs from 'node:fs';

    const [filePath, holdMs, signalPath] = process.argv.slice(2);
    const db = await openStateDb({ filePath });
    db.exec('BEGIN IMMEDIATE');
    db.prepare("INSERT INTO meta(key, value) VALUES('lock_probe', 'held') ON CONFLICT(key) DO UPDATE SET value = 'held'").run();
    fs.writeFileSync(signalPath, 'locked\\n', 'utf8');
    setTimeout(() => {
      try {
        db.exec('COMMIT');
      } finally {
        try {
          fs.unlinkSync(signalPath);
        } catch {}
        db.close();
        process.exit(0);
      }
    }, Number(holdMs) || 250);
  `, 'utf8');

  await initializeStateDb({ filePath });

  const child = spawn(process.execPath, [lockHolderScript, filePath, '250', lockSignalPath], {
    cwd: taskRunnerRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForLockReady({ child, signalPath: lockSignalPath });

    const result = await runTaskRunner({
      commandName: 'review',
      client: 'cursor',
      prompt: 'Review the auth changes while another short-lived writer is active',
      dryRun: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.command, 'review');

    if (child.exitCode === null) {
      await once(child, 'exit');
    }
    await smartSummary({ action: 'reset', sessionId: result.sessionId });
  } finally {
    try {
      child.kill('SIGTERM');
    } catch {}
    try {
      fs.unlinkSync(lockSignalPath);
    } catch {}
    try {
      fs.unlinkSync(lockHolderScript);
    } catch {}
  }
});

test('task runner pauses workflow execution and runs doctor when repo safety blocks persistence', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await smartSummary({
    action: 'update',
    sessionId: 'task-runner-blocked',
    update: {
      goal: 'Blocked task runner',
      status: 'in_progress',
      nextStep: 'Fix git hygiene',
    },
  });

  fs.writeFileSync(path.join(taskRunnerRoot, '.gitignore'), '.devctx/\n', 'utf8');
  execFileSync('git', ['add', '-f', '.devctx/state.sqlite'], { cwd: taskRunnerRoot, stdio: 'ignore' });

  try {
    const result = await runTaskRunner({
      commandName: 'task',
      client: 'cursor',
      prompt: 'Continue the blocked workflow and keep the state consistent',
      command: 'fake-agent',
      args: ['run'],
      runCommand: async () => {
        throw new Error('runCommand should not execute when the runner is blocked');
      },
    });

    assert.equal(result.success, false);
    assert.equal(result.blocked, true);
    assert.equal(result.doctor.overall, 'error');
    assert.ok(result.recommendedActions.length >= 1);
  } finally {
    execFileSync('git', ['rm', '--cached', '-f', '.devctx/state.sqlite'], { cwd: taskRunnerRoot, stdio: 'ignore' });
    await smartSummary({ action: 'reset', sessionId: 'task-runner-blocked' });
  }
});

test('task runner checkpoint command forwards end-of-turn updates', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  await smartSummary({
    action: 'update',
    sessionId: 'task-runner-checkpoint',
    update: {
      goal: 'Checkpoint task runner',
      status: 'in_progress',
    },
  });

  const result = await runTaskRunner({
    commandName: 'checkpoint',
    client: 'cursor',
    sessionId: 'task-runner-checkpoint',
    event: 'milestone',
    update: {
      nextStep: 'Review the checkpointed session state',
      currentFocus: 'Task runner checkpoint test',
    },
  });

  assert.equal(result.phase, 'end');
  assert.equal(result.checkpoint.skipped, false);
  assert.equal(result.checkpoint.checkpoint.event, 'milestone');

  const summary = await smartSummary({
    action: 'get',
    sessionId: 'task-runner-checkpoint',
  });
  assert.match(summary.summary.nextStep, /Review the checkpointed session state/i);

  await smartSummary({ action: 'reset', sessionId: 'task-runner-checkpoint' });
});

test('task runner cleanup command supports all-mode planning', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const result = await runTaskRunner({
    commandName: 'cleanup',
    client: 'cursor',
    cleanupMode: 'all',
  });

  assert.equal(result.command, 'cleanup');
  assert.equal(result.cleanupMode, 'all');
  assert.ok(result.result.compact);
  assert.ok(result.result.legacy);
});

test('task runner auto-detects client from CURSOR_AGENT env var', { skip: SKIP_SQLITE_TESTS ? 'SQLite support requires Node 22+' : false }, async () => {
  const originalCursorAgent = process.env.CURSOR_AGENT;
  process.env.CURSOR_AGENT = '1';

  try {
    const result = await runTaskRunner({
      commandName: 'cleanup',
      cleanupMode: 'compact',
    });

    assert.equal(result.command, 'cleanup');
    assert.ok(result.result);
  } finally {
    if (originalCursorAgent !== undefined) {
      process.env.CURSOR_AGENT = originalCursorAgent;
    } else {
      delete process.env.CURSOR_AGENT;
    }
  }
});
