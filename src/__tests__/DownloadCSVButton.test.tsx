import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadCSVButton } from "@/components/DownloadCSVButton";
import type { Transaction } from "@/types";
import * as csvModule from "@/lib/csv";

afterEach(cleanup);

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
    txHash: "0xabc123def456",
    notes: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DownloadCSVButton", () => {
  let downloadCSVSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    downloadCSVSpy = vi.spyOn(csvModule, "downloadCSV").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a button with text 'Download CSV'", () => {
    render(
      <DownloadCSVButton
        transactions={[makeTx()]}
        chainId="bittensor"
        address="5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"
      />,
    );
    expect(
      screen.getByRole("button", { name: /download csv/i }),
    ).toBeInTheDocument();
  });

  it("is disabled when there are no transactions", () => {
    render(
      <DownloadCSVButton
        transactions={[]}
        chainId="bittensor"
        address="5FHneW46"
      />,
    );
    expect(screen.getByRole("button", { name: /download csv/i })).toBeDisabled();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <DownloadCSVButton
        transactions={[makeTx()]}
        chainId="bittensor"
        address="5FHneW46"
        disabled
      />,
    );
    expect(screen.getByRole("button", { name: /download csv/i })).toBeDisabled();
  });

  it("is enabled when there are transactions and disabled is false", () => {
    render(
      <DownloadCSVButton
        transactions={[makeTx()]}
        chainId="bittensor"
        address="5FHneW46"
      />,
    );
    expect(
      screen.getByRole("button", { name: /download csv/i }),
    ).not.toBeDisabled();
  });

  it("generates and downloads CSV when clicked", async () => {
    const user = userEvent.setup();
    const txs = [
      makeTx({ sentQuantity: 10, sentCurrency: "TAO" }),
      makeTx({
        type: "receive",
        sentQuantity: undefined,
        sentCurrency: undefined,
        receivedQuantity: 5,
        receivedCurrency: "TAO",
      }),
    ];

    render(
      <DownloadCSVButton
        transactions={txs}
        chainId="bittensor"
        address="5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"
      />,
    );

    await user.click(screen.getByRole("button", { name: /download csv/i }));

    expect(downloadCSVSpy).toHaveBeenCalledOnce();

    // Verify the CSV content is a valid Awaken standard CSV
    const csvContent = downloadCSVSpy.mock.calls[0][0] as string;
    expect(csvContent).toContain(
      "Date,Received Quantity,Received Currency,Received Fiat Amount,Sent Quantity,Sent Currency,Sent Fiat Amount,Fee Amount,Fee Currency,Transaction Hash,Notes,Tag",
    );

    // Verify the filename follows the convention
    const filename = downloadCSVSpy.mock.calls[0][1] as string;
    expect(filename).toMatch(/^awakenfetch_bittensor_5FHneW46_\d{8}\.csv$/);
  });

  it("uses filtered transactions (only those passed in) for CSV content", async () => {
    const user = userEvent.setup();
    const singleTx = [makeTx({ sentQuantity: 42, sentCurrency: "KAS" })];

    render(
      <DownloadCSVButton
        transactions={singleTx}
        chainId="kaspa"
        address="kaspa:abc123defg"
      />,
    );

    await user.click(screen.getByRole("button", { name: /download csv/i }));

    const csvContent = downloadCSVSpy.mock.calls[0][0] as string;
    const lines = csvContent.split("\n");
    // Header + 1 data row
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("42");
    expect(lines[1]).toContain("KAS");
  });

  it("does not call downloadCSV when clicked while disabled", async () => {
    const user = userEvent.setup();
    render(
      <DownloadCSVButton
        transactions={[]}
        chainId="bittensor"
        address="5FHneW46"
      />,
    );

    await user.click(screen.getByRole("button", { name: /download csv/i }));
    expect(downloadCSVSpy).not.toHaveBeenCalled();
  });

  it("has cursor-pointer class on the button", () => {
    render(
      <DownloadCSVButton
        transactions={[makeTx()]}
        chainId="bittensor"
        address="5FHneW46"
      />,
    );
    const button = screen.getByRole("button", { name: /download csv/i });
    expect(button.className).toContain("cursor-pointer");
  });
});
