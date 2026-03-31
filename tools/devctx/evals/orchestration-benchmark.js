#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { smartRead } from '../src/tools/smart-read.js';
import { smartSearch } from '../src/tools/smart-search.js';
import { smartContext } from '../src/tools/smart-context.js';
import { smartSummary } from '../src/tools/smart-summary.js';
import { smartTurn } from '../src/tools/smart-turn.js';
import { smartMetrics } from '../src/tools/smart-metrics.js';
import { projectRoot, setProjectRoot } from '../src/utils/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCENARIOS_PATH = path.resolve(__dirname, 'orchestration-scenarios.json');
const DEFAULT_BASELINE_PATH = path.resolve(__dirname, 'orchestration-release-baseline.json');
const RESULTS_DIR = path.resolve(__dirname, 'results');

const DEFAULT_FIXTURE_FILES = {
  'src/auth.js': `export function loginHandler(token) {
  if (!token) throw new Error('Missing token');
  return { ok: true, token };
}

export function validateToken(token) {
  return Boolean(token && token.length > 3);
}
`,
  'src/auth.test.js': `import { loginHandler, validateToken } from './auth.js';

export function authSmoke() {
  return validateToken('token-123') && loginHandler('token-123').ok;
}
`,
  'src/wrapper.js': `export function buildWrapperContext(sessionId) {
  return { sessionId, kind: 'wrapper' };
}
`,
  'docs/onboarding.md': `# Onboarding

Use loginHandler and validateToken to inspect the auth flow and wrapper onboarding path.
`,
};

const ensureDir = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const writeFixtureFiles = (root, files = DEFAULT_FIXTURE_FILES) => {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    ensureDir(filePath);
    fs.writeFileSync(filePath, content, 'utf8');
  }
};

export const loadScenarioSpec = (filePath = DEFAULT_SCENARIOS_PATH) =>
  JSON.parse(fs.readFileSync(filePath, 'utf8'));

export const loadReleaseBaseline = (filePath = DEFAULT_BASELINE_PATH) =>
  JSON.parse(fs.readFileSync(filePath, 'utf8'));

const matchesExpected = (actual, expected) => actual === expected;

export const evaluateScenarioExpectations = ({ scenario, startResult, endResult }) => {
  const expect = scenario.expect ?? {};
  const failures = [];

  if (expect.continuityState && !matchesExpected(startResult?.continuity?.state, expect.continuityState)) {
    failures.push(`expected continuityState=${expect.continuityState}, got ${startResult?.continuity?.state ?? 'null'}`);
  }

  if (expect.shouldReuseContext !== undefined && startResult?.continuity?.shouldReuseContext !== expect.shouldReuseContext) {
    failures.push(`expected shouldReuseContext=${expect.shouldReuseContext}, got ${startResult?.continuity?.shouldReuseContext ?? 'null'}`);
  }

  if (expect.mutationBlocked !== undefined && Boolean(startResult?.mutationSafety?.blocked || endResult?.mutationSafety?.blocked) !== expect.mutationBlocked) {
    failures.push(`expected mutationBlocked=${expect.mutationBlocked}`);
  }

  if (Array.isArray(expect.blockedByIncludes)) {
    const blockedBy = new Set([
      ...(startResult?.mutationSafety?.blockedBy ?? []),
      ...(endResult?.mutationSafety?.blockedBy ?? []),
    ]);
    for (const reason of expect.blockedByIncludes) {
      if (!blockedBy.has(reason)) {
        failures.push(`expected blockedBy to include ${reason}`);
      }
    }
  }

  if (expect.refreshedContext && !startResult?.refreshedContext) {
    failures.push('expected refreshedContext to be present');
  }

  if (expect.refreshedTopFilesMin && Number(startResult?.refreshedContext?.topFiles?.length ?? 0) < expect.refreshedTopFilesMin) {
    failures.push(`expected refreshed top files >= ${expect.refreshedTopFilesMin}`);
  }

  if (expect.recommendedPathMode && startResult?.recommendedPath?.mode !== expect.recommendedPathMode) {
    failures.push(`expected start recommendedPath.mode=${expect.recommendedPathMode}, got ${startResult?.recommendedPath?.mode ?? 'null'}`);
  }

  if (expect.checkpointSkipped !== undefined && Boolean(endResult?.checkpoint?.skipped) !== expect.checkpointSkipped) {
    failures.push(`expected checkpointSkipped=${expect.checkpointSkipped}, got ${Boolean(endResult?.checkpoint?.skipped)}`);
  }

  if (expect.checkpointPersisted !== undefined && Boolean(!endResult?.checkpoint?.skipped && !endResult?.checkpoint?.blocked) !== expect.checkpointPersisted) {
    failures.push(`expected checkpointPersisted=${expect.checkpointPersisted}`);
  }

  if (expect.endRecommendedPathMode && endResult?.recommendedPath?.mode !== expect.endRecommendedPathMode) {
    failures.push(`expected end recommendedPath.mode=${expect.endRecommendedPathMode}, got ${endResult?.recommendedPath?.mode ?? 'null'}`);
  }

  return {
    pass: failures.length === 0,
    failures,
  };
};

