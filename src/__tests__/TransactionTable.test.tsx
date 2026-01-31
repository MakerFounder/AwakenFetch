import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionTable } from "@/components/TransactionTable";
import type { Transaction } from "@/types";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    date: new Date("2025-03-15T14:30:00Z"),
    type: "send",
    sentQuantity: 1.5,
    sentCurrency: "TAO",
    receivedQuantity: undefined,
    receivedCurrency: undefined,
    feeAmount: 0.0001,
    feeCurrency: "TAO",
    txHash: "0xabc123def456abc123def456abc123def456",
    notes: "Transfer to exchange",
    ...overrides,
  };
}

const sampleTransactions: Transaction[] = [
  makeTx({
    date: new Date("2025-01-10T08:00:00Z"),
    type: "send",
    sentQuantity: 10,
    sentCurrency: "TAO",
    txHash: "0xhash_send_1",
    notes: "Sent to Alice",
  }),
  makeTx({
    date: new Date("2025-02-15T12:30:00Z"),
    type: "receive",
    sentQuantity: undefined,
    sentCurrency: undefined,
    receivedQuantity: 5.123456,
    receivedCurrency: "TAO",
    txHash: "0xhash_receive_1",
    notes: "From staking",
  }),
  makeTx({
    date: new Date("2025-03-20T18:45:00Z"),
    type: "stake",
    sentQuantity: 20,
    sentCurrency: "TAO",
    txHash: "0xhash_stake_1",
    notes: "Delegate to validator",
  }),
  makeTx({
    date: new Date("2025-04-05T06:15:00Z"),
    type: "claim",
    receivedQuantity: 2.5,
    receivedCurrency: "TAO",
    sentQuantity: undefined,
    sentCurrency: undefined,
    feeAmount: 0.00005,
    txHash: "0xhash_claim_1",
    notes: "",
  }),
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("TransactionTable — rendering", () => {
  it("renders nothing when transactions array is empty", () => {
    const { container } = render(
      <TransactionTable transactions={[]} chainId="bittensor" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders all column headers", () => {
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );

    const table = screen.getByRole("table");
    const headerRow = within(table).getAllByRole("columnheader");

    const expectedHeaders = [
      "Date (UTC)",
      "Type",
      "Sent Qty",
      "Sent Currency",
      "Received Qty",
      "Received Currency",
      "Fee",
      "Fee Currency",
      "Tx Hash",
      "Notes",
    ];

    expect(headerRow).toHaveLength(expectedHeaders.length);
    expectedHeaders.forEach((header, i) => {
      expect(headerRow[i]).toHaveTextContent(header);
    });
  });

  it("formats dates as MM/DD/YYYY HH:MM:SS in UTC", () => {
    render(
      <TransactionTable
        transactions={[
          makeTx({ date: new Date("2025-06-01T09:05:03Z"), txHash: "0xunique_date" }),
        ]}
        chainId="bittensor"
      />,
    );
    expect(screen.getByText("06/01/2025 09:05:03")).toBeInTheDocument();
  });

  it("displays transaction type badges in table rows", () => {
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // Skip header row, check data rows contain type badges
    const dataRows = rows.slice(1);
    const types = dataRows.map(
      (row) => within(row).getAllByRole("cell")[1].textContent,
    );
    expect(types).toContain("send");
    expect(types).toContain("receive");
    expect(types).toContain("stake");
    expect(types).toContain("claim");
  });

  it("formats quantities with up to 8 decimal places", () => {
    render(
      <TransactionTable
        transactions={[
          makeTx({
            receivedQuantity: 1.123456789,
            receivedCurrency: "TAO",
            txHash: "0xunique_qty",
          }),
        ]}
        chainId="bittensor"
      />,
    );
    // 1.123456789 → 1.12345679 (rounded to 8dp)
    expect(screen.getByText("1.12345679")).toBeInTheDocument();
  });

  it("hyperlinks tx hashes to the correct explorer URL for bittensor", () => {
    render(
      <TransactionTable
        transactions={[makeTx({ txHash: "0xmyhash123" })]}
        chainId="bittensor"
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://taostats.io/extrinsic/0xmyhash123",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hyperlinks tx hashes to the correct explorer URL for kaspa", () => {
    render(
      <TransactionTable
        transactions={[makeTx({ txHash: "abc123" })]}
        chainId="kaspa"
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://explorer.kaspa.org/txs/abc123",
    );
  });

  it("hyperlinks tx hashes to the correct explorer URL for injective", () => {
    render(
      <TransactionTable
        transactions={[makeTx({ txHash: "DEADBEEF" })]}
        chainId="injective"
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://explorer.injective.network/transaction/DEADBEEF",
    );
  });

  it("shows total transaction count", () => {
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );
    expect(screen.getByText(/4 of 4 transactions/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe("TransactionTable — sorting", () => {
  it("defaults to descending date sort (newest first)", () => {
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );

    const rows = screen.getAllByRole("row");
    // First data row (rows[0] is header) should be newest: 04/05/2025
    const firstDataRow = rows[1];
    expect(within(firstDataRow).getByText("04/05/2025 06:15:00")).toBeInTheDocument();
  });

  it("toggles to ascending sort when clicking Date header", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );

    const dateHeader = screen.getByText("Date (UTC)");
    await user.click(dateHeader);

    const rows = screen.getAllByRole("row");
    // After toggle to ascending, oldest first: 01/10/2025
    const firstDataRow = rows[1];
    expect(within(firstDataRow).getByText("01/10/2025 08:00:00")).toBeInTheDocument();
  });

  it("sorts by Type column", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );

    const table = screen.getByRole("table");
    const typeHeader = within(table).getAllByRole("columnheader")[1];
    // Click once for ascending
    await user.click(typeHeader);

    const rows = within(table).getAllByRole("row");
    const firstDataRow = rows[1];
    // Alphabetically first: "claim"
    expect(within(firstDataRow).getAllByRole("cell")[1]).toHaveTextContent("claim");
  });

  it("shows aria-sort attribute on sorted column", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );

    const dateHeader = screen.getByText("Date (UTC)").closest("th")!;
    expect(dateHeader).toHaveAttribute("aria-sort", "descending");

    await user.click(dateHeader);
    expect(dateHeader).toHaveAttribute("aria-sort", "ascending");
  });
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe("TransactionTable — filtering", () => {
  it("displays only pre-filtered transactions passed as props", () => {
    // Type filtering is now done at Dashboard level via TransactionTypeFilter.
    // TransactionTable receives already-filtered transactions as props.
    const stakeTxs = sampleTransactions.filter((tx) => tx.type === "stake");
    render(
      <TransactionTable transactions={stakeTxs} chainId="bittensor" />,
    );

    const table = screen.getByRole("table");
    const dataRows = within(table).getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(1);
    expect(within(dataRows[0]).getAllByRole("cell")[1]).toHaveTextContent("stake");
  });

  it("filters by search query (currency)", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );

    const searchInput = screen.getByLabelText("Search");
    await user.type(searchInput, "staking");

    // Should match "From staking" in notes
    expect(screen.getByText(/1 of 4/)).toBeInTheDocument();
  });

  it("shows empty state when filters match nothing", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );

    const searchInput = screen.getByLabelText("Search");
    await user.type(searchInput, "zzzznonexistent");

    expect(
      screen.getByText("No transactions match the current filters."),
    ).toBeInTheDocument();
    expect(screen.getByText(/0 of 4/)).toBeInTheDocument();
  });

  it("resets to page 1 when search filter changes", async () => {
    // Create enough transactions to have multiple pages
    const manyTxs = Array.from({ length: 120 }, (_, i) =>
      makeTx({
        date: new Date(`2025-01-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`),
        txHash: `0xhash_reset_${i}`,
        type: i < 60 ? "send" : "receive",
        sentCurrency: i < 60 ? "ALPHA" : "BETA",
        feeCurrency: i < 60 ? "ALPHA" : "BETA",
      }),
    );

    const user = userEvent.setup();
    render(
      <TransactionTable transactions={manyTxs} chainId="bittensor" />,
    );

    // Go to page 2
    const nextBtn = screen.getByLabelText("Next page");
    await user.click(nextBtn);
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    // Apply search filter — should reset to page 1 (60 ALPHA txs = 2 pages)
    const searchInput = screen.getByLabelText("Search");
    await user.type(searchInput, "ALPHA");
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("TransactionTable — pagination", () => {
  const manyTxs = Array.from({ length: 120 }, (_, i) =>
    makeTx({
      date: new Date(2025, 0, 1 + (i % 28), i % 24),
      txHash: `0xpag_hash_${i}`,
      notes: `Transaction ${i}`,
    }),
  );

  it("shows 50 rows per page", () => {
    render(
      <TransactionTable transactions={manyTxs} chainId="bittensor" />,
    );

    // +1 for header row
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(51); // 50 data + 1 header
  });

  it("displays correct page count", () => {
    render(
      <TransactionTable transactions={manyTxs} chainId="bittensor" />,
    );
    // 120 txs / 50 per page = 3 pages
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("navigates to next page", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={manyTxs} chainId="bittensor" />,
    );

    await user.click(screen.getByLabelText("Next page"));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("navigates to last page", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={manyTxs} chainId="bittensor" />,
    );

    await user.click(screen.getByLabelText("Last page"));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

    // Last page should have 20 rows (120 - 2*50)
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(21); // 20 data + 1 header
  });

  it("disables Previous/First buttons on first page", () => {
    render(
      <TransactionTable transactions={manyTxs} chainId="bittensor" />,
    );

    expect(screen.getByLabelText("First page")).toBeDisabled();
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).not.toBeDisabled();
    expect(screen.getByLabelText("Last page")).not.toBeDisabled();
  });

  it("disables Next/Last buttons on last page", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={manyTxs} chainId="bittensor" />,
    );

    await user.click(screen.getByLabelText("Last page"));

    expect(screen.getByLabelText("First page")).not.toBeDisabled();
    expect(screen.getByLabelText("Previous page")).not.toBeDisabled();
    expect(screen.getByLabelText("Next page")).toBeDisabled();
    expect(screen.getByLabelText("Last page")).toBeDisabled();
  });

  it("hides pagination when transactions fit in one page", () => {
    render(
      <TransactionTable transactions={sampleTransactions} chainId="bittensor" />,
    );

    expect(screen.queryByLabelText("Next page")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Explorer URL tests
// ---------------------------------------------------------------------------

describe("TransactionTable — explorerUrls", () => {
  it("renders tx hash as plain text for unknown chains", () => {
    render(
      <TransactionTable
        transactions={[makeTx({ txHash: "0xsomehash" })]}
        chainId="unknownchain"
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    // Hash should still be visible as text
    expect(screen.getByText(/0xsomeh/)).toBeInTheDocument();
  });

  it("handles transactions without a tx hash", () => {
    render(
      <TransactionTable
        transactions={[makeTx({ txHash: undefined })]}
        chainId="bittensor"
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Ambiguous transaction highlighting & reclassification
// ---------------------------------------------------------------------------

describe("TransactionTable — ambiguous transactions", () => {
  const txsWithOther: Transaction[] = [
    makeTx({
      date: new Date("2025-01-10T08:00:00Z"),
      type: "send",
      txHash: "0xhash_send_1",
    }),
    makeTx({
      date: new Date("2025-02-15T12:30:00Z"),
      type: "other",
      txHash: "0xhash_other_1",
      notes: "Unknown interaction",
    }),
    makeTx({
      date: new Date("2025-03-20T18:45:00Z"),
      type: "other",
      txHash: "0xhash_other_2",
      notes: "Another unknown",
    }),
    makeTx({
      date: new Date("2025-04-05T06:15:00Z"),
      type: "receive",
      txHash: "0xhash_receive_1",
    }),
  ];

  it("highlights 'other' type rows with a yellow background", () => {
    render(
      <TransactionTable transactions={txsWithOther} chainId="bittensor" />,
    );

    const rows = screen.getAllByRole("row").slice(1); // skip header
    // Rows are sorted desc by date, so order: receive(Apr), other(Mar), other(Feb), send(Jan)
    const otherRows = rows.filter(
      (row) => row.getAttribute("data-needs-review") === "true",
    );
    expect(otherRows).toHaveLength(2);

    // Verify yellow background class is applied
    otherRows.forEach((row) => {
      expect(row.className).toContain("bg-yellow-50");
    });

    // Non-other rows should NOT have the yellow background
    const normalRows = rows.filter(
      (row) => !row.hasAttribute("data-needs-review"),
    );
    normalRows.forEach((row) => {
      expect(row.className).not.toContain("bg-yellow-50");
    });
  });

  it("renders an editable dropdown for 'other' type rows when onTypeChange is provided", () => {
    const onTypeChange = vi.fn();
    render(
      <TransactionTable
        transactions={txsWithOther}
        chainId="bittensor"
        onTypeChange={onTypeChange}
      />,
    );

    // There should be 2 select dropdowns (for the 2 "other" rows)
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);

    // Each select should have "Other" as the current value
    selects.forEach((select) => {
      expect((select as HTMLSelectElement).value).toBe("other");
    });
  });

  it("does NOT render an editable dropdown for non-'other' rows", () => {
    const onTypeChange = vi.fn();
    render(
      <TransactionTable
        transactions={[makeTx({ type: "send", txHash: "0xsend_only" })]}
        chainId="bittensor"
        onTypeChange={onTypeChange}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("send")).toBeInTheDocument();
  });

  it("does NOT render dropdown for 'other' rows when onTypeChange is not provided", () => {
    render(
      <TransactionTable transactions={txsWithOther} chainId="bittensor" />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // Type should be shown as plain text badge
    const otherBadges = screen.getAllByText("other");
    expect(otherBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onTypeChange with correct arguments when dropdown is changed", async () => {
    const user = userEvent.setup();
    const onTypeChange = vi.fn();
    render(
      <TransactionTable
        transactions={txsWithOther}
        chainId="bittensor"
        onTypeChange={onTypeChange}
      />,
    );

    const selects = screen.getAllByRole("combobox");
    // Change the first "other" dropdown to "trade"
    await user.selectOptions(selects[0], "trade");

    expect(onTypeChange).toHaveBeenCalledTimes(1);
    // The callback receives (txHash, globalIndex, newType)
    expect(onTypeChange).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      "trade",
    );
  });

  it("dropdown contains all transaction type options", () => {
    const onTypeChange = vi.fn();
    render(
      <TransactionTable
        transactions={[makeTx({ type: "other", txHash: "0xother_opts" })]}
        chainId="bittensor"
        onTypeChange={onTypeChange}
      />,
    );

    const select = screen.getByRole("combobox");
    const options = within(select).getAllByRole("option");

    const expectedLabels = [
      "Send", "Receive", "Trade", "LP Add", "LP Remove",
      "Stake", "Unstake", "Claim", "Bridge", "Approval", "Other",
    ];
    expect(options).toHaveLength(expectedLabels.length);
    expectedLabels.forEach((label, i) => {
      expect(options[i]).toHaveTextContent(label);
    });
  });

  it("dropdown has accessible label for each row", () => {
    const onTypeChange = vi.fn();
    render(
      <TransactionTable
        transactions={[makeTx({ type: "other", txHash: "0xother_a11y" })]}
        chainId="bittensor"
        onTypeChange={onTypeChange}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("aria-label", expect.stringContaining("Reclassify"));
  });
});
