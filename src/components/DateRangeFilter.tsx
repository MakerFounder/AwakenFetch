"use client";

/**
 * DateRangeFilter — date range selector with preset "Previous Year" default
 * and custom range support. Uses native HTML date inputs for simplicity.
 */

import { useState, useCallback, useMemo } from "react";

export interface DateRange {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
}

export type DatePreset = "previous_year" | "custom";

export interface DateRangeFilterProps {
  /** Current date range value. */
  value: DateRange;
  /** Called when the date range changes. */
  onChange: (range: DateRange) => void;
  /** Whether the filter is disabled (e.g. during fetch). */
  disabled?: boolean;
}

/** Return the previous calendar year date range. */
export function getPreviousYearRange(): DateRange {
  const lastYear = new Date().getFullYear() - 1;
  return {
    fromDate: `${lastYear}-01-01`,
    toDate: `${lastYear}-12-31`,
  };
}

/** Check if a range matches the previous year preset. */
function isPreviousYearRange(range: DateRange): boolean {
  const prev = getPreviousYearRange();
  return range.fromDate === prev.fromDate && range.toDate === prev.toDate;
}

export function DateRangeFilter({
  value,
  onChange,
  disabled = false,
}: DateRangeFilterProps) {
  const [preset, setPreset] = useState<DatePreset>(() =>
    isPreviousYearRange(value) ? "previous_year" : "custom",
  );

  const previousYearLabel = useMemo(() => {
    const lastYear = new Date().getFullYear() - 1;
    return `Previous Year (${lastYear})`;
  }, []);

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newPreset = e.target.value as DatePreset;
      setPreset(newPreset);
      if (newPreset === "previous_year") {
        onChange(getPreviousYearRange());
      }
    },
    [onChange],
  );

  const handleFromDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPreset("custom");
      onChange({ ...value, fromDate: e.target.value });
    },
    [onChange, value],
  );

  const handleToDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPreset("custom");
      onChange({ ...value, toDate: e.target.value });
    },
    [onChange, value],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground/80">
        Date Range
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={preset}
          onChange={handlePresetChange}
          disabled={disabled}
          aria-label="Date range preset"
          className="cursor-pointer rounded-lg border border-foreground/20 bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="previous_year">{previousYearLabel}</option>
          <option value="custom">Custom Range</option>
        </select>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.fromDate}
            onChange={handleFromDateChange}
            disabled={disabled}
            aria-label="Start date"
            className="cursor-pointer rounded-lg border border-foreground/20 bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="text-sm text-foreground/50">to</span>
          <input
            type="date"
            value={value.toDate}
            onChange={handleToDateChange}
            disabled={disabled}
            aria-label="End date"
            className="cursor-pointer rounded-lg border border-foreground/20 bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}
