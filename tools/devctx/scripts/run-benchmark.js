#!/usr/bin/env node

/**
 * Comprehensive benchmark runner
 * Executes all verification suites and generates a summary report
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 Running comprehensive benchmark...\n');
console.log('This will take 2-3 minutes.\n');

const results = {
  timestamp: new Date().toISOString(),
  suites: [],
  summary: {},
};

const runCommand = (name, command, args = []) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${name}`);
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  try {
    const output = execFileSync(command, args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'inherit',
      maxBuffer: 10 * 1024 * 1024,
    });
    
    const duration = Date.now() - startTime;
    
    results.suites.push({
      name,
      status: 'passed',
      duration,
    });
    
    console.log(`\n✓ ${name} completed in ${duration}ms`);
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    results.suites.push({
      name,
      status: 'failed',
      duration,
      error: error.message,
    });
    
    console.log(`\n✗ ${name} failed after ${duration}ms`);
    console.log(`Error: ${error.message}`);
    return false;
  }
};

// Suite 1: Unit Tests
const suite1 = runCommand(
  'Suite 1: Unit Tests (421 tests)',
  'node',
  ['--test', '--test-concurrency=1', './tests/*.test.js']
);

// Suite 2: Feature Verification
const suite2 = runCommand(
  'Suite 2: Feature Verification (14 features)',
  'node',
  ['./scripts/verify-features-direct.js']
);

// Suite 3: Synthetic Corpus Evaluation
const suite3 = runCommand(
  'Suite 3: Synthetic Corpus Evaluation',
  'node',
  ['./evals/harness.js']
);

// Suite 4: Self-Evaluation
const suite4 = runCommand(
  'Suite 4: Self-Evaluation (Real Project)',
  'node',
  ['./evals/harness.js', '--root=../..', '--corpus=./evals/corpus/self-tasks.json']
);

// Generate summary
console.log(`\n${'='.repeat(60)}`);
console.log('📈 BENCHMARK SUMMARY');
console.log('='.repeat(60));

const passed = results.suites.filter(s => s.status === 'passed').length;
const failed = results.suites.filter(s => s.status === 'failed').length;
const total = results.suites.length;
const totalDuration = results.suites.reduce((sum, s) => sum + s.duration, 0);

results.summary = {
  total,
  passed,
  failed,
  passRate: ((passed / total) * 100).toFixed(1),
  totalDuration,
};

console.log(`\nTotal suites: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Pass rate: ${results.summary.passRate}%`);
console.log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`);

console.log('\nSuite details:');
results.suites.forEach(suite => {
  const status = suite.status === 'passed' ? '✓' : '✗';
  const duration = (suite.duration / 1000).toFixed(1);
  console.log(`  ${status} ${suite.name} (${duration}s)`);
});

// Save results
const resultsPath = path.join(rootDir, 'evals', 'results', `benchmark-${Date.now()}.json`);
fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

console.log(`\n📄 Results saved to: ${path.relative(rootDir, resultsPath)}`);

// Show metrics if available
console.log(`\n${'='.repeat(60)}`);
console.log('💾 PRODUCTION METRICS');
console.log('='.repeat(60));

try {
  execFileSync('node', ['./scripts/report-metrics.js'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'inherit',
  });
} catch {
  console.log('\n⚠ No production metrics available yet.');
  console.log('Use the MCP for real work to accumulate metrics.');
}

// Final verdict
console.log(`\n${'='.repeat(60)}`);
if (failed === 0) {
  console.log('✅ ALL BENCHMARKS PASSED');
  console.log('='.repeat(60));
  console.log('\nThe MCP is working correctly and claims are reproducible.');
  process.exit(0);
} else {
  console.log('❌ SOME BENCHMARKS FAILED');
  console.log('='.repeat(60));
  console.log(`\n${failed} suite(s) failed. Check output above for details.`);
  process.exit(1);
}
