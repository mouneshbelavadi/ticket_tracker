"use client";

import { useState } from "react";
import { Monitor, MonitorMode, CheckInterval } from "@/lib/types";

interface MonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  monitorToEdit?: Monitor | null;
  notifyEmail: string;
}

function getInitialISTDate(releaseAtUTC?: string | null): string {
  if (!releaseAtUTC) return "";
  const date = new Date(releaseAtUTC);
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  return istDate.toISOString().slice(0, 16);
}

function MonitorModalContent({
  onClose,
  onSaved,
  monitorToEdit,
  notifyEmail,
}: Omit<MonitorModalProps, "isOpen">) {
  const [name, setName] = useState(monitorToEdit?.name || "");
  const [url, setUrl] = useState(monitorToEdit?.url || "");
  const [intervalSeconds, setIntervalSeconds] = useState<CheckInterval>(
    monitorToEdit?.interval_seconds || 60
  );
  const [mode, setMode] = useState<MonitorMode>(monitorToEdit?.mode || "disappears");
  const [keyword, setKeyword] = useState(monitorToEdit?.keyword || "");
  const [sanityKeyword, setSanityKeyword] = useState(monitorToEdit?.sanity_keyword || "");
  const [cssSelector, setCssSelector] = useState(monitorToEdit?.css_selector || "");
  const [releaseAtIST, setReleaseAtIST] = useState(getInitialISTDate(monitorToEdit?.release_at));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      let releaseAtUTC: string | null = null;
      if (releaseAtIST.trim()) {
        const [datePart, timePart] = releaseAtIST.split("T");
        const istIsoString = `${datePart}T${timePart}:00+05:30`;
        const parsed = new Date(istIsoString);
        if (!isNaN(parsed.getTime())) {
          releaseAtUTC = parsed.toISOString();
        }
      }

      const payload = {
        name: name.trim(),
        url: url.trim(),
        interval_seconds: Number(intervalSeconds),
        mode,
        keyword: keyword.trim() || null,
        sanity_keyword: sanityKeyword.trim() || null,
        css_selector: cssSelector.trim() || null,
        release_at: releaseAtUTC,
      };

      const endpoint = monitorToEdit
        ? `/api/monitors/${monitorToEdit.id}`
        : `/api/monitors`;

      const method = monitorToEdit ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save monitor configuration.");
      } else {
        onSaved();
        onClose();
      }
    } catch {
      setError("An unexpected network error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl my-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            {monitorToEdit ? "Edit Monitor" : "Add New Ticket Monitor"}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 p-3 text-xs font-medium text-rose-700 border border-rose-200">
            {error}
          </div>
        )}

        {/* Read-only notification email banner */}
        <div className="mb-4 rounded-lg bg-indigo-50/70 p-3 text-xs text-indigo-900 border border-indigo-100 flex items-center gap-2">
          <span className="text-sm">📧</span>
          <span>
            Alerts will be delivered strictly to:{" "}
            <strong>{notifyEmail || "configured NOTIFY_EMAIL"}</strong>
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Event Name */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Event Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Coldplay Music of the Spheres Mumbai"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Ticket Page URL */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Ticket Page URL <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://in.bookmyshow.com/events/..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Validated against SSRF rules. Must be a public website.
            </p>
          </div>

          {/* Check Frequency Radios */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Check Frequency
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { sec: 60, label: "1 Minute", note: "High urgency" },
                { sec: 180, label: "3 Minutes", note: "Standard" },
                { sec: 300, label: "5 Minutes", note: "Relaxed" },
              ].map((item) => (
                <label
                  key={item.sec}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    intervalSeconds === item.sec
                      ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 font-semibold"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="interval"
                    value={item.sec}
                    checked={intervalSeconds === item.sec}
                    onChange={() => setIntervalSeconds(item.sec as CheckInterval)}
                    className="sr-only"
                  />
                  <span>{item.label}</span>
                  <span className="text-[10px] text-slate-400">{item.note}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Detection Mode Radios */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Detection Mode
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  mode === "disappears"
                    ? "border-indigo-600 bg-indigo-50/50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="disappears"
                  checked={mode === "disappears"}
                  onChange={() => setMode("disappears")}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Alert when this text disappears{" "}
                    <span className="text-emerald-600 font-normal">
                      (Recommended, most reliable)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    e.g. &quot;Sold Out&quot; or &quot;Currently Unavailable&quot;. Alerts when tickets become unlocked.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  mode === "appears"
                    ? "border-indigo-600 bg-indigo-50/50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="appears"
                  checked={mode === "appears"}
                  onChange={() => setMode("appears")}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Alert when this text appears
                  </div>
                  <div className="text-[11px] text-slate-500">
                    e.g. &quot;Book Now&quot; or &quot;Select Seats&quot;. Alerts when new action button shows up.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  mode === "changes"
                    ? "border-indigo-600 bg-indigo-50/50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="changes"
                  checked={mode === "changes"}
                  onChange={() => setMode("changes")}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Alert when the page changes
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Computes SHA-256 hash. Alerts when content differs from baseline.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Keyword Field */}
          {mode !== "changes" && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Target Keyword(s) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={
                  mode === "disappears"
                    ? "Sold Out | Allocation Exhausted"
                    : "Book Now | Buy Tickets"
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Case-insensitive. Separate multiple variations using vertical bar (
                <code>|</code>).
              </p>
            </div>
          )}

          {/* Sanity Keyword (for disappears mode) */}
          {mode === "disappears" && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Page Check Keyword{" "}
                <span className="text-slate-400 font-normal">(Optional but recommended)</span>
              </label>
              <input
                type="text"
                value={sanityKeyword}
                onChange={(e) => setSanityKeyword(e.target.value)}
                placeholder="e.g. Coldplay or Venue Name"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Text that must be on the page for a read to count as valid. Prevents false alerts if the site errors or shows 404.
              </p>
            </div>
          )}

          {/* CSS Selector (for changes mode) */}
          {mode === "changes" && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                CSS Selector <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={cssSelector}
                onChange={(e) => setCssSelector(e.target.value)}
                placeholder="e.g. #ticket-pricing-table or .booking-section"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Focus SHA-256 comparison on a specific DOM container instead of entire page.
              </p>
            </div>
          )}

          {/* Release Date/Time in IST */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Expected Release Time{" "}
              <span className="text-slate-400 font-normal">(IST - Asia/Kolkata, Optional)</span>
            </label>
            <input
              type="datetime-local"
              value={releaseAtIST}
              onChange={(e) => setReleaseAtIST(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Adaptive release mode tightens check interval to 60s around drop time (T-10m to T+30m).
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : monitorToEdit ? "Update Monitor" : "Create Monitor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MonitorModal(props: MonitorModalProps) {
  if (!props.isOpen) return null;
  return (
    <MonitorModalContent
      key={props.monitorToEdit?.id ?? "new"}
      onClose={props.onClose}
      onSaved={props.onSaved}
      monitorToEdit={props.monitorToEdit}
      notifyEmail={props.notifyEmail}
    />
  );
}
