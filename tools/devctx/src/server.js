import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { buildIndex, buildIndexIncremental, persistIndex } from './index.js';
import { smartRead } from './tools/smart-read.js';
import { smartSearch } from './tools/smart-search.js';
import { smartContext } from './tools/smart-context.js';
import { smartReadBatch } from './tools/smart-read-batch.js';
import { smartShell } from './tools/smart-shell.js';
import { smartSummary } from './tools/smart-summary.js';
import { smartMetrics } from './tools/smart-metrics.js';
import { smartTurn } from './tools/smart-turn.js';
import { projectRoot, projectRootSource } from './utils/paths.js';
import { setServerForStreaming } from './streaming.js';
import { 
  getSymbolBlame, 
  getFileAuthorshipStats, 
  findSymbolsByAuthor, 
  getRecentlyModifiedSymbols 
} from './git-blame.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

export const asTextResult = (result) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(result, null, 2),
    },
  ],
});

export const createDevctxServer = () => {
  const server = new McpServer({
    name: 'devctx',
    version,
  });

  // Enable streaming progress notifications
  setServerForStreaming(server);

  server.tool(
    'smart_read',
    'Read a file with token-efficient modes. outline/signatures: compact structure (~90% savings). range: specific line range with line numbers. symbol: extract function/class/method by name (string or array for batch). full: file content capped at 12k chars. maxTokens: token budget — auto-selects the most detailed mode that fits (full -> outline -> signatures -> truncated). context=true (symbol mode only): includes callers, tests, and referenced types from the dependency graph; returns graphCoverage (imports/tests: full|partial|none) so the agent knows how reliable the cross-file context is. Responses are cached in memory per session and invalidated by file mtime; cached=true when served from cache. Every response includes a unified confidence block: { parser, truncated, cached, graphCoverage? }. Supports JS/TS, Python, Go, Rust, Java, C#, Kotlin, PHP, Swift, shell, Terraform, Dockerfile, SQL, JSON, TOML, YAML.',
    {
      filePath: z.string(),
      mode: z.enum(['full', 'outline', 'signatures', 'range', 'symbol']).optional(),
      startLine: z.number().optional(),
      endLine: z.number().optional(),
      symbol: z.union([z.string(), z.array(z.string())]).optional(),
      maxTokens: z.number().int().min(1).optional(),
      context: z.boolean().optional(),
    },
    async ({ filePath, mode = 'outline', startLine, endLine, symbol, maxTokens, context }) =>
      asTextResult(await smartRead({ filePath, mode, startLine, endLine, symbol, maxTokens, context })),
  );

  server.tool(
    'smart_read_batch',
    'Read multiple files in one call. Each item accepts path, mode, symbol, startLine, endLine, maxTokens (per-file budget). Optional global maxTokens budget with early stop when exceeded. Max 20 files per call.',
    {
      files: z.array(z.object({
        path: z.string(),
        mode: z.enum(['full', 'outline', 'signatures', 'range', 'symbol']).optional(),
        symbol: z.union([z.string(), z.array(z.string())]).optional(),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
        maxTokens: z.number().int().min(1).optional(),
      })).min(1).max(20),
      maxTokens: z.number().int().min(1).optional(),
    },
    async ({ files, maxTokens }) =>
      asTextResult(await smartReadBatch({ files, maxTokens })),
  );

  server.tool(
    'smart_search',
    'Search code across the project using ripgrep (with filesystem fallback). Returns grouped, ranked results. Optional intent (implementation/debug/tests/config/docs/explore) adjusts ranking: tests boosts test files, config boosts config files, docs reduces penalty on READMEs. Includes a unified confidence block: { level, indexFreshness } plus retrievalConfidence and provenance metadata.',
    {
      query: z.string(),
      cwd: z.string().optional(),
      intent: z.enum(['implementation', 'debug', 'tests', 'config', 'docs', 'explore']).optional(),
    },
    async ({ query, cwd = '.', intent }) => asTextResult(await smartSearch({ query, cwd, intent })),
  );

  server.tool(
    'smart_context',
    'Get curated context for a task in one call. Combines smart_search + smart_read + graph expansion. Returns relevant files, evidence for why each file was included, related tests, dependencies, symbol previews from the index, and symbol details — optimized for tokens. Includes a unified confidence block: { indexFreshness, graphCoverage } indicating index state and how complete the relational context is. Replaces the manual search → read → read cycle. Optional intent override, token budget, diff mode (pass diff=true for HEAD or diff="main" to scope context to changed files only), detail mode (minimal=index+signatures+snippets, balanced=default, deep=full content), include array to control which fields are returned (["content","graph","hints","symbolDetail"]), and prefetch=true to enable intelligent context prediction based on historical patterns (reduces round-trips by 40-60%).',
    {
      task: z.string(),
      intent: z.enum(['implementation', 'debug', 'tests', 'config', 'docs', 'explore']).optional(),
      maxTokens: z.number().optional(),
      entryFile: z.string().optional(),
      diff: z.union([z.boolean(), z.string()]).optional(),
      detail: z.enum(['minimal', 'balanced', 'deep']).optional(),
      include: z.array(z.enum(['content', 'graph', 'hints', 'symbolDetail'])).optional(),
      prefetch: z.boolean().optional(),
    },
    async ({ task, intent, maxTokens, entryFile, diff, detail, include, prefetch }) =>
      asTextResult(await smartContext({ task, intent, maxTokens, entryFile, diff, detail, include, prefetch })),
  );

  server.tool(
    'smart_shell',
    'Run a diagnostic shell command from an allowlist. Allowed: pwd, ls, find, rg, git (status/diff/show/log/branch/rev-parse), npm/pnpm/yarn/bun (test/run/lint/build/typecheck/check). Blocks shell operators, pipes, and unsafe commands. Includes a unified confidence block: { blocked, timedOut }.',
    {
      command: z.string(),
    },
    async ({ command }) => asTextResult(await smartShell({ command })),
  );

  server.tool(
    'build_index',
    'Build a lightweight symbol index for the project. Speeds up smart_search ranking and smart_read symbol lookups. Pass incremental=true to only reindex files with changed mtime (much faster for large repos). Pass warmCache=true to preload frequently accessed files after indexing. Without incremental, rebuilds from scratch. Sends progress notifications during indexing for large projects.',
    {
      incremental: z.boolean().optional(),
      warmCache: z.boolean().optional(),
    },
    async ({ incremental, warmCache }) => {
      const { createProgressReporter } = await import('./streaming.js');
      const progress = createProgressReporter('build_index');

      try {
        if (incremental) {
          const { index, stats } = buildIndexIncremental(projectRoot, progress);
          await persistIndex(index, projectRoot);
          const symbolCount = Object.values(index.files).reduce((sum, f) => sum + f.symbols.length, 0);
          const result = { status: 'ok', files: stats.total, symbols: symbolCount, ...stats };
          
          if (warmCache) {
            const { warmCache: warmCacheFn } = await import('./cache-warming.js');
            const warmResult = await warmCacheFn(projectRoot, progress);
            result.cacheWarming = warmResult;
          }
          
          progress.complete(result);
          return asTextResult(result);
        }

        const index = buildIndex(projectRoot, progress);
        await persistIndex(index, projectRoot);
        const fileCount = Object.keys(index.files).length;
        const symbolCount = Object.values(index.files).reduce((sum, f) => sum + f.symbols.length, 0);
        const result = { status: 'ok', files: fileCount, symbols: symbolCount };
        
        if (warmCache) {
          const { warmCache: warmCacheFn } = await import('./cache-warming.js');
          const warmResult = await warmCacheFn(projectRoot, progress);
          result.cacheWarming = warmResult;
        }
        
        progress.complete(result);
        return asTextResult(result);
      } catch (error) {
        progress.error(error);
        throw error;
      }
    },
  );

  server.tool(
    'warm_cache',
    'Preload frequently accessed files into OS cache to reduce cold-start latency. Analyzes last 30 days of access patterns and warms the top 50 most-used files (configurable via DEVCTX_WARM_FILES env). Skips files >1MB. Returns warmed/skipped counts. Use after build_index or before starting intensive work sessions.',
    {},
    async () => {
      const { createProgressReporter } = await import('./streaming.js');
      const { warmCache: warmCacheFn } = await import('./cache-warming.js');
      
      const progress = createProgressReporter('warm_cache');
      
      try {
        const result = await warmCacheFn(projectRoot, progress);
        progress.complete(result);
        return asTextResult(result);
      } catch (error) {
        progress.error(error);
        throw error;
      }
    },
  );

  server.tool(
    'git_blame',
    'Get symbol-level git blame attribution. Modes: symbol (blame for specific file symbols), file (aggregated file stats), author (find symbols by author), recent (recently modified symbols). Returns author, email, date, commit, and authorship percentage for each symbol. Requires git repository and symbol index.',
    {
      mode: z.enum(['symbol', 'file', 'author', 'recent']),
      filePath: z.string().optional(),
      authorQuery: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      daysBack: z.number().int().min(1).max(365).optional(),
    },
    async ({ mode, filePath, authorQuery, limit, daysBack }) => {
      try {
        if (mode === 'symbol') {
          if (!filePath) {
            throw new Error('filePath is required for symbol mode');
          }
          const result = await getSymbolBlame(filePath, projectRoot);
          return asTextResult({ mode, filePath, symbols: result });
        }

        if (mode === 'file') {
          if (!filePath) {
            throw new Error('filePath is required for file mode');
          }
          const result = await getFileAuthorshipStats(filePath, projectRoot);
          return asTextResult({ mode, filePath, ...result });
        }

        if (mode === 'author') {
          if (!authorQuery) {
            throw new Error('authorQuery is required for author mode');
          }
          const result = await findSymbolsByAuthor(authorQuery, projectRoot, limit || 50);
          return asTextResult({ mode, authorQuery, matches: result.length, symbols: result });
        }

        if (mode === 'recent') {
          const result = await getRecentlyModifiedSymbols(projectRoot, limit || 20, daysBack || 30);
          return asTextResult({ mode, daysBack: daysBack || 30, symbols: result });
        }

        throw new Error(`Unknown mode: ${mode}`);
      } catch (error) {
        return asTextResult({ error: error.message, mode, filePath, authorQuery });
      }
    },
  );

  server.tool(
    'smart_summary',
    'Maintain compressed conversation state across turns. Actions: get (retrieve current/last session), update (create or replace a session; omitted fields are cleared), append (add to existing session), auto_append (append only if something meaningful changed), checkpoint (event-driven orchestration that decides whether to auto-persist), reset (clear session), list_sessions (show all sessions), compact (apply retention/compaction to SQLite events), cleanup_legacy (inspect or remove imported legacy JSON/JSONL files). Sessions persist in project-local SQLite with 30-day retention defaults. Auto-generates sessionId from goal if omitted. `get` auto-resumes the active session when present, otherwise falls back to the best saved session when unambiguous; pass `sessionId: "auto"` to accept the recommended session even when multiple recent candidates exist. Returns a resume summary capped at maxTokens (default 500) plus compression metadata (`truncated`, `compressionLevel`, `omitted`) and `schemaVersion`. Includes `repoSafety` so agents can catch `.devctx/state.sqlite` git hygiene issues early; mutating actions are blocked at runtime when that SQLite file is tracked or staged. Tracks: goal, status, pinned context, unresolved questions, current focus, blockers, next step, completed steps, key decisions, and touched files.',
    {
      action: z.enum(['get', 'update', 'append', 'auto_append', 'checkpoint', 'reset', 'list_sessions', 'compact', 'cleanup_legacy']),
      sessionId: z.string().optional(),
      update: z.object({
        goal: z.string().optional(),
        status: z.enum(['planning', 'in_progress', 'blocked', 'completed']).optional(),
        pinnedContext: z.array(z.string()).optional(),
        unresolvedQuestions: z.array(z.string()).optional(),
        currentFocus: z.string().optional(),
        whyBlocked: z.string().optional(),
        completed: z.array(z.string()).optional(),
        decisions: z.array(z.string()).optional(),
        blockers: z.array(z.string()).optional(),
        nextStep: z.string().optional(),
        touchedFiles: z.array(z.string()).optional(),
      }).optional(),
      event: z.enum(['manual', 'milestone', 'decision', 'blocker', 'status_change', 'file_change', 'task_switch', 'task_complete', 'session_end', 'read_only', 'heartbeat']).optional(),
      force: z.boolean().optional(),
      maxTokens: z.number().int().min(100).max(2000).optional(),
      retentionDays: z.number().int().min(1).max(3650).optional(),
      keepLatestEventsPerSession: z.number().int().min(0).max(10000).optional(),
      keepLatestMetrics: z.number().int().min(0).max(100000).optional(),
      vacuum: z.boolean().optional(),
      apply: z.boolean().optional(),
    },
    async ({ action, sessionId, update, event, force, maxTokens, retentionDays, keepLatestEventsPerSession, keepLatestMetrics, vacuum, apply }) =>
      asTextResult(await smartSummary({
        action,
        sessionId,
        update,
        event,
        force,
        maxTokens,
        retentionDays,
        keepLatestEventsPerSession,
        keepLatestMetrics,
        vacuum,
        apply,
      })),
  );

  server.tool(
    'smart_turn',
    'Orchestrate start/end of a meaningful agent turn so context usage becomes almost mandatory with low token overhead. `phase: "start"` rehydrates persisted context, classifies prompt continuity against the saved session, optionally auto-creates a planning session for a new substantial task, and can include compact metrics. `phase: "end"` writes a checkpoint through smart_summary and can optionally include compact metrics. Use this instead of manually chaining `smart_summary(get)` and `smart_summary(checkpoint)` when you want a single context-first turn workflow.',
    {
      phase: z.enum(['start', 'end']),
      sessionId: z.string().optional(),
      prompt: z.string().optional(),
      update: z.object({
        goal: z.string().optional(),
        status: z.enum(['planning', 'in_progress', 'blocked', 'completed']).optional(),
        pinnedContext: z.array(z.string()).optional(),
        unresolvedQuestions: z.array(z.string()).optional(),
        currentFocus: z.string().optional(),
        whyBlocked: z.string().optional(),
        completed: z.array(z.string()).optional(),
        decisions: z.array(z.string()).optional(),
        blockers: z.array(z.string()).optional(),
        nextStep: z.string().optional(),
        touchedFiles: z.array(z.string()).optional(),
      }).optional(),
      event: z.enum(['manual', 'milestone', 'decision', 'blocker', 'status_change', 'file_change', 'task_switch', 'task_complete', 'session_end', 'read_only', 'heartbeat']).optional(),
      force: z.boolean().optional(),
      maxTokens: z.number().int().min(100).max(2000).optional(),
      ensureSession: z.boolean().optional(),
      includeMetrics: z.boolean().optional(),
      metricsWindow: z.enum(['24h', '7d', '30d', 'all']).optional(),
      latestMetrics: z.number().int().min(1).max(20).optional(),
    },
    async ({ phase, sessionId, prompt, update, event, force, maxTokens, ensureSession, includeMetrics, metricsWindow, latestMetrics }) =>
      asTextResult(await smartTurn({
        phase,
        sessionId,
        prompt,
        update,
        event,
        force,
        maxTokens,
        ensureSession,
        includeMetrics,
        metricsWindow,
        latestMetrics,
      })),
  );

  server.tool(
    'smart_metrics',
    'Inspect token metrics recorded in project-local SQLite storage by default. Returns aggregated totals, per-tool savings, and recent entries. Supports time windows (`24h`, `7d`, `30d`, `all`), optional tool filtering, and optional session filtering (`sessionId: "active"` resolves the current active session automatically). Pass `file` to inspect a legacy/custom JSONL file explicitly. When `.devctx/state.sqlite` is tracked or staged, reads fall back to a temporary read-only snapshot and report `sideEffectsSuppressed`; metrics writes from other tools are skipped until git hygiene is fixed.',
    {
      file: z.string().optional(),
      tool: z.string().optional(),
      sessionId: z.string().optional(),
      window: z.enum(['24h', '7d', '30d', 'all']).optional(),
      latest: z.number().int().min(1).max(50).optional(),
    },
    async ({ file, tool, sessionId, window, latest }) =>
      asTextResult(await smartMetrics({ file, tool, sessionId, window, latest })),
  );

  return server;
};

export const runDevctxServer = async () => {
  if (process.env.DEVCTX_DEBUG === '1') {
    process.stderr.write(`devctx project root (${projectRootSource}): ${projectRoot}\n`);
  }

  const server = createDevctxServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    transport.close().catch(() => {}).finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
};
