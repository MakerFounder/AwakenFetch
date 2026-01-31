import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { WalletForm } from "@/components/WalletForm";
import type { ChainInfo } from "@/types";

afterEach(cleanup);

const mockChains: ChainInfo[] = [
  {
    chainId: "bittensor",
    chainName: "Bittensor",
    ticker: "TAO",
    enabled: true,
  },
  { chainId: "kaspa", chainName: "Kaspa", ticker: "KAS", enabled: true },
  {
    chainId: "injective",
    chainName: "Injective",
    ticker: "INJ",
    enabled: true,
  },
  {
    chainId: "disabled-chain",
    chainName: "Disabled",
    ticker: "DIS",
    enabled: false,
  },
];

describe("WalletForm", () => {
  it("renders the chain selector with enabled chains only", () => {
    const { container } = render(<WalletForm chains={mockChains} />);
    const select = within(container).getByLabelText(/chain/i);
    expect(select).toBeInTheDocument();

    // Should have placeholder + 3 enabled chains = 4 options
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(4);

    // Disabled chain should not appear
    expect(within(container).queryByText(/Disabled/)).not.toBeInTheDocument();
  });

  it("renders the wallet address input", () => {
    const { container } = render(<WalletForm chains={mockChains} />);
    const input = within(container).getByLabelText(/wallet address/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute(
      "placeholder",
      "Enter your public wallet address",
    );
  });

  it("renders the submit button", () => {
    const { container } = render(<WalletForm chains={mockChains} />);
    const button = within(container).getByRole("button", {
      name: /fetch transactions/i,
    });
    expect(button).toBeInTheDocument();
  });

  it("disables the submit button when form is empty", () => {
    const { container } = render(<WalletForm chains={mockChains} />);
    const button = within(container).getByRole("button", {
      name: /fetch transactions/i,
    });
    expect(button).toBeDisabled();
  });

  it("disables the submit button when only address is entered", () => {
    const { container } = render(<WalletForm chains={mockChains} />);
    const input = within(container).getByLabelText(/wallet address/i);
    fireEvent.change(input, { target: { value: "some-address" } });
    const button = within(container).getByRole("button", {
      name: /fetch transactions/i,
    });
    expect(button).toBeDisabled();
  });

  it("disables the submit button when only chain is selected", () => {
    const { container } = render(<WalletForm chains={mockChains} />);
    const select = within(container).getByLabelText(/chain/i);
    fireEvent.change(select, { target: { value: "kaspa" } });
    const button = within(container).getByRole("button", {
      name: /fetch transactions/i,
    });
    expect(button).toBeDisabled();
  });

  it("enables the submit button when both address and chain are provided", () => {
    const { container } = render(<WalletForm chains={mockChains} />);
    const input = within(container).getByLabelText(/wallet address/i);
    const select = within(container).getByLabelText(/chain/i);
    fireEvent.change(input, { target: { value: "some-address" } });
    fireEvent.change(select, { target: { value: "bittensor" } });
    const button = within(container).getByRole("button", {
      name: /fetch transactions/i,
    });
    expect(button).toBeEnabled();
  });

  it("calls onSubmit with trimmed address and selected chain", () => {
    const handleSubmit = vi.fn();
    const { container } = render(
      <WalletForm chains={mockChains} onSubmit={handleSubmit} />,
    );

    fireEvent.change(within(container).getByLabelText(/wallet address/i), {
      target: { value: "  my-wallet-addr  " },
    });
    fireEvent.change(within(container).getByLabelText(/chain/i), {
      target: { value: "injective" },
    });
    fireEvent.click(
      within(container).getByRole("button", { name: /fetch transactions/i }),
    );

    expect(handleSubmit).toHaveBeenCalledOnce();
    expect(handleSubmit).toHaveBeenCalledWith("my-wallet-addr", "injective");
  });

  it("does not call onSubmit when form is invalid", () => {
    const handleSubmit = vi.fn();
    const { container } = render(
      <WalletForm chains={mockChains} onSubmit={handleSubmit} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /fetch transactions/i }),
    );
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("renders with no chains without crashing", () => {
    const { container } = render(<WalletForm chains={[]} />);
    const select = within(container).getByLabelText(/chain/i);
    const options = select.querySelectorAll("option");
    // Only placeholder option
    expect(options).toHaveLength(1);
  });

  it("displays chain names with tickers in dropdown options", () => {
    const { container } = render(<WalletForm chains={mockChains} />);
    expect(within(container).getByText("Bittensor (TAO)")).toBeInTheDocument();
    expect(within(container).getByText("Kaspa (KAS)")).toBeInTheDocument();
    expect(within(container).getByText("Injective (INJ)")).toBeInTheDocument();
  });
});
