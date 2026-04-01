const MINIMUM_NODE_VERSION = 22;
const MINIMUM_NODE_VERSION_REASON = 'node:sqlite and node:test require Node 22+';

const parseNodeVersion = (versionString) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(versionString);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: versionString,
  };
};

export const checkNodeVersion = (versionString = process.version) => {
  const current = parseNodeVersion(versionString);

  if (!current) {
    return {
      ok: false,
      current: versionString,
      minimum: MINIMUM_NODE_VERSION,
      message: `Unable to parse Node version: ${versionString}`,
      reason: MINIMUM_NODE_VERSION_REASON,
    };
  }

  const ok = current.major >= MINIMUM_NODE_VERSION;

  return {
    ok,
    current: current.raw,
    minimum: MINIMUM_NODE_VERSION,
    message: ok
      ? `Node ${current.raw} meets minimum requirement (${MINIMUM_NODE_VERSION}+)`
      : `Node ${current.raw} is below minimum requirement (${MINIMUM_NODE_VERSION}+). ${MINIMUM_NODE_VERSION_REASON}`,
    reason: ok ? null : MINIMUM_NODE_VERSION_REASON,
  };
};

export const assertNodeVersion = (versionString = process.version) => {
  const check = checkNodeVersion(versionString);

  if (!check.ok) {
    throw new Error(check.message);
  }

  return check;
};
