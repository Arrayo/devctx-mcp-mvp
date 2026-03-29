/**
 * Streaming progress notifications for long-running operations.
 * 
 * Usage:
 * ```js
 * const progress = createProgressReporter(server, 'build_index');
 * progress.report({ phase: 'scanning', filesScanned: 100 });
 * progress.report({ phase: 'indexing', filesProcessed: 50, total: 100 });
 * progress.complete({ files: 1000, symbols: 5000 });
 * ```
 */

let currentServer = null;

/**
 * Set the MCP server instance for sending notifications.
 * Called once during server initialization.
 */
export const setServerForStreaming = (server) => {
  currentServer = server;
};

/**
 * Create a progress reporter for a specific operation.
 * 
 * @param {string} operation - Operation name (e.g., 'build_index', 'smart_search')
 * @param {string} [operationId] - Optional unique ID for this operation instance
 * @returns {ProgressReporter}
 */
export const createProgressReporter = (operation, operationId = null) => {
  const id = operationId || `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let startTime = Date.now();
  let lastReportTime = 0; // Allow first report immediately

  return {
    /**
     * Report progress update.
     * @param {object} data - Progress data (phase, percentage, items processed, etc.)
     */
    report(data) {
      if (!currentServer) return;

      const now = Date.now();
      const elapsed = now - startTime;
      const sinceLast = now - lastReportTime;

      // Throttle: only send if >100ms since last report
      if (sinceLast < 100) return;

      lastReportTime = now;

      try {
        currentServer.notification({
          method: 'notifications/progress',
          params: {
            progressToken: id,
            progress: {
              operation,
              elapsed,
              ...data,
            },
          },
        });
      } catch (err) {
        // Ignore notification errors - don't fail the operation
      }
    },

    /**
     * Report completion with final result summary.
     * @param {object} summary - Final result summary
     */
    complete(summary) {
      if (!currentServer) return;

      const elapsed = Date.now() - startTime;

      try {
        currentServer.notification({
          method: 'notifications/progress',
          params: {
            progressToken: id,
            progress: {
              operation,
              phase: 'complete',
              elapsed,
              ...summary,
            },
          },
        });
      } catch (err) {
        // Ignore notification errors
      }
    },

    /**
     * Report error.
     * @param {Error|string} error - Error that occurred
     */
    error(error) {
      if (!currentServer) return;

      const elapsed = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      try {
        currentServer.notification({
          method: 'notifications/progress',
          params: {
            progressToken: id,
            progress: {
              operation,
              phase: 'error',
              elapsed,
              error: message,
            },
          },
        });
      } catch (err) {
        // Ignore notification errors
      }
    },
  };
};

/**
 * Wrap an async operation with automatic progress reporting.
 * 
 * @param {string} operation - Operation name
 * @param {Function} fn - Async function to execute
 * @param {Function} [progressFn] - Optional function to extract progress from intermediate results
 * @returns {Promise} - Result of the operation
 */
export const withProgress = async (operation, fn, progressFn = null) => {
  const progress = createProgressReporter(operation);

  try {
    const result = await fn(progress);
    
    if (progressFn && result) {
      const summary = progressFn(result);
      progress.complete(summary);
    } else {
      progress.complete({});
    }

    return result;
  } catch (error) {
    progress.error(error);
    throw error;
  }
};
