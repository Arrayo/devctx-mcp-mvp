import { readTextFile, writeTextFile } from '../utils/fs.js';
import { recordToolUsage } from '../usage-feedback.js';
import { recordDecision, DECISION_REASONS, EXPECTED_BENEFITS } from '../decision-explainer.js';
import { recordDevctxOperation } from '../missed-opportunities.js';
import { countTokens } from '../tokenCounter.js';
import { persistMetrics } from '../metrics.js';

export const smartEdit = ({ pattern, replacement, files, mode = 'literal', dryRun = false }) => {
  const startTime = Date.now();
  
  recordDecision({
    tool: 'smart_edit',
    reason: DECISION_REASONS.BATCH_OPERATION,
    benefit: EXPECTED_BENEFITS.EFFICIENCY,
  });

  recordDevctxOperation('smart_edit');

  const results = [];
  let totalMatches = 0;
  let totalReplacements = 0;
  
  for (const filePath of files) {
    try {
      const { content } = readTextFile(filePath);
      let newContent;
      let matches = 0;

      if (mode === 'regex') {
        const regex = new RegExp(pattern, 'gm');
        const matchesArray = content.match(regex);
        matches = matchesArray ? matchesArray.length : 0;
        newContent = content.replace(regex, replacement);
      } else {
        const parts = content.split(pattern);
        matches = parts.length - 1;
        newContent = parts.join(replacement);
      }

      if (matches > 0) {
        if (!dryRun) {
          writeTextFile(filePath, newContent);
        }
        
        results.push({
          file: filePath,
          matches,
          replaced: !dryRun,
          preview: dryRun ? {
            before: content.substring(0, 200),
            after: newContent.substring(0, 200),
          } : undefined,
        });
        
        totalMatches += matches;
        if (!dryRun) totalReplacements += matches;
      } else {
        results.push({
          file: filePath,
          matches: 0,
          replaced: false,
        });
      }
    } catch (error) {
      results.push({
        file: filePath,
        error: error.message,
      });
    }
  }

  const response = {
    success: true,
    mode,
    pattern,
    dryRun,
    totalFiles: files.length,
    filesModified: results.filter(r => r.matches > 0).length,
    totalMatches,
    totalReplacements,
    results,
  };

  const outputStr = JSON.stringify(response);
  const tokens = countTokens(outputStr);

  persistMetrics({
    tool: 'smart_edit',
    rawTokens: 0,
    compressedTokens: tokens,
    savedTokens: 0,
    savingsPct: 0,
    latencyMs: Date.now() - startTime,
  });

  recordToolUsage({
    tool: 'smart_edit',
    rawTokens: 0,
    compressedTokens: tokens,
    savedTokens: 0,
    savingsPct: 0,
  });

  return response;
};
