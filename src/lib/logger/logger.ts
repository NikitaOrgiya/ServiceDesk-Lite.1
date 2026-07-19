import "server-only";

export type LogPayload = {
  event: string;
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  ticketNumber?: string;
  timestamp?: string;
};

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, payload: LogPayload) {
  const entry = {
    level,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    ...payload,
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

/**
 * Structured, server-only logger. Callers must pass already-sanitized
 * fields (see sanitize-error.ts) — this logger does not itself inspect
 * unknown error objects, so never pass a raw Supabase/Error object here.
 */
export const logger = {
  info(payload: LogPayload) {
    write("info", payload);
  },
  warn(payload: LogPayload) {
    write("warn", payload);
  },
  error(payload: LogPayload) {
    write("error", payload);
  },
};