const aggregateScenarioMetricsFile = (sourceFile, aggregateFile) => {
  if (!fs.existsSync(sourceFile)) {
    return 0;
  }

  ensureDir(aggregateFile);
  const content = fs.readFileSync(sourceFile, 'utf8');
  if (!content.trim()) {
    return 0;
  }

  fs.appendFileSync(aggregateFile, content, 'utf8');
  return content.trim().split('\n').length;
};

const runScenarioAction = async ({ root, action, startResult }) => {
  if (action.type === 'smart_read') {
    return {
      type: action.type,
      result: await smartRead({
        filePath: path.join(root, action.filePath),
        mode: action.mode ?? 'outline',
      }),
    };
  }

  if (action.type === 'smart_search') {
    return {
      type: action.type,
      result: await smartSearch({
        query: action.query,
        cwd: action.cwd ? path.join(root, action.cwd) : root,
        intent: action.intent,
      }),
    };
  }

  if (action.type === 'smart_context') {
    return {
      type: action.type,
      result: await smartContext({
        task: action.task,
        detail: action.detail ?? 'minimal',
        include: action.include ?? ['hints'],
        maxTokens: action.maxTokens ?? 1400,
      }),
    };
  }

  if (action.type === 'smart_turn_end') {
    return {
      type: action.type,
      result: await smartTurn({
        phase: 'end',
        sessionId: action.sessionId ?? startResult?.sessionId,
        event: action.event,
        update: action.update ?? {},
      }),
    };
  }

  throw new Error(`Unsupported scenario action: ${action.type}`);
};

export const summarizeOrchestrationBenchmark = ({ scenarioResults, metrics, thresholds }) => {
  const passed = scenarioResults.filter((scenario) => scenario.pass).length;
  const total = scenarioResults.length;
  const passRatePct = total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 0;

  const thresholdChecks = [
    {
      key: 'scenarioPassRatePct',
      actual: passRatePct,
      expected: thresholds.minScenarioPassRatePct,
      pass: passRatePct >= thresholds.minScenarioPassRatePct,
    },
    {
      key: 'netSavedTokens',
      actual: metrics.summary.netSavedTokens,
      expected: thresholds.minNetSavedTokens,
      pass: metrics.summary.netSavedTokens >= thresholds.minNetSavedTokens,
    },
    {
      key: 'continuityAlignmentRatePct',
      actual: metrics.productQuality.continuityRecovery.alignmentRatePct,
      expected: thresholds.minContinuityAlignmentRatePct,
      pass: metrics.productQuality.continuityRecovery.alignmentRatePct >= thresholds.minContinuityAlignmentRatePct,
    },
    {
      key: 'blockedRemediationCoveragePct',
      actual: metrics.productQuality.blockedState.remediationCoveragePct,
      expected: thresholds.minBlockedRemediationCoveragePct,
      pass: metrics.productQuality.blockedState.remediationCoveragePct >= thresholds.minBlockedRemediationCoveragePct,
    },
    {
      key: 'refreshTopFileSignalRatePct',
      actual: metrics.productQuality.contextRefresh.topFileSignalRatePct,
      expected: thresholds.minRefreshTopFileSignalRatePct,
      pass: metrics.productQuality.contextRefresh.topFileSignalRatePct >= thresholds.minRefreshTopFileSignalRatePct,
    },
    {
      key: 'checkpointPersistenceRatePct',
      actual: metrics.productQuality.checkpointing.persistenceRatePct,
      expected: thresholds.minCheckpointPersistenceRatePct,
      pass: metrics.productQuality.checkpointing.persistenceRatePct >= thresholds.minCheckpointPersistenceRatePct,
    },
  ];

  return {
    scenarios: {
      total,
      passed,
      failed: total - passed,
      passRatePct,
    },
    thresholdChecks,
    pass: scenarioResults.every((scenario) => scenario.pass) && thresholdChecks.every((check) => check.pass),
  };
};

