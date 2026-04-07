/**
 * Timestamped console logger.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const base = `[${timestamp()}] ${level.toUpperCase()} ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  return base;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(format("info", message, meta));
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(format("warn", message, meta));
  },

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(format("error", message, meta));
  },

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(format("debug", message, meta));
    }
  },
};
