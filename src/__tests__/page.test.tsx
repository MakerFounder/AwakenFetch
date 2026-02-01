import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import Home from "@/app/page";

afterEach(cleanup);

describe("Home Page", () => {
  it("renders the AwakenFetch heading", () => {
    const { container } = render(<Home />);
    const heading = within(container).getByRole("heading", {
      name: /awaken\s*fetch/i,
    });
    expect(heading).toBeInTheDocument();
  });

  it("renders the description text", () => {
    const { container } = render(<Home />);
    expect(
      within(container).getByText(
        /fetch on-chain transactions/i,
      ),
    ).toBeInTheDocument();
  });

  it("renders the wallet form with chain selector and address input", () => {
    const { container } = render(<Home />);
    expect(within(container).getByLabelText(/chain/i)).toBeInTheDocument();
    expect(
      within(container).getByLabelText("Wallet Address"),
    ).toBeInTheDocument();
    expect(
      within(container).getByRole("button", { name: /fetch/i }),
    ).toBeInTheDocument();
  });

  it("shows all registered chain adapters in the dropdown", () => {
    const { container } = render(<Home />);
    const select = within(container).getByLabelText(/chain/i);
    expect(within(select).getByText(/Bittensor/)).toBeInTheDocument();
    expect(within(select).getByText(/Kaspa/)).toBeInTheDocument();
    expect(within(select).getByText(/Injective/)).toBeInTheDocument();
  });
});