export const evaluateReleaseBaseline = ({ scenarioResults, summary, metrics, baseline }) => {
  if (!baseline) {
    return {
      enabled: false,
      pass: true,
      checks: [],
    };
  }

  const thresholdChecks = new Map(summary.thresholdChecks.map((check) => [check.key, check]));
  const requiredScenarios = baseline.requiredScenarios ?? [];
  const seenScenarios = new Set(scenarioResults.map((scenario) => scenario.id));
  const checks = [];

  if (baseline.expectedScenarioCount !== undefined) {
    checks.push({
      key: 'expectedScenarioCount',
      actual: scenarioResults.length,
      expected: baseline.expectedScenarioCount,
      pass: scenarioResults.length === baseline.expectedScenarioCount,
    });
  }

  for (const scenarioId of requiredScenarios) {
    checks.push({
      key: `scenario:${scenarioId}`,
      actual: seenScenarios.has(scenarioId),
      expected: true,
      pass: seenScenarios.has(scenarioId),
    });
  }

  const minimums = baseline.minimums ?? {};
  for (const [key, expected] of Object.entries(minimums)) {
    const thresholdCheck = thresholdChecks.get(key);
    const actual = thresholdCheck?.actual
      ?? (key === 'netSavingsPct' ? metrics.summary.netSavingsPct : null);
    checks.push({
      key,
      actual,
      expected,
      pass: typeof actual === 'number' && actual >= expected,
    });
  }

  return {
    enabled: true,
    baselineVersion: baseline.version ?? null,
    source: baseline.source ?? null,
    pass: checks.every((check) => check.pass),
    checks,
  };
};

export const runOrchestrationBenchmark = async ({
  scenarioFile = DEFAULT_SCENARIOS_PATH,
  baselineFile,
  outputFile,
} = {}) => {
  const spec = loadScenarioSpec(scenarioFile);
  const baseline = baselineFile ? loadReleaseBaseline(baselineFile) : null;
  const aggregateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devctx-orchestration-benchmark-'));
  const aggregateMetricsFile = path.join(aggregateDir, '.devctx', 'metrics.jsonl');
  const previousMetricsFile = process.env.DEVCTX_METRICS_FILE;
  const previousProjectRoot = projectRoot;
  const scenarioResults = [];

  try {
    for (const scenario of spec.scenarios) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `devctx-bench-${scenario.id}-`));
      const metricsFile = path.join(root, '.devctx', 'metrics.jsonl');
      let startResult = null;
      let endResult = null;
      const actionResults = [];

      try {
        process.env.DEVCTX_METRICS_FILE = metricsFile;
        setProjectRoot(root);
        execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
        fs.writeFileSync(path.join(root, '.gitignore'), '.devctx/\n', 'utf8');
        writeFixtureFiles(root);

        if (scenario.seedSession) {
          await smartSummary({
            action: 'update',
            sessionId: scenario.seedSession.sessionId,
            update: scenario.seedSession.update,
          });
        }

        if (scenario.stageStateDb) {
          execFileSync('git', ['add', '-f', '.devctx/state.sqlite'], { cwd: root, stdio: 'ignore' });
        }

        startResult = await smartTurn({
          phase: 'start',
          sessionId: scenario.start.sessionId,
          prompt: scenario.start.prompt,
          ensureSession: scenario.start.ensureSession ?? false,
        });

        for (const action of scenario.actions ?? []) {
          const actionResult = await runScenarioAction({ root, action, startResult });
          actionResults.push(actionResult);
          if (action.type === 'smart_turn_end') {
            endResult = actionResult.result;
          }
        }

        const evaluation = evaluateScenarioExpectations({ scenario, startResult, endResult });
        aggregateScenarioMetricsFile(metricsFile, aggregateMetricsFile);
        scenarioResults.push({
          id: scenario.id,
          description: scenario.description,
          pass: evaluation.pass,
          failures: evaluation.failures,
          start: {
            continuityState: startResult?.continuity?.state ?? null,
            recommendedPathMode: startResult?.recommendedPath?.mode ?? null,
            mutationBlocked: Boolean(startResult?.mutationSafety?.blocked),
            refreshedTopFiles: startResult?.refreshedContext?.topFiles?.length ?? 0,
          },
          end: endResult
            ? {
                checkpointSkipped: Boolean(endResult.checkpoint?.skipped),
                recommendedPathMode: endResult.recommendedPath?.mode ?? null,
              }
            : null,
          actionCount: actionResults.length,
        });
      } finally {
        if (scenario.stageStateDb && fs.existsSync(path.join(root, '.devctx', 'state.sqlite'))) {
          try {
            execFileSync('git', ['rm', '--cached', '-f', '.devctx/state.sqlite'], { cwd: root, stdio: 'ignore' });
          } catch {
            // best-effort cleanup only
          }
        }
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    const metrics = await smartMetrics({
      file: aggregateMetricsFile,
      tool: null,
      window: 'all',
      latest: 100,
    });
    const summary = summarizeOrchestrationBenchmark({
      scenarioResults,
      metrics,
      thresholds: spec.thresholds,
    });
    const releaseGate = evaluateReleaseBaseline({
      scenarioResults,
      summary,
      metrics,
      baseline,
    });

    const result = {
      timestamp: new Date().toISOString(),
      scenarioFile: path.resolve(scenarioFile),
      baselineFile: baselineFile ? path.resolve(baselineFile) : null,
      metricsFile: aggregateMetricsFile,
      scenarios: scenarioResults,
      thresholds: spec.thresholds,
      metrics: {
        summary: metrics.summary,
        productQuality: metrics.productQuality,
      },
      summary,
      releaseGate,
      pass: summary.pass && releaseGate.pass,
    };

    const resultsFile = outputFile ?? path.join(RESULTS_DIR, `orchestration-benchmark-${Date.now()}.json`);
    ensureDir(resultsFile);
    fs.writeFileSync(resultsFile, JSON.stringify(result, null, 2), 'utf8');

    return { result, resultsFile };
  } finally {
    setProjectRoot(previousProjectRoot);
    if (previousMetricsFile === undefined) {
      delete process.env.DEVCTX_METRICS_FILE;
    } else {
      process.env.DEVCTX_METRICS_FILE = previousMetricsFile;
    }
  }
};

