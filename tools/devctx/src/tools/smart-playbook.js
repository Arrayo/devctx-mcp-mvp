import { loadPlaybooks, listPlaybookSummaries } from '../playbooks/loader.js';
import { runPlaybook } from '../playbooks/runner.js';
import { recordToolUsage } from '../usage-feedback.js';
import { recordDecision, DECISION_REASONS, EXPECTED_BENEFITS } from '../decision-explainer.js';
import { recordDevctxOperation } from '../missed-opportunities.js';

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export const smartPlaybook = async ({
  name,
  args = {},
  list,
  dryRun,
  stopOnFail,
} = {}) => {
  if (list === true || !name) {
    const { summaries, errors, sources } = listPlaybookSummaries();
    recordDevctxOperation();
    return {
      success: true,
      action: 'list',
      playbooks: summaries,
      errors,
      sources,
    };
  }

  if (typeof name !== 'string' || !SAFE_NAME_RE.test(name)) {
    return { success: false, error: `Invalid playbook name: ${name}` };
  }

  const { playbooks } = loadPlaybooks();
  const playbook = playbooks.get(name);
  if (!playbook || playbook.error) {
    const available = [...playbooks.keys()].filter((k) => !k.startsWith('__error__'));
    return {
      success: false,
      error: playbook?.error ?? `Playbook not found: ${name}`,
      availablePlaybooks: available,
    };
  }

  if (typeof stopOnFail === 'boolean') playbook.stopOnFail = stopOnFail;

  const result = await runPlaybook(playbook, args, { dryRun: dryRun === true });

  recordToolUsage({ tool: 'smart_playbook', savedTokens: 0, target: name });
  recordDevctxOperation();
  recordDecision({
    tool: 'smart_playbook',
    action: `run playbook "${name}"`,
    reason: DECISION_REASONS.RELATED_FILES ?? 'composite workflow',
    alternative: 'Multiple sequential tool calls coordinated manually',
    expectedBenefit: `${EXPECTED_BENEFITS.TOKEN_SAVINGS(0)}, single-call orchestration with consistent step order`,
    context: `${result.executed}/${result.stepCount} steps executed, ${result.skipped} skipped, success=${result.success}`,
  });

  return {
    success: result.success,
    action: 'run',
    ...result,
  };
};
