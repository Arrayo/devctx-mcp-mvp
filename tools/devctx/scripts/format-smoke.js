#!/usr/bin/env node
import path from 'node:path';
import { smartRead } from '../src/tools/smart-read.js';
import { smartSearch } from '../src/tools/smart-search.js';
import { projectRoot } from '../src/utils/paths.js';
import { createRecorder, emitJson, formatError } from './lib/smoke-helpers.js';

const fixtureRoot = 'fixtures/formats';
const fixtureRootPath = path.resolve(projectRoot, fixtureRoot);

const readCases = [
  { filePath: `${fixtureRoot}/sample.go`, mode: 'signatures', expect: /func BuildServer\(|method Handle\(/, name: 'go' },
  { filePath: `${fixtureRoot}/sample.rs`, mode: 'signatures', expect: /UserService::create\(|fn build_service\(/, name: 'rust' },
  { filePath: `${fixtureRoot}/SampleService.java`, mode: 'signatures', expect: /class SampleService|SampleService::createUser\(/, name: 'java' },
  { filePath: `${fixtureRoot}/deploy.sh`, mode: 'signatures', expect: /function deploy\(|docker|kubectl/, name: 'shell' },
  { filePath: `${fixtureRoot}/main.tf`, mode: 'signatures', expect: /provider "aws"|resource "aws_s3_bucket" "logs"/, name: 'terraform' },
  { filePath: `${fixtureRoot}/Dockerfile`, mode: 'signatures', expect: /FROM node:20-alpine|WORKDIR \/app/, name: 'dockerfile' },
  { filePath: `${fixtureRoot}/schema.sql`, mode: 'signatures', expect: /CREATE TABLE users|cte active_users/i, name: 'sql' },
];

const searchCases = [
  { query: 'workspace_name', cwd: fixtureRoot, expect: /main\.tf/, name: 'terraform_search' },
  { query: 'node:20-alpine', cwd: fixtureRoot, expect: /Dockerfile/, name: 'dockerfile_search' },
  { query: 'createUser', cwd: fixtureRoot, expect: /SampleService\.java/, name: 'java_search' },
];

const main = async () => {
  const recorder = createRecorder();
  const startedAt = new Date().toISOString();

  try {
    for (const testCase of readCases) {
      const result = await smartRead({ filePath: testCase.filePath, mode: testCase.mode });
      if (!testCase.expect.test(result.content)) {
        throw new Error(`smartRead ${testCase.name} did not contain expected signal`);
      }

      recorder.record(`smart_read_${testCase.name}`, {
        type: 'smart_read',
        preview: result.content.slice(0, 160),
      });
    }

    for (const testCase of searchCases) {
      const result = await smartSearch({ query: testCase.query, cwd: testCase.cwd });
      if (!testCase.expect.test(result.matches)) {
        throw new Error(`smartSearch ${testCase.name} did not contain expected signal`);
      }

      recorder.record(`smart_search_${testCase.name}`, {
        type: 'smart_search',
        engine: result.engine,
        totalMatches: result.totalMatches,
      });
    }

    emitJson({ ok: true, startedAt, finishedAt: new Date().toISOString(), projectRoot, fixtureRoot: fixtureRootPath, checks: recorder.checks });
  } catch (error) {
    emitJson({ ok: false, startedAt, finishedAt: new Date().toISOString(), projectRoot, fixtureRoot: fixtureRootPath, checks: recorder.checks, error: formatError(error) });
    process.exitCode = 1;
  }
};

await main();
