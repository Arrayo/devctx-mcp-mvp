const formatNumber = (value) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return String(value);
};

const formatRatio = (raw, compressed) => {
  if (raw === 0 || compressed === 0) {
    return null;
  }
  const ratio = raw / compressed;
  if (ratio < 2) {
    return null;
  }
  return `${ratio.toFixed(1)}:1`;
};

const formatDuration = (startTime) => {
  if (!startTime) {
    return null;
  }
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) {
    return `${elapsed}ms`;
  }
  return `${(elapsed / 1000).toFixed(1)}s`;
};

export const buildMetricsDisplay = ({ tool, target, metrics, startTime, filesCount }) => {
  const parts = [`✓ ${tool}`];

  if (target) {
    const shortTarget = target.length > 40 ? `${target.slice(0, 37)}...` : target;
    parts.push(shortTarget);
  }

  if (filesCount && filesCount > 1) {
    parts.push(`${filesCount} files`);
  }

  if (metrics?.rawTokens > 0 && metrics?.compressedTokens > 0) {
    const raw = formatNumber(metrics.rawTokens);
    const compressed = formatNumber(metrics.compressedTokens);
    const ratio = formatRatio(metrics.rawTokens, metrics.compressedTokens);
    
    if (ratio) {
      parts.push(`${raw}→${compressed} tokens (${ratio})`);
    } else {
      parts.push(`${raw}→${compressed} tokens`);
    }
  }

  const duration = formatDuration(startTime);
  if (duration) {
    parts.push(duration);
  }

  return parts.join(', ');
};
