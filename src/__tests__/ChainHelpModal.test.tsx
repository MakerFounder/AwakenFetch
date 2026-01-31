import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletForm } from "@/components/WalletForm";
import { ChainHelpModal } from "@/components/ChainHelpModal";
import type { ChainInfo } from "@/types";

afterEach(() => {
  cleanup();
});

/* ---------- Mock HTMLDialogElement methods for jsdom ---------- */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ??
    vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });

  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ??
    vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    });
});

const mockChains: ChainInfo[] = [
  { chainId: "bittensor", chainName: "Bittensor", ticker: "TAO", enabled: true },
  { chainId: "kaspa", chainName: "Kaspa", ticker: "KAS", enabled: true },
  { chainId: "injective", chainName: "Injective", ticker: "INJ", enabled: true },
];

describe("ChainHelpModal", () => {
  it("renders chain help content when open", () => {
    render(<ChainHelpModal open={true} onClose={() => {}} />);

    expect(
      screen.getByText("Finding Your Wallet Address"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bittensor \(TAO\)/)).toBeInTheDocument();
    expect(screen.getByText(/Kaspa \(KAS\)/)).toBeInTheDocument();
    expect(screen.getByText(/Injective \(INJ\)/)).toBeInTheDocument();
  });

  it("shows instructions for each chain", () => {
    render(<ChainHelpModal open={true} onClose={() => {}} />);

    expect(screen.getByText(/starts with "5"/)).toBeInTheDocument();
    expect(screen.getByText(/starts with "kaspa:"/)).toBeInTheDocument();
    expect(screen.getByText(/starts with "inj1"/)).toBeInTheDocument();
  });

  it("shows a privacy reminder about public addresses only", () => {
    render(<ChainHelpModal open={true} onClose={() => {}} />);

    expect(
      screen.getByText(/never share your private keys/i),
    ).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChainHelpModal open={true} onClose={onClose} />);

    const closeBtn = screen.getByLabelText("Close help modal");
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});

describe("WalletForm — help tooltip integration", () => {
  it("renders the help tooltip button next to the chain label", () => {
    render(<WalletForm chains={mockChains} />);

    const helpBtn = screen.getByLabelText("How to find your wallet address");
    expect(helpBtn).toBeInTheDocument();
  });

  it("opens the help modal when the tooltip button is clicked", async () => {
    const user = userEvent.setup();
    render(<WalletForm chains={mockChains} />);

    const helpBtn = screen.getByLabelText("How to find your wallet address");
    await user.click(helpBtn);

    expect(
      screen.getByText("Finding Your Wallet Address"),
    ).toBeInTheDocument();
  });

  it("does not submit the form when the help button is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<WalletForm chains={mockChains} onSubmit={onSubmit} />);

    const helpBtn = screen.getByLabelText("How to find your wallet address");
    await user.click(helpBtn);

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
