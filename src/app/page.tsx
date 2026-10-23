"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Monitor } from "@/lib/types";
import { MonitorModal } from "@/components/MonitorModal";

// External store for current time clock to ensure pure renders
function subscribeToClock(callback: () => void) {
  const timer = setInterval(callback, 1000);
  return () => clearInterval(timer);
}

function getClockSnapshot(): number {
  return Date.now();
}

function getServerSnapshot(): number {
  return 0;
}

function formatRelative(isoString: string | null, nowMs: number): string {
  if (!isoString) return "Never";
  const sec = Math.floor((nowMs - new Date(isoString).getTime()) / 1000);
  if (sec < 60) return `${Math.max(0, sec)}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  return `${hours}h ago`;
}

function formatNext(isoString: string, nowMs: number): string {
  const diffSec = Math.floor((new Date(isoString).getTime() - nowMs) / 1000);
  if (diffSec <= 0) return "Due now";
  if (diffSec < 60) return `in ${diffSec}s`;
  return `in ${Math.floor(diffSec / 60)}m`;
}

function renderReleaseCountdown(releaseAt: string | null, nowMs: number) {
  if (!releaseAt) return null;
  const diffMinutes = Math.floor((new Date(releaseAt).getTime() - nowMs) / (60 * 1000));

  if (diffMinutes > 0) {
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
        ⏱️ Drops in {hours > 0 ? `${hours}h ` : ""}{mins}m (IST)
      </span>
    );
  }

  if (diffMinutes >= -30) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded animate-pulse">
        ⚡ Drop Window Active (60s check)
      </span>
    );
  }

  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  const nowMs = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerSnapshot);

  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [heartbeat, setHeartbeat] = useState<string | null>(null);
  const [notifyEmail, setNotifyEmail] = useState<string>("");
  const [demoAvailable, setDemoAvailable] = useState<boolean>(false);
  const [togglingDemo, setTogglingDemo] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [monitorToEdit, setMonitorToEdit] = useState<Monitor | null>(null);

  // Action states
  const [testingNotification, setTestingNotification] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [runNowResult, setRunNowResult] = useState<{ id: string; message: string } | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null);
      const [monRes, demoRes] = await Promise.all([
        fetch("/api/monitors"),
        fetch("/api/demo/toggle"),
      ]);
      const data = await monRes.json();
      const demoData = await demoRes.json().catch(() => ({}));

      if (!monRes.ok) {
        setError(data.error || "Failed to load monitors");
      } else {
        setMonitors(data.monitors || []);
        setHeartbeat(data.heartbeat || null);
        setNotifyEmail(data.notifyEmail || "");
      }

      if (typeof demoData.available === "boolean") {
        setDemoAvailable(demoData.available);
      }
    } catch {
      setError("Network error fetching dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetch("/api/monitors"), fetch("/api/demo/toggle")])
      .then(async ([monRes, demoRes]) => {
        const data = await monRes.json();
        const demoData = await demoRes.json().catch(() => ({}));
        if (isMounted) {
          if (data.error) {
            setError(data.error);
          } else {
            setMonitors(data.monitors || []);
            setHeartbeat(data.heartbeat || null);
            setNotifyEmail(data.notifyEmail || "");
          }
          if (typeof demoData.available === "boolean") {
            setDemoAvailable(demoData.available);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Network error fetching dashboard data");
          setLoading(false);
        }
      });

    const pollTimer = setInterval(() => {
      Promise.all([fetch("/api/monitors"), fetch("/api/demo/toggle")])
        .then(async ([monRes, demoRes]) => {
          const data = await monRes.json();
          const demoData = await demoRes.json().catch(() => ({}));
          if (isMounted && !data.error) {
            setMonitors(data.monitors || []);
            setHeartbeat(data.heartbeat || null);
            setNotifyEmail(data.notifyEmail || "");
            if (typeof demoData.available === "boolean") {
              setDemoAvailable(demoData.available);
            }
          }
        })
        .catch(() => {});
    }, 20000);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
    };
  }, []);

  async function handleToggleDemo() {
    setTogglingDemo(true);
    try {
      const res = await fetch("/api/demo/toggle", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setDemoAvailable(data.available);
      }
    } finally {
      setTogglingDemo(false);
    }
  }

  // Actions
  async function handleTogglePause(monitor: Monitor) {
    setActionLoadingId(monitor.id);
    const action = monitor.status === "paused" ? "resume" : "pause";
    try {
      const res = await fetch(`/api/monitors/${monitor.id}/${action}`, { method: "POST" });
      if (res.ok) fetchDashboardData();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRearm(monitor: Monitor) {
    setActionLoadingId(monitor.id);
    try {
      const res = await fetch(`/api/monitors/${monitor.id}/rearm`, { method: "POST" });
      if (res.ok) fetchDashboardData();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRunNow(monitor: Monitor) {
    setActionLoadingId(monitor.id);
    setRunNowResult(null);
    try {
      const res = await fetch(`/api/monitors/${monitor.id}/run-now`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRunNowResult({
          id: monitor.id,
          message: `Check complete! State: ${data.result.state.toUpperCase()} (${data.page.latencyMs}ms) - ${data.result.note || "No notes"}`,
        });
        fetchDashboardData();
      } else {
        setRunNowResult({
          id: monitor.id,
          message: `Check failed: ${data.error || "Unknown error"}`,
        });
      }
    } catch {
      setRunNowResult({
        id: monitor.id,
        message: "Network error executing manual check",
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(monitor: Monitor) {
    const confirmed = window.confirm(`Are you sure you want to delete monitor "${monitor.name}"?`);
    if (!confirmed) return;

    setActionLoadingId(monitor.id);
    try {
      const res = await fetch(`/api/monitors/${monitor.id}`, { method: "DELETE" });
      if (res.ok) fetchDashboardData();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSendTestAlert() {
    setTestingNotification(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-notification", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const channels = data.results.map((r: { channel: string }) => r.channel).join(" & ");
        setTestResult(`Test alert sent successfully via ${channels}! Check your inbox/phone.`);
      } else {
        setTestResult(`Failed to send test alert: ${data.error || "Check Resend API key"}`);
      }
    } catch {
      setTestResult("Network error triggering test alert");
    } finally {
      setTestingNotification(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  // Health strip calculations
  function renderHealthStrip() {
    if (!heartbeat) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
            <span>
              <strong>Scheduler has not run yet.</strong> Ensure cron-job.org or GET /api/tick is active.
            </span>
          </div>
        </div>
      );
    }

    const diffSeconds = nowMs > 0
      ? Math.max(0, Math.floor((nowMs - new Date(heartbeat).getTime()) / 1000))
      : 0;
    const isDown = diffSeconds > 180; // Older than 3 minutes

    if (isDown) {
      const minAgo = Math.floor(diffSeconds / 60);
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-600 animate-pulse" />
            <span>
              ⚠️ Scheduler may be down: last check was {minAgo} minutes ago ({diffSeconds}s ago).
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            Scheduler healthy: last ran <strong>{diffSeconds} seconds ago</strong>.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Health Strip */}
      {renderHealthStrip()}

      {/* Demo Testing Facility Strip */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-bold text-sm">
            🧪
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900">Demo Testing Facility</h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                  demoAvailable
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {demoAvailable ? "TICKETS AVAILABLE" : "SOLD OUT"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Live mock page for testing alerts without waiting:{" "}
              <a
                href="/demo/tickets"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline font-medium"
              >
                /demo/tickets ↗
              </a>
            </p>
          </div>
        </div>

        <button
          onClick={handleToggleDemo}
          disabled={togglingDemo}
          className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-xs transition-colors shrink-0 disabled:opacity-50"
        >
          {togglingDemo
            ? "Flipping..."
            : `Toggle Demo (${demoAvailable ? "Flip to SOLD OUT" : "Flip to AVAILABLE"})`}
        </button>
      </div>

      {/* Test Alert feedback */}
      {testResult && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs font-medium text-indigo-800 flex items-center justify-between">
          <span>{testResult}</span>
          <button onClick={() => setTestResult(null)} className="text-indigo-500 hover:text-indigo-800">✕</button>
        </div>
      )}

      {/* 2. Top Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900">Your Monitored Events</h2>
          <p className="text-xs text-slate-500">
            {monitors.length} active monitors &bull; Alerts routed to {notifyEmail || "configured email"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setMonitorToEdit(null);
              setIsModalOpen(true);
            }}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
          >
            + Add New Monitor
          </button>
          <button
            onClick={handleSendTestAlert}
            disabled={testingNotification}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs disabled:opacity-50 transition-colors"
          >
            {testingNotification ? "Sending..." : "Send Test Alert"}
          </button>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 shadow-xs transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* 3. Monitors Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading monitor cards...</div>
      ) : monitors.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-white/50">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 text-xl mb-3">
            🎫
          </div>
          <h3 className="text-sm font-bold text-slate-800">No ticket monitors created yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Add a ticket booking URL to begin tracking ticket drops and receiving immediate alerts.
          </p>
          <button
            onClick={() => {
              setMonitorToEdit(null);
              setIsModalOpen(true);
            }}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
          >
            Create Your First Monitor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {monitors.map((m) => {
            const isLoading = actionLoadingId === m.id;
            const hasRunMessage = runNowResult?.id === m.id;

            return (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {m.name}
                      </h3>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline break-all mt-0.5 inline-block"
                      >
                        {m.url.length > 45 ? `${m.url.slice(0, 45)}...` : m.url} ↗
                      </a>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                          m.status === "active"
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                            : m.status === "alerted"
                            ? "bg-purple-50 text-purple-700 ring-1 ring-purple-600/20"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {m.status === "active"
                          ? "Monitoring"
                          : m.status === "alerted"
                          ? "🚨 Alert Sent"
                          : "Paused"}
                      </span>

                      {/* State Badge */}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          m.last_state === "available"
                            ? "bg-emerald-600 text-white"
                            : m.last_state === "blocked"
                            ? "bg-amber-500 text-white"
                            : m.last_state === "error"
                            ? "bg-rose-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {m.last_state === "available"
                          ? "AVAILABLE"
                          : m.last_state === "unavailable"
                          ? "Not Available"
                          : m.last_state}
                      </span>
                    </div>
                  </div>

                  {/* Countdown banner if release_at is present */}
                  {renderReleaseCountdown(m.release_at, nowMs) && (
                    <div className="mt-2.5">{renderReleaseCountdown(m.release_at, nowMs)}</div>
                  )}

                  {/* Metadata Stats */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-600">
                    <div>
                      <span className="text-slate-400 block">Frequency:</span>
                      Every {m.interval_seconds / 60}m &bull; {m.mode}
                    </div>
                    <div>
                      <span className="text-slate-400 block">Last Checked:</span>
                      {formatRelative(m.last_checked_at, nowMs)}
                    </div>
                    <div>
                      <span className="text-slate-400 block">Next Scheduled Check:</span>
                      {m.status === "active" ? formatNext(m.next_check_at, nowMs) : "Paused"}
                    </div>
                    <div>
                      <span className="text-slate-400 block">Keyword:</span>
                      <span className="truncate block font-mono text-[10px]">
                        {m.keyword || m.css_selector || "(changes mode)"}
                      </span>
                    </div>
                  </div>

                  {/* Error & Warning Messages */}
                  {m.last_error && (
                    <div className="mt-3 rounded-lg bg-rose-50 p-2.5 text-[11px] text-rose-700 border border-rose-100">
                      ⚠️ <strong>Issue:</strong> {m.last_error}
                    </div>
                  )}

                  {/* Run Now inline message */}
                  {hasRunMessage && (
                    <div className="mt-3 rounded-lg bg-indigo-50 p-2.5 text-[11px] text-indigo-800 border border-indigo-100">
                      {runNowResult.message}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {m.status === "alerted" ? (
                      <button
                        onClick={() => handleRearm(m)}
                        disabled={isLoading}
                        className="rounded-md bg-purple-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition-colors"
                      >
                        🔄 Re-Arm Monitor
                      </button>
                    ) : (
                      <button
                        onClick={() => handleTogglePause(m)}
                        disabled={isLoading}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        {m.status === "paused" ? "▶ Resume" : "⏸ Pause"}
                      </button>
                    )}

                    <button
                      onClick={() => handleRunNow(m)}
                      disabled={isLoading}
                      className="rounded-md border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      {isLoading ? "Running..." : "Run Check Now"}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/monitors/${m.id}`}
                      className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                    >
                      History
                    </Link>
                    <button
                      onClick={() => {
                        setMonitorToEdit(m);
                        setIsModalOpen(true);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(m)}
                      disabled={isLoading}
                      className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Monitor Create/Edit Modal */}
      <MonitorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={fetchDashboardData}
        monitorToEdit={monitorToEdit}
        notifyEmail={notifyEmail}
      />
    </div>
  );
}
