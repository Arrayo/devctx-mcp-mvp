// Stub for workflow tracking (to be implemented in future version)
// This avoids SQLite issues in tests while keeping the API available

export const detectWorkflowType = () => null;
export const getWorkflowBaseline = () => 0;
export const startWorkflow = () => null;
export const endWorkflow = () => null;
export const getWorkflowMetrics = () => [];
export const getWorkflowSummaryByType = () => [];
export const autoTrackWorkflow = () => null;

export const WORKFLOW_DEFINITIONS = {
  debugging: {
    name: 'Debugging',
    description: 'Error-first, symbol-focused debugging workflow',
    typicalTools: ['smart_turn', 'smart_search', 'smart_read', 'smart_shell'],
    minTools: 3,
    baselineTokens: 150000,
    pattern: /debug|error|bug|fix|fail/i,
  },
  'code-review': {
    name: 'Code Review',
    description: 'Diff-aware, API-focused code review workflow',
    typicalTools: ['smart_turn', 'smart_context', 'smart_read', 'git_blame', 'smart_shell'],
    minTools: 3,
    baselineTokens: 200000,
    pattern: /review|pr|pull.?request|approve/i,
  },
  refactoring: {
    name: 'Refactoring',
    description: 'Graph-aware, test-verified refactoring workflow',
    typicalTools: ['smart_turn', 'smart_context', 'smart_read', 'git_blame', 'smart_shell'],
    minTools: 3,
    baselineTokens: 180000,
    pattern: /refactor|extract|rename|move|restructure/i,
  },
  testing: {
    name: 'Testing',
    description: 'Coverage-aware, TDD-friendly testing workflow',
    typicalTools: ['smart_turn', 'smart_search', 'smart_read', 'smart_context', 'smart_shell'],
    minTools: 3,
    baselineTokens: 120000,
    pattern: /test|spec|coverage|tdd/i,
  },
  architecture: {
    name: 'Architecture Exploration',
    description: 'Index-first, minimal-detail architecture exploration',
    typicalTools: ['smart_turn', 'smart_context', 'smart_search', 'smart_read', 'cross_project'],
    minTools: 3,
    baselineTokens: 300000,
    pattern: /architect|explore|understand|structure|design/i,
  },
};
