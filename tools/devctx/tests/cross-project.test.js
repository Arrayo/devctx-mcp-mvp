import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  loadCrossProjectConfig,
  discoverRelatedProjects,
  searchAcrossProjects,
  readAcrossProjects,
  findSymbolAcrossProjects,
  getCrossProjectDependencies,
  getCrossProjectStats,
  createSampleConfig,
} from '../src/cross-project.js';
import { buildIndex, persistIndex } from '../src/index.js';
import { setProjectRoot } from '../src/utils/paths.js';

describe('cross-project', () => {
  let tmpRoot;
  let project1Path;
  let project2Path;
  let originalProjectRoot;

  before(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-cross-'));
    project1Path = path.join(tmpRoot, 'project1');
    project2Path = path.join(tmpRoot, 'project2');

    fs.mkdirSync(project1Path);
    fs.mkdirSync(project2Path);

    originalProjectRoot = process.env.DEVCTX_PROJECT_ROOT;
    process.env.DEVCTX_PROJECT_ROOT = project1Path;
    setProjectRoot(project1Path);

    execFileSync('git', ['init'], { cwd: project1Path, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: project1Path });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: project1Path });

    fs.writeFileSync(path.join(project1Path, 'app.js'), `export function main() {
  return 'project1';
}
`);

    fs.writeFileSync(path.join(project1Path, '.devctx-projects.json'), JSON.stringify({
      version: '1.0',
      projects: [
        {
          name: 'project1',
          path: '.',
          type: 'main',
          description: 'Main project',
        },
        {
          name: 'project2',
          path: '../project2',
          type: 'library',
          description: 'Shared library',
        },
      ],
    }, null, 2));

    execFileSync('git', ['add', '.'], { cwd: project1Path });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: project1Path });

    const index1 = buildIndex(project1Path);
    await persistIndex(index1, project1Path);

    execFileSync('git', ['init'], { cwd: project2Path, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: project2Path });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: project2Path });

    fs.writeFileSync(path.join(project2Path, 'utils.js'), `export function helper() {
  return 'project2';
}
`);

    execFileSync('git', ['add', '.'], { cwd: project2Path });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: project2Path });

    const index2 = buildIndex(project2Path);
    await persistIndex(index2, project2Path);
  });

  after(() => {
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
    if (originalProjectRoot) {
      process.env.DEVCTX_PROJECT_ROOT = originalProjectRoot;
      setProjectRoot(originalProjectRoot);
    } else {
      delete process.env.DEVCTX_PROJECT_ROOT;
    }
  });

  it('loadCrossProjectConfig loads configuration', () => {
    const config = loadCrossProjectConfig(project1Path);

    assert.ok(config);
    assert.equal(config.version, '1.0');
    assert.ok(Array.isArray(config.projects));
    assert.equal(config.projects.length, 2);
  });

  it('loadCrossProjectConfig returns null for missing config', () => {
    const config = loadCrossProjectConfig(project2Path);

    assert.equal(config, null);
  });

  it('discoverRelatedProjects finds related projects', () => {
    const projects = discoverRelatedProjects(project1Path);

    assert.ok(Array.isArray(projects));
    assert.equal(projects.length, 2);
    
    const project1 = projects.find(p => p.name === 'project1');
    assert.ok(project1);
    assert.equal(project1.type, 'main');
    assert.equal(project1.hasIndex, true);

    const project2 = projects.find(p => p.name === 'project2');
    assert.ok(project2);
    assert.equal(project2.type, 'library');
    assert.equal(project2.hasIndex, true);
  });

  it('searchAcrossProjects searches multiple projects', async () => {
    const results = await searchAcrossProjects('export', {
      root: project1Path,
      intent: 'implementation',
      maxResultsPerProject: 5,
    });

    assert.ok(Array.isArray(results));
    
    if (results.length > 0) {
      assert.ok(results[0].project);
      assert.ok(results[0].results);
    }
  });

  it('readAcrossProjects reads files from multiple projects', async () => {
    const fileRefs = [
      { project: 'project1', file: 'app.js', mode: 'outline' },
      { project: 'project2', file: 'utils.js', mode: 'outline' },
    ];

    const results = await readAcrossProjects(fileRefs, project1Path);

    assert.ok(Array.isArray(results));
    assert.equal(results.length, 2);
    
    const result1 = results.find(r => r.project === 'project1');
    assert.ok(result1);
    assert.ok(result1.content);
    assert.equal(result1.file, 'app.js');

    const result2 = results.find(r => r.project === 'project2');
    assert.ok(result2);
    assert.ok(result2.content);
    assert.equal(result2.file, 'utils.js');
  });

  it('readAcrossProjects handles missing projects', async () => {
    const fileRefs = [
      { project: 'missing', file: 'test.js' },
    ];

    const results = await readAcrossProjects(fileRefs, project1Path);

    assert.ok(Array.isArray(results));
    assert.equal(results.length, 1);
    assert.ok(results[0].error);
    assert.equal(results[0].error, 'Project not found');
  });

  it('findSymbolAcrossProjects finds symbols in multiple projects', async () => {
    const results = await findSymbolAcrossProjects('main', project1Path);

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    
    const mainSymbol = results.find(r => r.symbol === 'main');
    assert.ok(mainSymbol);
    assert.equal(mainSymbol.kind, 'function');
    assert.equal(mainSymbol.project, 'project1');
  });

  it('getCrossProjectDependencies returns dependency graph', () => {
    const deps = getCrossProjectDependencies(project1Path);

    assert.ok(deps.projects);
    assert.ok(Array.isArray(deps.projects));
    assert.ok(deps.edges);
    assert.ok(Array.isArray(deps.edges));
  });

  it('getCrossProjectStats returns statistics', () => {
    const stats = getCrossProjectStats(project1Path);

    assert.equal(typeof stats.totalProjects, 'number');
    assert.equal(typeof stats.indexedProjects, 'number');
    assert.ok(stats.projectTypes);
    assert.equal(typeof stats.crossProjectImports, 'number');
  });

  it('createSampleConfig generates valid configuration', () => {
    const config = createSampleConfig(project1Path);

    assert.ok(config);
    assert.equal(config.version, '1.0');
    assert.ok(Array.isArray(config.projects));
    assert.ok(config.projects.length > 0);
    assert.ok(config.searchDefaults);
  });
});
