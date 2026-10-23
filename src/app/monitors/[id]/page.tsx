"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { Monitor, CheckLog } from "@/lib/types";

function MonitorDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [logs, setLogs] = useState<CheckLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/monitors/${id}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load monitor details");
      } else {
        setMonitor(data.monitor);
        setLogs(data.logs || []);
      }
    } catch {
      setError("Network error fetching monitor details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/monitors/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.error) {
            setError(data.error);
          } else {
            setMonitor(data.monitor);
            setLogs(data.logs || []);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Network error fetching monitor details");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  function formatTime(isoString: string): string {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);
  }

  function renderStateBadge(state: string) {
    switch (state) {
      case "available":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
            AVAILABLE
          </span>
        );
      case "unavailable":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
            Unavailable
          </span>
        );
      case "blocked":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
            Blocked
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
            {state}
          </span>
        );
    }
  }

  return (
    <div className="space-y-6">
      {/* Navigation header */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          &larr; Back to Dashboard
        </Link>
        <button
          onClick={loadData}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
        >
          {loading ? "Refreshing..." : "↻ Refresh Logs"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {monitor && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {monitor.name}
              </h2>
              <a
                href={monitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline break-all"
              >
                {monitor.url} ↗
              </a>
            </div>
            <div className="flex items-center gap-2">
              {renderStateBadge(monitor.last_state)}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div>
              <span className="text-slate-500 block">Frequency:</span>
              <span className="font-semibold text-slate-800">
                Every {monitor.interval_seconds / 60} min
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Mode:</span>
              <span className="font-semibold text-slate-800 capitalize">
                {monitor.mode}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Status:</span>
              <span className="font-semibold text-slate-800 capitalize">
                {monitor.status}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Consecutive Failures:</span>
              <span className="font-semibold text-slate-800">
                {monitor.consecutive_failures}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Check Logs Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-bold text-slate-900">
            Check History (Last 50 Runs)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Times displayed in Indian Standard Time (IST - Asia/Kolkata)
          </p>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No check logs recorded yet for this monitor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4 font-semibold">Timestamp (IST)</th>
                  <th className="py-2.5 px-4 font-semibold">State</th>
                  <th className="py-2.5 px-4 font-semibold">HTTP Status</th>
                  <th className="py-2.5 px-4 font-semibold">Latency</th>
                  <th className="py-2.5 px-4 font-semibold">Observation / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                      {formatTime(log.checked_at)}
                    </td>
                    <td className="py-2.5 px-4">
                      {renderStateBadge(log.state)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px]">
                      {log.http_status ? (
                        <span
                          className={`font-semibold ${
                            log.http_status === 200
                              ? "text-emerald-700"
                              : "text-rose-600"
                          }`}
                        >
                          {log.http_status}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                      {log.latency_ms !== null ? `${log.latency_ms} ms` : "-"}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                      {log.note || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MonitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-xs text-slate-400">
          Loading monitor details...
        </div>
      }
    >
      <MonitorDetailContent params={params} />
    </Suspense>
  );
}
