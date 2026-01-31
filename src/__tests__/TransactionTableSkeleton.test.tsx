import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionTableSkeleton } from "@/components/TransactionTableSkeleton";

describe("TransactionTableSkeleton", () => {
  it("renders with accessible loading role and label", () => {
    render(<TransactionTableSkeleton />);
    const skeleton = screen.getByRole("status");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute("aria-label", "Loading transactions");
  });

  it("renders screen-reader-only loading text", () => {
    const { container } = render(<TransactionTableSkeleton />);
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly).toBeInTheDocument();
    expect(srOnly).toHaveTextContent("Loading transactions, please wait…");
  });

  it("renders all column headers matching TransactionTable columns", () => {
    const { container } = render(<TransactionTableSkeleton />);
    const headers = container.querySelectorAll("thead th");
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
    expect(headers).toHaveLength(expectedHeaders.length);
    expectedHeaders.forEach((text, i) => {
      expect(headers[i]).toHaveTextContent(text);
    });
  });

  it("renders 8 skeleton rows", () => {
    const { container } = render(<TransactionTableSkeleton />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(8);
  });

  it("renders skeleton cells with animate-pulse class", () => {
    const { container } = render(<TransactionTableSkeleton />);
    const pulsingElements = container.querySelectorAll(".animate-pulse");
    // Filter bar (3) + 8 rows × 10 cols (80) + pagination bar (1 + 4) = 88
    expect(pulsingElements.length).toBeGreaterThanOrEqual(80);
  });

  it("renders skeleton pagination placeholders", () => {
    const { container } = render(<TransactionTableSkeleton />);
    // 4 pagination button skeletons
    const paginationPlaceholders = container.querySelectorAll(
      ".flex.items-center.gap-1 > div",
    );
    expect(paginationPlaceholders).toHaveLength(4);
  });
});
