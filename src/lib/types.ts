export type MonitorMode = "appears" | "disappears" | "changes";
export type MonitorStatus = "active" | "paused" | "alerted";
export type MonitorState = "unknown" | "unavailable" | "available" | "error" | "blocked";
export type CheckInterval = 60 | 180 | 300;

export interface Monitor {
  id: string;
  name: string;
  url: string;
  interval_seconds: CheckInterval;
  mode: MonitorMode;
  keyword: string | null;
  sanity_keyword: string | null;
  css_selector: string | null;
  release_at: string | null;
  status: MonitorStatus;
  last_state: MonitorState;
  last_checked_at: string | null;
  next_check_at: string;
  consecutive_failures: number;
  last_error: string | null;
  last_content_hash: string | null;
  alert_claimed_at: string | null;
  alert_sent_at: string | null;
  trouble_notified_at: string | null;
  created_at: string;
}

export interface CheckLog {
  id: number;
  monitor_id: string;
  checked_at: string;
  http_status: number | null;
  state: MonitorState;
  latency_ms: number | null;
  note: string | null;
}

export interface Heartbeat {
  id: number;
  last_tick_at: string | null;
}

export interface DemoState {
  id: number;
  available: boolean;
}

export interface EvaluationResult {
  state: MonitorState;
  hash?: string;
  note?: string;
}

export interface PageFetchResult {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  latencyMs: number;
  error?: string;
  blockedReason?: string;
  retryAfterSeconds?: number;
  needsBrowserHint?: boolean;
}

export interface NotificationResult {
  channel: "email" | "telegram";
  ok: boolean;
  error?: string;
}

export interface TickSummary {
  checked: number;
  available: number;
  errors: number;
  skipped: number;
  durationMs: number;
}
