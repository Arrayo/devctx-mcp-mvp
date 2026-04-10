export const IGNORED_DIRS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.terraform',
  '.devctx',
];

export const IGNORED_FILE_NAMES = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'npm-shrinkwrap.json',
];

export const IGNORED_FILE_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.(map|snap)$/,
  /^(questions|answers|fixtures|seed|dump|data)\.(json|jsonl|ndjson)$/i,
];
