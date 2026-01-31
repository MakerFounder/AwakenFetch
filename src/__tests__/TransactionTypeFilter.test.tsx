import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TransactionTypeFilter,
  getAvailableTypes,
  filterByType,
} from "@/components/TransactionTypeFilter";
import type { TransactionType } from "@/types";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Unit tests for helper functions
// ---------------------------------------------------------------------------

describe("getAvailableTypes", () => {
  it("returns unique types in canonical order", () => {
    const txs = [
      { type: "trade" as TransactionType },
      { type: "send" as TransactionType },
      { type: "trade" as TransactionType },
      { type: "receive" as TransactionType },
    ];
    expect(getAvailableTypes(txs)).toEqual(["send", "receive", "trade"]);
  });

  it("returns empty array for empty input", () => {
    expect(getAvailableTypes([])).toEqual([]);
  });

  it("preserves canonical order regardless of input order", () => {
    const txs = [
      { type: "other" as TransactionType },
      { type: "approval" as TransactionType },
      { type: "send" as TransactionType },
    ];
    expect(getAvailableTypes(txs)).toEqual(["send", "approval", "other"]);
  });
});

describe("filterByType", () => {
  const txs = [
    { type: "send" as TransactionType, id: 1 },
    { type: "receive" as TransactionType, id: 2 },
    { type: "trade" as TransactionType, id: 3 },
    { type: "send" as TransactionType, id: 4 },
    { type: "other" as TransactionType, id: 5 },
  ];

  it("returns all transactions when filter is empty string", () => {
    expect(filterByType(txs, "")).toEqual(txs);
  });

  it("filters by specific type", () => {
    const result = filterByType(txs, "send");
    expect(result).toHaveLength(2);
    expect(result.every((tx) => tx.type === "send")).toBe(true);
  });

  it("returns empty array when no transactions match", () => {
    expect(filterByType(txs, "bridge")).toEqual([]);
  });

  it("handles empty transaction array", () => {
    expect(filterByType([], "send")).toEqual([]);
  });

  it('filters to "other" type when needs_review is selected', () => {
    const result = filterByType(txs, "needs_review");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("other");
    expect(result[0].id).toBe(5);
  });

  it("returns empty array for needs_review when no other types exist", () => {
    const noOther = txs.filter((tx) => tx.type !== "other");
    expect(filterByType(noOther, "needs_review")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe("TransactionTypeFilter", () => {
  const defaultProps = {
    value: "" as TransactionType | "",
    onChange: vi.fn(),
    availableTypes: ["send", "receive", "trade"] as TransactionType[],
  };

  it("renders a labeled select element", () => {
    render(<TransactionTypeFilter {...defaultProps} />);
    expect(screen.getByLabelText("Filter by transaction type")).toBeInTheDocument();
    expect(screen.getByText("Transaction Type")).toBeInTheDocument();
  });

  it('shows "All types" as the default option', () => {
    render(<TransactionTypeFilter {...defaultProps} />);
    const select = screen.getByLabelText("Filter by transaction type") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText("All types")).toBeInTheDocument();
  });

  it("renders human-readable labels for available types", () => {
    render(<TransactionTypeFilter {...defaultProps} />);
    expect(screen.getByText("Send")).toBeInTheDocument();
    expect(screen.getByText("Receive")).toBeInTheDocument();
    expect(screen.getByText("Trade")).toBeInTheDocument();
  });

  it("does not render types that are not available", () => {
    render(<TransactionTypeFilter {...defaultProps} />);
    expect(screen.queryByText("Bridge")).not.toBeInTheDocument();
    expect(screen.queryByText("Stake")).not.toBeInTheDocument();
  });

  it("calls onChange when a type is selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TransactionTypeFilter {...defaultProps} onChange={onChange} />);

    const select = screen.getByLabelText("Filter by transaction type");
    await user.selectOptions(select, "send");

    expect(onChange).toHaveBeenCalledWith("send");
  });

  it("calls onChange with empty string when All types is selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TransactionTypeFilter {...defaultProps} value="send" onChange={onChange} />,
    );

    const select = screen.getByLabelText("Filter by transaction type");
    await user.selectOptions(select, "");

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("is disabled when disabled prop is true", () => {
    render(<TransactionTypeFilter {...defaultProps} disabled />);
    const select = screen.getByLabelText("Filter by transaction type") as HTMLSelectElement;
    expect(select).toBeDisabled();
  });

  it("is disabled when no types are available", () => {
    render(<TransactionTypeFilter {...defaultProps} availableTypes={[]} />);
    const select = screen.getByLabelText("Filter by transaction type") as HTMLSelectElement;
    expect(select).toBeDisabled();
  });

  it("shows human-readable labels for all type variants", () => {
    const allTypes: TransactionType[] = [
      "send",
      "receive",
      "trade",
      "lp_add",
      "lp_remove",
      "stake",
      "unstake",
      "claim",
      "bridge",
      "approval",
      "other",
    ];
    render(
      <TransactionTypeFilter
        {...defaultProps}
        availableTypes={allTypes}
      />,
    );
    expect(screen.getByText("LP Add")).toBeInTheDocument();
    expect(screen.getByText("LP Remove")).toBeInTheDocument();
    expect(screen.getByText("Stake")).toBeInTheDocument();
    expect(screen.getByText("Unstake")).toBeInTheDocument();
    expect(screen.getByText("Claim")).toBeInTheDocument();
    expect(screen.getByText("Bridge")).toBeInTheDocument();
    expect(screen.getByText("Approval")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Needs Review filter option
// ---------------------------------------------------------------------------

describe("TransactionTypeFilter — Needs Review", () => {
  it('shows "Needs Review" option when "other" type is available', () => {
    render(
      <TransactionTypeFilter
        value=""
        onChange={vi.fn()}
        availableTypes={["send", "other"]}
      />,
    );
    expect(screen.getByText("⚠ Needs Review")).toBeInTheDocument();
  });

  it('does NOT show "Needs Review" option when "other" type is not available', () => {
    render(
      <TransactionTypeFilter
        value=""
        onChange={vi.fn()}
        availableTypes={["send", "receive"]}
      />,
    );
    expect(screen.queryByText("⚠ Needs Review")).not.toBeInTheDocument();
  });

  it('calls onChange with "needs_review" when Needs Review is selected', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TransactionTypeFilter
        value=""
        onChange={onChange}
        availableTypes={["send", "other"]}
      />,
    );

    const select = screen.getByLabelText("Filter by transaction type");
    await user.selectOptions(select, "needs_review");

    expect(onChange).toHaveBeenCalledWith("needs_review");
  });

  it('displays "Needs Review" as selected when value is "needs_review"', () => {
    render(
      <TransactionTypeFilter
        value="needs_review"
        onChange={vi.fn()}
        availableTypes={["send", "other"]}
      />,
    );

    const select = screen.getByLabelText("Filter by transaction type") as HTMLSelectElement;
    expect(select.value).toBe("needs_review");
  });
});
