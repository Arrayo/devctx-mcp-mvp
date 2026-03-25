const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export class Logger {
  constructor(level = 'info') {
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  }

  debug(message, context = {}) {
    this._log('debug', message, context);
  }

  info(message, context = {}) {
    this._log('info', message, context);
  }

  warn(message, context = {}) {
    this._log('warn', message, context);
  }

  error(message, context = {}) {
    this._log('error', message, context);
  }

  _log(level, message, context) {
    if (LOG_LEVELS[level] < this.level) return;
    const entry = { timestamp: new Date().toISOString(), level, message, ...context };
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  }
}

export const createLogger = (level) => new Logger(level);
