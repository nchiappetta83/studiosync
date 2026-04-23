const fs = require('fs');
const path = require('path');

function serializeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = serializeValue(entry);
    }
    return output;
  }

  if (typeof value === 'undefined') return '[undefined]';
  return value;
}

function formatMessage(args) {
  if (!Array.isArray(args) || args.length === 0) return '';

  return args.map((arg) => {
    const serialized = serializeValue(arg);
    if (typeof serialized === 'string') return serialized;
    try {
      return JSON.stringify(serialized);
    } catch (_) {
      return String(serialized);
    }
  }).join(' ');
}

function createLogger({ appDataDir, appName }) {
  const logDir = path.join(appDataDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const originals = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
  };

  const logger = {
    appName,
    logDir,
    originals,
    consoleAttached: false,
    processHandlersAttached: false,

    getCurrentLogFile() {
      const dateStamp = new Date().toISOString().slice(0, 10);
      return path.join(logDir, `${appName}-${dateStamp}.log`);
    },

    getLogPaths() {
      return {
        directory: logDir,
        currentFile: this.getCurrentLogFile(),
      };
    },

    write(level, message, meta = null) {
      try {
        const target = this.getCurrentLogFile();
        if (fs.existsSync(target) && fs.statSync(target).size > 5 * 1024 * 1024) {
          fs.writeFileSync(target, '');
        }

        const payload = {
          timestamp: new Date().toISOString(),
          level: String(level || 'info').toUpperCase(),
          app: appName,
          message: String(message || ''),
          ...(meta ? { meta: serializeValue(meta) } : {}),
        };

        fs.appendFileSync(target, `${JSON.stringify(payload)}\n`, 'utf-8');
      } catch (_) {}
    },

    debug(message, meta) {
      this.write('debug', message, meta);
    },

    info(message, meta) {
      this.write('info', message, meta);
    },

    warn(message, meta) {
      this.write('warn', message, meta);
    },

    error(message, meta) {
      this.write('error', message, meta);
    },

    attachConsole() {
      if (this.consoleAttached) return;
      this.consoleAttached = true;

      const levelMap = {
        log: 'info',
        info: 'info',
        warn: 'warn',
        error: 'error',
        debug: 'debug',
      };

      for (const method of Object.keys(levelMap)) {
        console[method] = (...args) => {
          this.write(levelMap[method], formatMessage(args));
          originals[method](...args);
        };
      }
    },

    attachProcessHandlers() {
      if (this.processHandlersAttached) return;
      this.processHandlersAttached = true;

      process.on('uncaughtException', (error) => {
        this.error('uncaught-exception', error);
      });

      process.on('unhandledRejection', (reason) => {
        this.error('unhandled-rejection', reason);
      });

      process.on('warning', (warning) => {
        this.warn('process-warning', warning);
      });
    },
  };

  return logger;
}

module.exports = { createLogger };
