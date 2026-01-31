import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  DateRangeFilter,
  getPreviousYearRange,
  type DateRange,
} from "@/components/DateRangeFilter";

describe("getPreviousYearRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Jan 1 – Dec 31 of the previous calendar year", () => {
    vi.setSystemTime(new Date(2026, 5, 15)); // June 15 2026 local
    const range = getPreviousYearRange();
    expect(range).toEqual({
      fromDate: "2025-01-01",
      toDate: "2025-12-31",
    });
  });

  it("works at the start of a year (Jan 1)", () => {
    vi.setSystemTime(new Date(2025, 0, 1)); // Jan 1 2025 local
    const range = getPreviousYearRange();
    expect(range).toEqual({
      fromDate: "2024-01-01",
      toDate: "2024-12-31",
    });
  });

  it("works at the end of a year (Dec 31)", () => {
    vi.setSystemTime(new Date(2025, 11, 31, 12, 0, 0)); // Dec 31 2025 noon local
    const range = getPreviousYearRange();
    expect(range).toEqual({
      fromDate: "2024-01-01",
      toDate: "2024-12-31",
    });
  });
});

describe("DateRangeFilter component", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15)); // June 15 2025 local
    onChange.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const defaultRange: DateRange = { fromDate: "2024-01-01", toDate: "2024-12-31" };

  it("renders the date range label", () => {
    render(
      <DateRangeFilter value={defaultRange} onChange={onChange} />,
    );
    expect(screen.getByText("Date Range")).toBeInTheDocument();
  });

  it("renders the preset selector with Previous Year selected by default when value matches", () => {
    render(
      <DateRangeFilter value={defaultRange} onChange={onChange} />,
    );
    const presetSelect = screen.getByLabelText("Date range preset");
    expect(presetSelect).toHaveValue("previous_year");
  });

  it("shows Custom Range when value does not match previous year", () => {
    render(
      <DateRangeFilter
        value={{ fromDate: "2023-03-01", toDate: "2023-06-30" }}
        onChange={onChange}
      />,
    );
    const presetSelect = screen.getByLabelText("Date range preset");
    expect(presetSelect).toHaveValue("custom");
  });

  it("renders start and end date inputs with correct values", () => {
    render(
      <DateRangeFilter value={defaultRange} onChange={onChange} />,
    );
    const startDate = screen.getByLabelText("Start date");
    const endDate = screen.getByLabelText("End date");
    expect(startDate).toHaveValue("2024-01-01");
    expect(endDate).toHaveValue("2024-12-31");
  });

  it("calls onChange with previous year range when preset is selected", () => {
    render(
      <DateRangeFilter
        value={{ fromDate: "2023-05-01", toDate: "2023-09-30" }}
        onChange={onChange}
      />,
    );
    const presetSelect = screen.getByLabelText("Date range preset");
    fireEvent.change(presetSelect, { target: { value: "previous_year" } });
    expect(onChange).toHaveBeenCalledWith({
      fromDate: "2024-01-01",
      toDate: "2024-12-31",
    });
  });

  it("calls onChange when start date is changed", () => {
    render(
      <DateRangeFilter value={defaultRange} onChange={onChange} />,
    );
    const startDate = screen.getByLabelText("Start date");
    fireEvent.change(startDate, { target: { value: "2024-03-15" } });
    expect(onChange).toHaveBeenCalledWith({
      fromDate: "2024-03-15",
      toDate: "2024-12-31",
    });
  });

  it("calls onChange when end date is changed", () => {
    render(
      <DateRangeFilter value={defaultRange} onChange={onChange} />,
    );
    const endDate = screen.getByLabelText("End date");
    fireEvent.change(endDate, { target: { value: "2024-06-30" } });
    expect(onChange).toHaveBeenCalledWith({
      fromDate: "2024-01-01",
      toDate: "2024-06-30",
    });
  });

  it("switches preset to custom when a date input is changed manually", () => {
    const { rerender } = render(
      <DateRangeFilter value={defaultRange} onChange={onChange} />,
    );
    expect(screen.getByLabelText("Date range preset")).toHaveValue("previous_year");

    const startDate = screen.getByLabelText("Start date");
    fireEvent.change(startDate, { target: { value: "2024-03-15" } });

    // After onChange fires, parent would update value — rerender with new value
    rerender(
      <DateRangeFilter
        value={{ fromDate: "2024-03-15", toDate: "2024-12-31" }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Date range preset")).toHaveValue("custom");
  });

  it("disables all inputs when disabled prop is true", () => {
    render(
      <DateRangeFilter value={defaultRange} onChange={onChange} disabled />,
    );
    expect(screen.getByLabelText("Date range preset")).toBeDisabled();
    expect(screen.getByLabelText("Start date")).toBeDisabled();
    expect(screen.getByLabelText("End date")).toBeDisabled();
  });

  it("renders the 'to' separator text", () => {
    const { container } = render(
      <DateRangeFilter value={defaultRange} onChange={onChange} />,
    );
    const separator = container.querySelector("span");
    expect(separator).toHaveTextContent("to");
  });

  it("displays the previous year label with the correct year", () => {
    render(
      <DateRangeFilter value={defaultRange} onChange={onChange} />,
    );
    expect(screen.getByText("Previous Year (2024)")).toBeInTheDocument();
  });
});
