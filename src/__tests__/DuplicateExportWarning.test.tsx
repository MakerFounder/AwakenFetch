import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DuplicateExportWarning } from "@/components/DuplicateExportWarning";

afterEach(cleanup);

describe("DuplicateExportWarning", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <DuplicateExportWarning
        open={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the warning dialog when open is true", () => {
    render(
      <DuplicateExportWarning
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Duplicate Export Warning")).toBeInTheDocument();
    expect(
      screen.getByText(/importing this file again into Awaken may create duplicate/i),
    ).toBeInTheDocument();
  });

  it("shows Cancel and Export Anyway buttons", () => {
    render(
      <DuplicateExportWarning
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export anyway/i })).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <DuplicateExportWarning
        open={true}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when Export Anyway is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DuplicateExportWarning
        open={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /export anyway/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("has role=dialog and aria-modal", () => {
    render(
      <DuplicateExportWarning
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has cursor-pointer on both buttons", () => {
    render(
      <DuplicateExportWarning
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    const confirmBtn = screen.getByRole("button", { name: /export anyway/i });
    expect(cancelBtn.className).toContain("cursor-pointer");
    expect(confirmBtn.className).toContain("cursor-pointer");
  });
});
