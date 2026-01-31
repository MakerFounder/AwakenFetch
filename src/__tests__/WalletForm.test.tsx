import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletForm } from "@/components/WalletForm";
import type { ChainInfo } from "@/types";

afterEach(() => {
  cleanup();
});

const mockChains: ChainInfo[] = [
  { chainId: "bittensor", chainName: "Bittensor", ticker: "TAO", enabled: true },
  { chainId: "kaspa", chainName: "Kaspa", ticker: "KAS", enabled: true },
  { chainId: "injective", chainName: "Injective", ticker: "INJ", enabled: true },
];

describe("WalletForm — address validation", () => {
  it("shows an error after blur when an invalid Bittensor address is entered", async () => {
    const user = userEvent.setup();
    render(<WalletForm chains={mockChains} />);

    // Select Bittensor
    await user.selectOptions(screen.getByLabelText("Chain"), "bittensor");

    // Type invalid address and blur
    const input = screen.getByLabelText("Wallet Address");
    await user.type(input, "invalidaddress");
    fireEvent.blur(input);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toContain("start with");
  });

  it("clears the error when a valid Bittensor address is entered", async () => {
    const user = userEvent.setup();
    render(<WalletForm chains={mockChains} />);

    await user.selectOptions(screen.getByLabelText("Chain"), "bittensor");

    const input = screen.getByLabelText("Wallet Address");
    await user.type(input, "invalidaddress");
    fireEvent.blur(input);

    // Error should be visible
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Clear and type valid address
    await user.clear(input);
    await user.type(
      input,
      "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
    );

    // Error should be gone
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error for invalid Kaspa address", async () => {
    const user = userEvent.setup();
    render(<WalletForm chains={mockChains} />);

    await user.selectOptions(screen.getByLabelText("Chain"), "kaspa");

    const input = screen.getByLabelText("Wallet Address");
    await user.type(input, "notakaspaaddress");
    fireEvent.blur(input);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toContain("kaspa:");
  });

  it("shows an error for invalid Injective address", async () => {
    const user = userEvent.setup();
    render(<WalletForm chains={mockChains} />);

    await user.selectOptions(screen.getByLabelText("Chain"), "injective");

    const input = screen.getByLabelText("Wallet Address");
    await user.type(input, "cosmos1abc");
    fireEvent.blur(input);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toContain("inj1");
  });

  it("does not show an error before the field is blurred", async () => {
    const user = userEvent.setup();
    render(<WalletForm chains={mockChains} />);

    // Type an address first (before selecting chain) — no validation should run
    const input = screen.getByLabelText("Wallet Address");
    await user.type(input, "bad");

    // No chain selected and no blur → no error
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the submit button when address is invalid", async () => {
    const user = userEvent.setup();
    const { container } = render(<WalletForm chains={mockChains} />);

    await user.selectOptions(screen.getByLabelText("Chain"), "bittensor");

    const input = screen.getByLabelText("Wallet Address");
    await user.type(input, "invalidaddress");
    fireEvent.blur(input);

    const button = container.querySelector("button[type='submit']")!;
    expect(button).toBeDisabled();
  });

  it("does not call onSubmit when the address is invalid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(
      <WalletForm chains={mockChains} onSubmit={onSubmit} />,
    );

    await user.selectOptions(screen.getByLabelText("Chain"), "bittensor");

    const input = screen.getByLabelText("Wallet Address");
    await user.type(input, "invalidaddress");

    const button = container.querySelector("button[type='submit']")!;
    await user.click(button);

    expect(onSubmit).not.toHaveBeenCalled();
    // Error should now appear after submit attempt
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("calls onSubmit when the address is valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(
      <WalletForm chains={mockChains} onSubmit={onSubmit} />,
    );

    await user.selectOptions(screen.getByLabelText("Chain"), "bittensor");

    const input = screen.getByLabelText("Wallet Address");
    await user.type(
      input,
      "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
    );

    // Submit the form
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledWith(
      "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
      "bittensor",
    );
  });

  it("updates placeholder when chain is changed", async () => {
    const user = userEvent.setup();
    render(<WalletForm chains={mockChains} />);

    const input = screen.getByLabelText("Wallet Address");

    // Select Kaspa — placeholder should update
    await user.selectOptions(screen.getByLabelText("Chain"), "kaspa");
    expect(input.getAttribute("placeholder")).toContain("kaspa:");

    // Select Injective — placeholder should update again
    await user.selectOptions(screen.getByLabelText("Chain"), "injective");
    expect(input.getAttribute("placeholder")).toContain("inj1");

    // Verify it's different from the Kaspa placeholder
    expect(input.getAttribute("placeholder")).not.toContain("kaspa:");
  });

  it("re-validates when chain is changed after the field is touched", async () => {
    const user = userEvent.setup();
    render(<WalletForm chains={mockChains} />);

    // Start with Kaspa, enter a valid Kaspa address
    await user.selectOptions(screen.getByLabelText("Chain"), "kaspa");
    const input = screen.getByLabelText("Wallet Address");
    await user.type(
      input,
      "kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73",
    );
    fireEvent.blur(input);

    // Should be valid for Kaspa
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Switch to Bittensor — the Kaspa address is invalid for Bittensor
    await user.selectOptions(screen.getByLabelText("Chain"), "bittensor");

    // Error should appear since the address is invalid for Bittensor
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
