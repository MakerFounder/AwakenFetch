import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadPerpsCSVButton } from "@/components/DownloadPerpsCSVButton";
import type { PerpTransaction } from "@/types";
import * as csvModule from "@/lib/csv";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePerpTx(overrides: Partial<PerpTransaction> = {}): PerpTransaction {
  return {
    date: new Date("2024-04-01T00:00:00Z"),
    asset: "BTC",
    amount: 2,
    fee: 0,
    pnl: 0,
    paymentToken: "USDC",
    txHash: "0xperp123",
    notes: "",
    tag: "open_position",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DownloadPerpsCSVButton", () => {
  let downloadCSVSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    downloadCSVSpy = vi
      .spyOn(csvModule, "downloadCSV")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a button with text 'Download Perps CSV'", () => {
    render(
      <DownloadPerpsCSVButton
        perpTransactions={[makePerpTx()]}
        chainId="injective"
        address="inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz"
      />,
    );
    expect(
      screen.getByRole("button", { name: /download perps csv/i }),
    ).toBeInTheDocument();
  });

  it("is disabled when there are no perp transactions", () => {
    render(
      <DownloadPerpsCSVButton
        perpTransactions={[]}
        chainId="injective"
        address="inj1qy09"
      />,
    );
    expect(
      screen.getByRole("button", { name: /download perps csv/i }),
    ).toBeDisabled();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <DownloadPerpsCSVButton
        perpTransactions={[makePerpTx()]}
        chainId="injective"
        address="inj1qy09"
        disabled
      />,
    );
    expect(
      screen.getByRole("button", { name: /download perps csv/i }),
    ).toBeDisabled();
  });

  it("is enabled when there are perp transactions and disabled is false", () => {
    render(
      <DownloadPerpsCSVButton
        perpTransactions={[makePerpTx()]}
        chainId="injective"
        address="inj1qy09"
      />,
    );
    expect(
      screen.getByRole("button", { name: /download perps csv/i }),
    ).not.toBeDisabled();
  });

  it("generates and downloads perps CSV when clicked", async () => {
    const user = userEvent.setup();
    const txs = [
      makePerpTx({ asset: "BTC", amount: 2, tag: "open_position" }),
      makePerpTx({
        asset: "BTC",
        amount: 1,
        pnl: 20,
        tag: "close_position",
        paymentToken: "USDC",
      }),
    ];

    render(
      <DownloadPerpsCSVButton
        perpTransactions={txs}
        chainId="injective"
        address="inj1qy09gsfx3gxqjahumq97elwxqf4qu5agdmqgnz"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /download perps csv/i }),
    );

    expect(downloadCSVSpy).toHaveBeenCalledOnce();

    // Verify the CSV content is a valid Awaken perps CSV
    const csvContent = downloadCSVSpy.mock.calls[0][0] as string;
    expect(csvContent).toContain("Date,Asset,Amount,Fee,P&L,Payment Token,Notes,Transaction Hash,Tag");

    // Verify the filename includes "perps"
    const filename = downloadCSVSpy.mock.calls[0][1] as string;
    expect(filename).toMatch(/^awakenfetch_injective_inj1qy09_\d{8}_perps\.csv$/);
  });

  it("does not call downloadCSV when clicked while disabled", async () => {
    const user = userEvent.setup();
    render(
      <DownloadPerpsCSVButton
        perpTransactions={[]}
        chainId="injective"
        address="inj1qy09"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /download perps csv/i }),
    );
    expect(downloadCSVSpy).not.toHaveBeenCalled();
  });

  it("has cursor-pointer class on the button", () => {
    render(
      <DownloadPerpsCSVButton
        perpTransactions={[makePerpTx()]}
        chainId="injective"
        address="inj1qy09"
      />,
    );
    const button = screen.getByRole("button", { name: /download perps csv/i });
    expect(button.className).toContain("cursor-pointer");
  });
});
