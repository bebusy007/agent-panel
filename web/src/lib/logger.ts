type LogLevel = "debug" | "info" | "warn" | "error";
type LogCategory =
  | "ui"
  | "navigation"
  | "http"
  | "render"
  | "error"
  | "lifecycle";

interface LogEntry {
  ts: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  sessionId: string;
  requestId?: string;
  meta?: Record<string, unknown>;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export const SESSION_ID = crypto.randomUUID();

const FLUSH_INTERVAL = 5_000;
const MAX_BUFFER_SIZE = 50;

class Logger {
  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private minLevel: LogLevel = import.meta.env.DEV ? "debug" : "info";

  constructor() {
    this.startAutoFlush();
    this.installGlobalHandlers();
  }

  setLevel(level: LogLevel) {
    this.minLevel = level;
  }

  debug(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log("debug", category, message, meta);
  }

  info(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log("info", category, message, meta);
  }

  warn(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log("warn", category, message, meta);
  }

  error(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    this.log("error", category, message, meta);
  }

  flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    }).catch(() => {
      // Re-queue failed batch (truncate to prevent unbounded growth)
      const remaining = MAX_BUFFER_SIZE - this.buffer.length;
      if (remaining > 0) {
        this.buffer.unshift(...batch.slice(-remaining));
      }
    });
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      category,
      message,
      sessionId: SESSION_ID,
      ...(meta ? { meta } : {}),
    };

    this.buffer.push(entry);

    if (import.meta.env.DEV) {
      const consoleFn =
        level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : level === "debug"
              ? console.debug
              : console.log;
      consoleFn(`[${category}] ${message}`, meta ?? "");
    }

    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  private startAutoFlush() {
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL);
  }

  private installGlobalHandlers() {
    window.addEventListener("error", (e) => {
      this.error("error", e.message || "Unknown error", {
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
      });
    });

    window.addEventListener("unhandledrejection", (e) => {
      this.error("error", `Unhandled rejection: ${e.reason}`, {
        reason: String(e.reason),
      });
    });

    // Flush remaining logs when page is being hidden
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.buffer.length > 0) {
        const batch = this.buffer.splice(0);
        navigator.sendBeacon(
          "/api/logs",
          new Blob([JSON.stringify(batch)], { type: "application/json" }),
        );
      }
    });
  }
}

export const logger = new Logger();