const printResult = ({ result, resultsFile }) => {
  console.log('');
  console.log('Orchestration benchmark results');
  console.log('');
  console.log(`Scenarios:     ${result.summary.scenarios.passed}/${result.summary.scenarios.total} passed (${result.summary.scenarios.passRatePct}%)`);
  console.log(`Net saved:     ${result.metrics.summary.netSavedTokens} (${result.metrics.summary.netSavingsPct}%)`);
  console.log(`Aligned starts:${result.metrics.productQuality.continuityRecovery.alignmentRatePct}%`);
  console.log(`Remediation:   ${result.metrics.productQuality.blockedState.remediationCoveragePct}%`);
  console.log(`Refresh signal:${result.metrics.productQuality.contextRefresh.topFileSignalRatePct}%`);
  console.log(`Checkpointing: ${result.metrics.productQuality.checkpointing.persistenceRatePct}%`);
  console.log('');
  console.log('Threshold checks:');
  for (const check of result.summary.thresholdChecks) {
    console.log(`- ${check.pass ? 'PASS' : 'FAIL'} ${check.key}: ${check.actual} >= ${check.expected}`);
  }
  console.log('');
  if (result.releaseGate?.enabled) {
    console.log('Release baseline checks:');
    for (const check of result.releaseGate.checks) {
      console.log(`- ${check.pass ? 'PASS' : 'FAIL'} ${check.key}: ${check.actual} >= ${check.expected}`);
    }
    console.log('');
  }
  if (result.scenarios.some((scenario) => !scenario.pass)) {
    console.log('Scenario failures:');
    for (const scenario of result.scenarios.filter((item) => !item.pass)) {
      console.log(`- ${scenario.id}: ${scenario.failures.join('; ')}`);
    }
    console.log('');
  }
  console.log(`Results saved to: ${path.relative(path.resolve(__dirname, '..'), resultsFile)}`);
};

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const scenarioArg = process.argv.find((arg) => arg.startsWith('--scenarios='));
  const baselineArg = process.argv.find((arg) => arg.startsWith('--baseline='));
  const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
  const scenarioFile = scenarioArg ? path.resolve(scenarioArg.split('=')[1]) : DEFAULT_SCENARIOS_PATH;
  const baselineFile = baselineArg ? path.resolve(baselineArg.split('=')[1]) : undefined;
  const outputFile = outputArg ? path.resolve(outputArg.split('=')[1]) : undefined;

  runOrchestrationBenchmark({ scenarioFile, baselineFile, outputFile })
    .then(({ result, resultsFile }) => {
      printResult({ result, resultsFile });
      process.exit(result.pass ? 0 : 1);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
