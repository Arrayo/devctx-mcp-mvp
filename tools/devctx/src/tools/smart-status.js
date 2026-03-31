import { withStateDb } from '../storage/sqlite.js';
import { recordToolUsage } from '../usage-feedback.js';
import { recordDecision, DECISION_REASONS, EXPECTED_BENEFITS } from '../decision-explainer.js';
import { recordDevctxOperation } from '../missed-opportunities.js';
import { countTokens } from '../tokenCounter.js';

const ACTIVE_SESSION_SCOPE = 'active';

const getActiveSession = async () => {
  return withStateDb((db) => {
    let activeSessionId = db.prepare(`
      SELECT session_id
      FROM active_session
      WHERE scope = ?
    `).get(ACTIVE_SESSION_SCOPE)?.session_id;

    if (!activeSessionId) {
      const mostRecent = db.prepare(`
        SELECT session_id
        FROM sessions
        ORDER BY updated_at DESC
        LIMIT 1
      `).get();
      
      if (!mostRecent) return null;
      activeSessionId = mostRecent.session_id;
    }

    const row = db.prepare(`
      SELECT session_id, goal, status, next_step, current_focus, why_blocked,
             snapshot_json, completed_count, decisions_count, touched_files_count, updated_at
      FROM sessions
      WHERE session_id = ?
    `).get(activeSessionId);

    if (!row) return null;

    const parseJsonField = (field) => {
      if (!field) return [];
      try {
        return JSON.parse(field);
      } catch {
        return [];
      }
    };

    const snapshot = parseJsonField(row.snapshot_json);

    return {
      sessionId: row.session_id,
      goal: row.goal || 'Untitled session',
      status: row.status || 'in_progress',
      nextStep: row.next_step,
      currentFocus: row.current_focus,
      whyBlocked: row.why_blocked,
      pinnedContext: snapshot.pinnedContext || [],
      unresolvedQuestions: snapshot.unresolvedQuestions || [],
      completed: snapshot.completed || [],
      decisions: snapshot.decisions || [],
      touchedFiles: snapshot.touchedFiles || [],
      completedCount: row.completed_count || 0,
      decisionsCount: row.decisions_count || 0,
      touchedFilesCount: row.touched_files_count || 0,
      updatedAt: row.updated_at,
    };
  });
};

const formatContextItem = (item, index, total) => {
  const prefix = index === total - 1 ? '└─' : '├─';
  return `${prefix} ${item}`;
};

const formatSection = (title, items, emptyMessage = 'None') => {
  if (!items || items.length === 0) {
    return `${title}:\n  ${emptyMessage}`;
  }
  
  const formatted = items.map((item, i) => formatContextItem(item, i, items.length)).join('\n  ');
  return `${title} (${items.length}):\n  ${formatted}`;
};

const compactPath = (filePath) => {
  if (!filePath) return filePath;
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  return `.../${parts.slice(-3).join('/')}`;
};

export const smartStatus = async ({ format = 'detailed', maxItems = 10 } = {}) => {
  const startTime = Date.now();

  recordDecision({
    tool: 'smart_status',
    reason: DECISION_REASONS.CONTEXT_VISIBILITY,
    benefit: EXPECTED_BENEFITS.TRANSPARENCY,
  });

  recordDevctxOperation('smart_status');

  const session = await getActiveSession();

  if (!session) {
    const response = {
      success: false,
      message: 'No active session found',
      hint: 'Use smart_summary with action=update to create a session',
    };

    recordToolUsage({
      tool: 'smart_status',
      rawTokens: 0,
      compressedTokens: countTokens(JSON.stringify(response)),
      savedTokens: 0,
      savingsPct: 0,
    });

    return response;
  }

  const recentCompleted = session.completed.slice(-maxItems);
  const recentDecisions = session.decisions.slice(-maxItems);
  const recentFiles = session.touchedFiles.slice(-maxItems).map(compactPath);

  let output;
  
  if (format === 'compact') {
    output = {
      sessionId: session.sessionId,
      status: session.status,
      nextStep: session.nextStep,
      stats: {
        completed: session.completedCount,
        decisions: session.decisionsCount,
        files: session.touchedFilesCount,
      },
      recentFiles: recentFiles.slice(-3),
      updatedAt: session.updatedAt,
    };
  } else {
    const sections = [
      `📋 Session: ${session.sessionId}`,
      `🎯 Goal: ${session.goal}`,
      `📊 Status: ${session.status}`,
      session.nextStep ? `⏭️  Next: ${session.nextStep}` : null,
      session.currentFocus ? `🔍 Focus: ${session.currentFocus}` : null,
      session.whyBlocked ? `🚫 Blocked: ${session.whyBlocked}` : null,
      '',
      formatSection('✅ Completed', recentCompleted, 'No tasks completed yet'),
      '',
      formatSection('💡 Key Decisions', recentDecisions, 'No decisions recorded yet'),
      '',
      formatSection('📁 Touched Files', recentFiles, 'No files modified yet'),
      '',
      session.pinnedContext.length > 0 ? formatSection('📌 Pinned Context', session.pinnedContext) : null,
      session.unresolvedQuestions.length > 0 ? formatSection('❓ Unresolved Questions', session.unresolvedQuestions) : null,
      '',
      `📈 Totals: ${session.completedCount} completed, ${session.decisionsCount} decisions, ${session.touchedFilesCount} files`,
      `🕐 Updated: ${new Date(session.updatedAt).toLocaleString()}`,
    ].filter(Boolean).join('\n');

    output = {
      success: true,
      sessionId: session.sessionId,
      status: session.status,
      summary: sections,
      context: {
        goal: session.goal,
        nextStep: session.nextStep,
        currentFocus: session.currentFocus,
        whyBlocked: session.whyBlocked,
        stats: {
          completed: session.completedCount,
          decisions: session.decisionsCount,
          files: session.touchedFilesCount,
        },
        recent: {
          completed: recentCompleted,
          decisions: recentDecisions,
          files: recentFiles,
        },
        pinned: session.pinnedContext,
        questions: session.unresolvedQuestions,
      },
      updatedAt: session.updatedAt,
    };
  }

  const outputStr = JSON.stringify(output);
  const tokens = countTokens(outputStr);

  recordToolUsage({
    tool: 'smart_status',
    rawTokens: 0,
    compressedTokens: tokens,
    savedTokens: 0,
    savingsPct: 0,
  });

  return output;
};
