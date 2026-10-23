import { getDb } from "@/lib/db";

export default async function DemoTicketsPage() {
  let isAvailable = false;

  try {
    const db = getDb();
    const { data } = await db
      .from("demo_state")
      .select("available")
      .eq("id", 1)
      .maybeSingle();

    isAvailable = data?.available ?? false;
  } catch {
    // Fallback if database credentials are not yet initialized
    isAvailable = false;
  }

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-xl mx-auto rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
        {/* Event Header */}
        <div className="border-b border-slate-200 pb-4">
          <span className="inline-block rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 mb-2">
            Official Ticket Booking Portal
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Demo Concert 2026 World Tour
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Live at Grand Arena Stadium &bull; Gates open at 5:00 PM IST
          </p>
        </div>

        {/* Dynamic Availability State Display */}
        <div className="text-center py-6 px-4 rounded-xl border border-slate-100 bg-slate-50 space-y-3">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Current Booking Status
          </div>

          {isAvailable ? (
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-bold text-emerald-800">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
                Tickets Available
              </div>
              <p className="text-sm font-medium text-emerald-900">
                General Admission passes are currently unlocked for immediate booking.
              </p>
              <div>
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition-colors"
                >
                  Book Now - Tickets Available
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-4 py-1.5 text-sm font-bold text-rose-800">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                SOLD OUT
              </div>
              <p className="text-xs text-rose-900 font-medium">
                All ticket allocations are currently SOLD OUT. Please monitor this page for cancellations.
              </p>
            </div>
          )}
        </div>

        {/* Real Event Details to ensure rich HTML structure */}
        <div className="space-y-3 text-xs text-slate-600 border-t border-slate-100 pt-4">
          <h2 className="font-semibold text-slate-900 text-sm">Event &amp; Booking Guidelines</h2>
          <p>
            Welcome to the official ticketing portal for <strong>Demo Concert 2026</strong>. This page provides real-time ticket inventory updates for upcoming performances.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Strict limit of 4 passes per registered email address and government ID.</li>
            <li>Entry requires a verified digital pass with photo identification matching the booking name.</li>
            <li>Parking facilities are available on-site on a first-come, first-served basis.</li>
            <li>Food and beverages are available at licensed concourse stalls. Outside drinks and professional camera lenses are prohibited.</li>
          </ul>
        </div>

        {/* Interactive Notice */}
        <div className="rounded-lg bg-amber-50 p-3 text-[11px] text-amber-800 border border-amber-200">
          💡 <strong>Testing Mode Note:</strong> This is an interactive demo page built into your personal Ticket Alert Portal. You can flip this availability status instantly from your dashboard to verify email and Telegram notifications.
        </div>
      </div>
    </div>
  );
}
