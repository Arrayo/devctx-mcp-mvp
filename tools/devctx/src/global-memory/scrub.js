const SECRET_PATTERNS = [
  /(api[_-]?key|secret|token|password|passwd|pwd|bearer|authorization)\s*[:=]\s*['"]?([A-Za-z0-9_\-+/=]{8,})['"]?/gi,
  /(aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['"]?([A-Za-z0-9_\-+/=]{8,})['"]?/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /xoxb-[A-Za-z0-9-]{20,}/g,
  /AIza[A-Za-z0-9_-]{30,}/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g,
  /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s'"]+/gi,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

const HOME_PATH_RE = /\/home\/[^/\s'"]+/g;
const USER_PATH_RE = /\/Users\/[^/\s'"]+/g;
const WIN_USER_RE = /C:\\Users\\[^\\/\s'"]+/g;

const REDACTION = '[REDACTED]';

export const scrubContent = (content) => {
  if (typeof content !== 'string') return content;
  let cleaned = content;
  for (const pattern of SECRET_PATTERNS) {
    cleaned = cleaned.replace(pattern, REDACTION);
  }
  cleaned = cleaned.replace(HOME_PATH_RE, '~').replace(USER_PATH_RE, '~').replace(WIN_USER_RE, '~');
  return cleaned;
};

export const containsLikelySecret = (content) => {
  if (typeof content !== 'string') return false;
  return SECRET_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(content);
  });
};

export const hashProjectPath = (absolutePath) => {
  if (!absolutePath || typeof absolutePath !== 'string') return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < absolutePath.length; i += 1) {
    hash ^= absolutePath.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `proj-${hash.toString(36)}`;
};
