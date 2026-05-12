import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYamlMini } from '../src/playbooks/yaml-mini.js';
import { _internal as loaderInternal, listPlaybookSummaries, loadPlaybooks } from '../src/playbooks/loader.js';
import { interpolate, runPlaybook, _internal as runnerInternal } from '../src/playbooks/runner.js';
import { smartPlaybook } from '../src/tools/smart-playbook.js';
import { setProjectRoot, projectRoot as originalProjectRoot } from '../src/utils/runtime-config.js';

const { validatePlaybook } = loaderInternal;
const { evaluateWhen } = runnerInternal;

describe('playbooks :: yaml-mini parser', () => {
  it('parses scalars + nested maps + sequences of mappings', () => {
    const yaml = [
      'name: preflight',
      'description: "demo"',
      'defaults:',
      '  ref: HEAD',
      '  retries: 3',
      'stopOnFail: true',
      'steps:',
      '  - tool: smart_review',
      '    args:',
      '      ref: "{{args.ref}}"',
      '  - tool: smart_test',
      '    args:',
      '      action: affected',
    ].join('\n');
    const parsed = parseYamlMini(yaml);
    assert.equal(parsed.name, 'preflight');
    assert.equal(parsed.defaults.retries, 3);
    assert.equal(parsed.stopOnFail, true);
    assert.equal(parsed.steps.length, 2);
    assert.equal(parsed.steps[0].tool, 'smart_review');
    assert.equal(parsed.steps[0].args.ref, '{{args.ref}}');
    assert.equal(parsed.steps[1].args.action, 'affected');
  });

  it('handles comments and quoted strings with colons', () => {
    const yaml = [
      '# top comment',
      'name: foo  # inline',
      'description: "uses: this:that"',
      'steps:',
      '  - tool: smart_search',
    ].join('\n');
    const parsed = parseYamlMini(yaml);
    assert.equal(parsed.name, 'foo');
    assert.equal(parsed.description, 'uses: this:that');
    assert.equal(parsed.steps.length, 1);
  });
});

describe('playbooks :: validation', () => {
  it('rejects playbooks without name or steps', () => {
    assert.throws(() => validatePlaybook({}, 'x'), /missing\/invalid 'name'/);
    assert.throws(() => validatePlaybook({ name: 'bad name' }, 'x'), /missing\/invalid 'name'/);
    assert.throws(() => validatePlaybook({ name: 'good', steps: [] }, 'x'), /non-empty array/);
    assert.throws(() => validatePlaybook({ name: 'good', steps: [{}] }, 'x'), /missing 'tool'/);
  });

  it('normalizes defaults + stopOnFail', () => {
    const pb = validatePlaybook({ name: 'a', steps: [{ tool: 'smart_status' }] }, 'x');
    assert.deepEqual(pb.defaults, {});
    assert.equal(pb.stopOnFail, true);
  });
});

describe('playbooks :: interpolation and when', () => {
  it('interpolates {{args.x}} including full-token type preservation', () => {
    const out = interpolate({ a: '{{args.flag}}', b: 'pre-{{args.name}}' }, { args: { flag: true, name: 'X' } });
    assert.equal(out.a, true);
    assert.equal(out.b, 'pre-X');
  });

  it('interpolates inside arrays', () => {
    const out = interpolate({ list: ['{{args.k}}', 'plain'] }, { args: { k: 'kind1' } });
    assert.deepEqual(out.list, ['kind1', 'plain']);
  });

  it('evaluateWhen returns false for empty/false-y', () => {
    assert.equal(evaluateWhen(null, {}), true);
    assert.equal(evaluateWhen('{{args.flag}}', { args: { flag: false } }), false);
    assert.equal(evaluateWhen('{{args.flag}}', { args: { flag: true } }), true);
    assert.equal(evaluateWhen('no', {}), false);
  });
});

describe('playbooks :: built-in load + list', () => {
  let savedRoot;
  let tempRoot;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-playbook-'));
    savedRoot = originalProjectRoot;
    setProjectRoot(tempRoot);
  });

  after(() => {
    setProjectRoot(savedRoot);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('exposes the built-in playbooks (preflight-merge, debug-flake, refactor-safe, doc-sync, ramp-up)', () => {
    const { summaries } = listPlaybookSummaries();
    const names = summaries.map((s) => s.name);
    for (const expected of ['preflight-merge', 'debug-flake', 'refactor-safe', 'doc-sync', 'ramp-up']) {
      assert.ok(names.includes(expected), `missing built-in: ${expected}`);
    }
  });

  it('project overrides built-in', () => {
    const projectDir = path.join(tempRoot, '.devctx', 'playbooks');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'preflight-merge.yaml'), [
      'name: preflight-merge',
      'description: override',
      'steps:',
      '  - tool: smart_status',
    ].join('\n'));

    const { playbooks } = loadPlaybooks();
    const pb = playbooks.get('preflight-merge');
    assert.equal(pb.description, 'override');
    assert.equal(pb.source, 'project');
    assert.equal(pb.steps.length, 1);
    assert.equal(pb.steps[0].tool, 'smart_status');
  });
});

