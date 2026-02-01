import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FetchStatus } from "@/components/FetchStatus";

afterEach(() => {
  cleanup();
});

describe("FetchStatus", () => {
  const defaultProps = {
    status: "idle" as const,
    transactionCount: 0,
    estimatedTotal: null,
    error: null,
    warnings: [],
    canRetry: false,
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders nothing when status is idle", () => {
    const { container } = render(<FetchStatus {...defaultProps} />);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("shows a spinner and loading message when status is loading", () => {
    render(<FetchStatus {...defaultProps} status="loading" />);
    expect(screen.getByText("Fetching transactions...")).toBeInTheDocument();
  });

  it("shows transaction count on success", () => {
    render(
      <FetchStatus
        {...defaultProps}
        status="success"
        transactionCount={42}
      />,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/transactions/)).toBeInTheDocument();
  });

  it("shows singular 'transaction' for count of 1", () => {
    render(
      <FetchStatus
        {...defaultProps}
        status="success"
        transactionCount={1}
      />,
    );
    expect(screen.getByText(/transaction$/)).toBeInTheDocument();
  });

  it("shows error message when status is error", () => {
    render(
      <FetchStatus
        {...defaultProps}
        status="error"
        error="API key not set"
      />,
    );
    expect(screen.getByText("API key not set")).toBeInTheDocument();
  });

  it("shows retry button when canRetry is true", () => {
    render(
      <FetchStatus
        {...defaultProps}
        status="error"
        error="Rate limited"
        canRetry={true}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
  });

  it("does not show retry button when canRetry is false", () => {
    render(
      <FetchStatus
        {...defaultProps}
        status="error"
        error="Final error"
        canRetry={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("calls onRetry when retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <FetchStatus
        {...defaultProps}
        status="error"
        error="Failed"
        canRetry={true}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when dismiss button is clicked on error", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <FetchStatus
        {...defaultProps}
        status="error"
        error="Failed"
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when dismiss button is clicked on success", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <FetchStatus
        {...defaultProps}
        status="success"
        transactionCount={5}
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders warning messages", () => {
    render(
      <FetchStatus
        {...defaultProps}
        status="loading"
        warnings={[
          "Retry 1/3: Rate limited. Retrying in 1.5s…",
          "Retry 2/3: Rate limited. Retrying in 3.0s…",
        ]}
      />,
    );

    expect(
      screen.getByText("Retry 1/3: Rate limited. Retrying in 1.5s…"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Retry 2/3: Rate limited. Retrying in 3.0s…"),
    ).toBeInTheDocument();
  });

  it("has accessible role=status and aria-live", () => {
    const { container } = render(
      <FetchStatus {...defaultProps} status="loading" />,
    );
    const statusEl = container.querySelector("[role='status']");
    expect(statusEl).toBeInTheDocument();
    expect(statusEl?.getAttribute("aria-live")).toBe("polite");
  });
});
