"use client";

/**
 * TransactionTableSkeleton — animated skeleton placeholder that mimics
 * the TransactionTable layout while transactions are being fetched.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKELETON_ROWS = 8;

const COLUMN_DEFS = [
  { label: "Date (UTC)", width: "w-32" },
  { label: "Type", width: "w-16" },
  { label: "Sent Qty", width: "w-20" },
  { label: "Sent Currency", width: "w-20" },
  { label: "Received Qty", width: "w-20" },
  { label: "Received Currency", width: "w-24" },
  { label: "Fee", width: "w-16" },
  { label: "Fee Currency", width: "w-20" },
  { label: "Tx Hash", width: "w-28" },
  { label: "Notes", width: "w-24" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionTableSkeleton() {
  return (
    <div
      className="flex w-full flex-col gap-4"
      role="status"
      aria-label="Loading transactions"
    >
      {/* Skeleton filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-10 animate-pulse rounded bg-foreground/10" />
          <div className="h-7 w-52 animate-pulse rounded-md bg-foreground/10" />
        </div>
        <div className="ml-auto h-3 w-36 animate-pulse rounded bg-foreground/10" />
      </div>

      {/* Skeleton table */}
      <div className="overflow-x-auto rounded-lg border border-foreground/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-foreground/[0.03]">
              {COLUMN_DEFS.map((col) => (
                <th
                  key={col.label}
                  className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-foreground/70"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }, (_, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-foreground/5"
              >
                {COLUMN_DEFS.map((col) => (
                  <td key={col.label} className="px-3 py-2">
                    <div
                      className={`h-3.5 ${col.width} animate-pulse rounded bg-foreground/10`}
                      style={{
                        animationDelay: `${rowIdx * 50}ms`,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Skeleton pagination */}
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 animate-pulse rounded bg-foreground/10" />
        <div className="flex items-center gap-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="h-6 w-8 animate-pulse rounded-md bg-foreground/10"
            />
          ))}
        </div>
      </div>

      {/* Accessible hidden text for screen readers */}
      <span className="sr-only">Loading transactions, please wait…</span>
    </div>
  );
}
