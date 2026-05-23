export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class Logger {
  private startTimes: Map<string, number> = new Map();

  log(level: LogLevel, action: string, message: string, metadata?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      action,
      message,
      metadata,
    };
    console.log(JSON.stringify(entry));
  }

  debug(action: string, message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, action, message, metadata);
  }

  info(action: string, message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.INFO, action, message, metadata);
  }

  warn(action: string, message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.WARN, action, message, metadata);
  }

  error(action: string, message: string, metadata?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, action, message, metadata);
  }

  startTimer(label: string) {
    this.startTimes.set(label, Date.now());
  }

  endTimer(label: string, action: string, metadata?: Record<string, unknown>) {
    const start = this.startTimes.get(label);
    if (start) {
      const duration = Date.now() - start;
      this.info(action, `Completed in ${duration}ms`, {
        ...metadata,
        duration_ms: duration,
      });
      this.startTimes.delete(label);
    }
  }
}

export const logger = new Logger();