describe('playbooks :: runner', () => {
  it('runs a playbook with mocked tools and respects stopOnFail', async () => {
    const playbook = {
      name: 'test-run',
      defaults: {},
      stopOnFail: true,
      steps: [
        { tool: 'smart_status', args: {}, when: null, label: 'status' },
        { tool: 'smart_review', args: { ref: '{{args.ref}}' }, when: null, label: null },
      ],
    };

    const calls = [];
    const fakeRegistry = {
      smart_status: async (args) => { calls.push(['smart_status', args]); return { success: true, ok: true }; },
      smart_review: async (args) => { calls.push(['smart_review', args]); return { success: true, ref: args.ref }; },
    };

    const result = await runPlaybook(playbook, { ref: 'HEAD' }, { toolRegistry: fakeRegistry });
    assert.equal(result.success, true);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[1].args.ref, 'HEAD');
    assert.deepEqual(calls.map((c) => c[0]), ['smart_status', 'smart_review']);
  });

  it('stops on failure when stopOnFail=true', async () => {
    const playbook = {
      name: 'fail-fast',
      defaults: {},
      stopOnFail: true,
      steps: [
        { tool: 'smart_status', args: {}, when: null, label: null },
        { tool: 'smart_review', args: {}, when: null, label: null },
        { tool: 'smart_test', args: {}, when: null, label: null },
      ],
    };
    const fakeRegistry = {
      smart_status: async () => ({ success: true }),
      smart_review: async () => ({ success: false, error: 'boom' }),
      smart_test: async () => { throw new Error('should not be called'); },
    };
    const result = await runPlaybook(playbook, {}, { toolRegistry: fakeRegistry });
    assert.equal(result.success, false);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[1].ok, false);
  });

  it('dryRun resolves args without executing', async () => {
    const playbook = {
      name: 'dry',
      defaults: { ref: 'main' },
      stopOnFail: true,
      steps: [{ tool: 'smart_review', args: { ref: '{{args.ref}}' }, when: null, label: null }],
    };
    let called = false;
    const fakeRegistry = { smart_review: async () => { called = true; return { success: true }; } };
    const result = await runPlaybook(playbook, {}, { dryRun: true, toolRegistry: fakeRegistry });
    assert.equal(called, false);
    assert.equal(result.steps[0].dryRun, true);
    assert.equal(result.steps[0].args.ref, 'main');
  });

  it('rejects unknown tools (not in registry)', async () => {
    const playbook = {
      name: 'bad',
      defaults: {},
      stopOnFail: true,
      steps: [{ tool: 'rm_rf', args: {}, when: null, label: null }],
    };
    const result = await runPlaybook(playbook, {});
    assert.equal(result.success, false);
    assert.match(result.steps[0].error, /not allowed/i);
  });
});

describe('smart_playbook tool surface', () => {
  let savedRoot;
  let tempRoot;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-pb-tool-'));
    savedRoot = originalProjectRoot;
    setProjectRoot(tempRoot);
  });

  after(() => {
    setProjectRoot(savedRoot);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('list=true returns the playbook catalog', async () => {
    const result = await smartPlaybook({ list: true });
    assert.equal(result.success, true);
    assert.equal(result.action, 'list');
    const names = result.playbooks.map((p) => p.name);
    assert.ok(names.includes('preflight-merge'));
    assert.ok(names.includes('ramp-up'));
  });

  it('rejects invalid name', async () => {
    const result = await smartPlaybook({ name: 'evil; rm -rf /' });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid playbook name/);
  });

  it('returns availablePlaybooks when name not found', async () => {
    const result = await smartPlaybook({ name: 'nonexistent' });
    assert.equal(result.success, false);
    assert.match(result.error, /not found/);
    assert.ok(result.availablePlaybooks.length > 0);
  });

  it('dryRun resolves args against defaults for a built-in', async () => {
    const result = await smartPlaybook({ name: 'preflight-merge', dryRun: true });
    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.steps[0].tool, 'smart_review');
    assert.equal(result.steps[0].args.ref, 'HEAD');
  });
});
