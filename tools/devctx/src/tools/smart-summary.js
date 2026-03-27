import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../utils/runtime-config.js';
import { countTokens } from '../tokenCounter.js';
import { persistMetrics } from '../metrics.js';

const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_TOKENS = 500;

const getSessionsDir = () => path.join(projectRoot, '.devctx', 'sessions');
const getActiveSessionFile = () => path.join(getSessionsDir(), 'active.json');

const ensureSessionsDir = () => {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
};

const generateSessionId = (goal) => {
  const date = new Date().toISOString().split('T')[0];
  const slug = goal
    ? goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
    : 'session';
  return `${date}-${slug}`;
};

const getSessionPath = (sessionId) => path.join(getSessionsDir(), `${sessionId}.json`);

const loadSession = (sessionId) => {
  const sessionPath = getSessionPath(sessionId);
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    return data;
  } catch {
    return null;
  }
};

const saveSession = (sessionId, data) => {
  ensureSessionsDir();
  const sessionPath = getSessionPath(sessionId);
  const sessionData = {
    ...data,
    sessionId,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf8');
  
  const activeSessionFile = getActiveSessionFile();
  fs.writeFileSync(activeSessionFile, JSON.stringify({ sessionId, updatedAt: sessionData.updatedAt }, null, 2), 'utf8');
  
  return sessionData;
};

const getActiveSession = () => {
  const activeSessionFile = getActiveSessionFile();
  if (!fs.existsSync(activeSessionFile)) {
    return null;
  }
  try {
    const { sessionId } = JSON.parse(fs.readFileSync(activeSessionFile, 'utf8'));
    return loadSession(sessionId);
  } catch {
    return null;
  }
};

const cleanupStaleSessions = () => {
  ensureSessionsDir();
  const sessionsDir = getSessionsDir();
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json') && f !== 'active.json');
  const now = Date.now();
  let cleaned = 0;
  
  const activeSession = getActiveSession();
  const activeSessionId = activeSession?.sessionId;
  
  for (const file of files) {
    const sessionPath = path.join(sessionsDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      
      if (data.sessionId === activeSessionId) {
        continue;
      }
      
      const age = now - new Date(data.updatedAt).getTime();
      if (age > MAX_SESSION_AGE_MS) {
        fs.unlinkSync(sessionPath);
        cleaned += 1;
      }
    } catch {
      fs.unlinkSync(sessionPath);
      cleaned += 1;
    }
  }
  
  return cleaned;
};

const listSessions = () => {
  ensureSessionsDir();
  cleanupStaleSessions();
  
  const sessionsDir = getSessionsDir();
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json') && f !== 'active.json');
  const now = Date.now();
  
  return files
    .map(file => {
      const sessionPath = path.join(sessionsDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        const age = now - new Date(data.updatedAt).getTime();
        return {
          sessionId: data.sessionId,
          goal: data.goal,
          status: data.status,
          updatedAt: data.updatedAt,
          ageMs: age,
          isStale: age > MAX_SESSION_AGE_MS,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
};

const truncateString = (str, maxLength) => {
  if (!str || str.length <= maxLength) return str;
  if (maxLength <= 3) return '';
  return str.slice(0, maxLength - 3) + '...';
};

const compressSummary = (data, maxTokens) => {
  let compressed = {
    goal: data.goal,
    status: data.status,
    completed: data.completed?.slice(-5) || [],
    decisions: data.decisions?.slice(-3) || [],
    blockers: data.blockers || [],
    nextStep: data.nextStep,
    touchedFiles: [...new Set(data.touchedFiles || [])].slice(-10),
  };
  
  let summary = JSON.stringify(compressed, null, 2);
  let tokens = countTokens(summary);
  
  if (tokens <= maxTokens) {
    return { compressed, tokens, truncated: false };
  }
  
  compressed.completed = compressed.completed.slice(-3);
  compressed.decisions = compressed.decisions.slice(-2);
  compressed.touchedFiles = compressed.touchedFiles.slice(-5);
  
  summary = JSON.stringify(compressed, null, 2);
  tokens = countTokens(summary);
  
  if (tokens <= maxTokens) {
    return { compressed, tokens, truncated: true };
  }
  
  compressed.goal = truncateString(compressed.goal, 100);
  compressed.status = truncateString(compressed.status, 50);
  compressed.nextStep = truncateString(compressed.nextStep, 150);
  compressed.blockers = compressed.blockers.map(b => truncateString(b, 100));
  compressed.decisions = compressed.decisions.map(d => truncateString(d, 150));
  compressed.completed = compressed.completed.map(c => truncateString(c, 80));
  compressed.touchedFiles = compressed.touchedFiles.map(f => truncateString(f, 80));
  
  summary = JSON.stringify(compressed, null, 2);
  tokens = countTokens(summary);
  
  if (tokens <= maxTokens) {
    return { compressed, tokens, truncated: true };
  }
  
  compressed.completed = compressed.completed.slice(-2);
  compressed.decisions = compressed.decisions.slice(-1);
  compressed.touchedFiles = compressed.touchedFiles.slice(-3);
  compressed.blockers = compressed.blockers.slice(-2);
  
  summary = JSON.stringify(compressed, null, 2);
  tokens = countTokens(summary);
  
  if (tokens > maxTokens) {
    compressed.completed = compressed.completed.slice(-1);
    compressed.touchedFiles = compressed.touchedFiles.slice(-2);
    compressed.decisions = [];
    compressed.blockers = compressed.blockers.slice(-1);
    
    summary = JSON.stringify(compressed, null, 2);
    tokens = countTokens(summary);
    
    if (tokens > maxTokens) {
      compressed.goal = truncateString(compressed.goal, 50);
      compressed.status = truncateString(compressed.status, 30);
      compressed.nextStep = truncateString(compressed.nextStep, 80);
      compressed.touchedFiles = compressed.touchedFiles.slice(-1);
      compressed.blockers = compressed.blockers.slice(0, 1).map(b => truncateString(b, 50));
      
      summary = JSON.stringify(compressed, null, 2);
      tokens = countTokens(summary);
      
      if (tokens > maxTokens) {
        compressed.goal = truncateString(compressed.goal, 30);
        compressed.status = truncateString(compressed.status, 20);
        compressed.nextStep = truncateString(compressed.nextStep, 50);
        compressed.completed = [];
        compressed.decisions = [];
        compressed.touchedFiles = [];
        compressed.blockers = [];
        
        summary = JSON.stringify(compressed, null, 2);
        tokens = countTokens(summary);
      }
    }
  }

  const recomputeTokens = () => {
    summary = JSON.stringify(compressed, null, 2);
    tokens = countTokens(summary);
  };

  const shrinkScalarField = (field) => {
    const value = compressed[field];
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }

    if (value.length <= 8) {
      compressed[field] = '';
      return true;
    }

    compressed[field] = truncateString(value, Math.max(4, Math.floor(value.length * 0.6)));
    return true;
  };

  const shrinkArrayField = (field) => {
    const value = compressed[field];
    if (!Array.isArray(value) || value.length === 0) {
      return false;
    }

    if (value.length > 1) {
      compressed[field] = value.slice(-1);
      return true;
    }

    const [item] = value;
    if (typeof item !== 'string' || item.length === 0) {
      compressed[field] = [];
      return true;
    }

    if (item.length <= 8) {
      compressed[field] = [];
      return true;
    }

    compressed[field] = [truncateString(item, Math.max(4, Math.floor(item.length * 0.6)))];
    return true;
  };

  if (tokens > maxTokens) {
    const shrinkers = [
      () => shrinkArrayField('completed'),
      () => shrinkArrayField('decisions'),
      () => shrinkArrayField('blockers'),
      () => shrinkArrayField('touchedFiles'),
      () => shrinkScalarField('goal'),
      () => shrinkScalarField('status'),
      () => shrinkScalarField('nextStep'),
    ];

    let madeProgress = true;

    while (tokens > maxTokens && madeProgress) {
      madeProgress = false;

      for (const shrink of shrinkers) {
        if (!shrink()) {
          continue;
        }

        recomputeTokens();
        madeProgress = true;

        if (tokens <= maxTokens) {
          break;
        }
      }
    }
  }

  if (tokens > maxTokens) {
    compressed = {
      goal: '',
      status: '',
      completed: [],
      decisions: [],
      blockers: [],
      nextStep: '',
      touchedFiles: [],
    };
    recomputeTokens();
  }
  
  return { compressed, tokens, truncated: true };
};

export const smartSummary = async ({ action, sessionId, update, maxTokens = DEFAULT_MAX_TOKENS }) => {
  const startTime = Date.now();
  
  ensureSessionsDir();
  
  if (action === 'list_sessions') {
    const sessions = listSessions();
    const activeSession = getActiveSession();
    
    return {
      action: 'list_sessions',
      sessions,
      activeSessionId: activeSession?.sessionId || null,
      totalSessions: sessions.length,
      staleSessions: sessions.filter(s => s.isStale).length,
    };
  }
  
  if (action === 'get') {
    const targetSessionId = sessionId || getActiveSession()?.sessionId;
    
    if (!targetSessionId) {
      return {
        action: 'get',
        sessionId: null,
        found: false,
        message: 'No active session found. Use action=update to create one.',
      };
    }
    
    const session = loadSession(targetSessionId);
    
    if (!session) {
      return {
        action: 'get',
        sessionId: targetSessionId,
        found: false,
        message: 'Session not found.',
      };
    }
    
    const { compressed, tokens } = compressSummary(session, maxTokens);
    
    persistMetrics({
      tool: 'smart_summary',
      action: 'get',
      sessionId: targetSessionId,
      rawTokens: countTokens(JSON.stringify(session)),
      finalTokens: tokens,
      latencyMs: Date.now() - startTime,
    });
    
    return {
      action: 'get',
      sessionId: targetSessionId,
      found: true,
      summary: compressed,
      tokens,
      updatedAt: session.updatedAt,
    };
  }
  
  if (action === 'reset') {
    const targetSessionId = sessionId || getActiveSession()?.sessionId;
    
    if (!targetSessionId) {
      return {
        action: 'reset',
        sessionId: null,
        message: 'No session to reset.',
      };
    }
    
    const activeSession = getActiveSession();
    const isActiveSession = activeSession?.sessionId === targetSessionId;
    
    const sessionPath = getSessionPath(targetSessionId);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
    
    if (isActiveSession) {
      const activeSessionFile = getActiveSessionFile();
      if (fs.existsSync(activeSessionFile)) {
        fs.unlinkSync(activeSessionFile);
      }
    }
    
    return {
      action: 'reset',
      sessionId: targetSessionId,
      message: 'Session cleared.',
    };
  }
  
  if (action === 'update' || action === 'append') {
    if (!update || typeof update !== 'object') {
      throw new Error('update parameter is required for update/append actions');
    }
    
    let targetSessionId = sessionId;
    let existingData = {};
    
    if (!targetSessionId || targetSessionId === 'new') {
      if (action === 'append') {
        const activeSession = getActiveSession();
        if (activeSession) {
          targetSessionId = activeSession.sessionId;
          existingData = activeSession;
        } else {
          targetSessionId = generateSessionId(update.goal);
        }
      } else {
        targetSessionId = generateSessionId(update.goal);
      }
    } else {
      const existing = loadSession(targetSessionId);
      if (existing) {
        existingData = existing;
      }
    }
    
    const mergedData = action === 'append' 
      ? {
          goal: update.goal || existingData.goal,
          status: update.status || existingData.status,
          completed: [...(existingData.completed || []), ...(update.completed || [])],
          decisions: [...(existingData.decisions || []), ...(update.decisions || [])],
          blockers: update.blockers !== undefined ? update.blockers : existingData.blockers,
          nextStep: update.nextStep || existingData.nextStep,
          touchedFiles: [...new Set([...(existingData.touchedFiles || []), ...(update.touchedFiles || [])])],
        }
      : {
          goal: update.goal || existingData.goal || 'Untitled session',
          status: update.status || existingData.status || 'in_progress',
          completed: update.completed || existingData.completed || [],
          decisions: update.decisions || existingData.decisions || [],
          blockers: update.blockers !== undefined ? update.blockers : (existingData.blockers || []),
          nextStep: update.nextStep || existingData.nextStep || '',
          touchedFiles: update.touchedFiles || existingData.touchedFiles || [],
        };
    
    const savedData = saveSession(targetSessionId, mergedData);
    const { compressed, tokens, truncated } = compressSummary(savedData, maxTokens);
    
    persistMetrics({
      tool: 'smart_summary',
      action,
      sessionId: targetSessionId,
      rawTokens: countTokens(JSON.stringify(savedData)),
      finalTokens: tokens,
      latencyMs: Date.now() - startTime,
    });
    
    return {
      action,
      sessionId: targetSessionId,
      summary: compressed,
      tokens,
      truncated,
      updatedAt: savedData.updatedAt,
      message: action === 'append' ? 'Session updated incrementally.' : 'Session saved.',
    };
  }
  
  throw new Error(`Invalid action: ${action}. Valid actions: get, update, append, reset, list_sessions`);
};
