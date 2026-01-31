import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const src = path.resolve(__dirname, "..");

describe("Project Directory Structure", () => {
  const requiredDirs = [
    "app",
    "components",
    "lib",
    "lib/adapters",
    "lib/csv",
    "types",
  ];

  it.each(requiredDirs)("has src/%s directory", (dir) => {
    expect(fs.existsSync(path.join(src, dir))).toBe(true);
  });

  it("has types/index.ts with core type exports", () => {
    const content = fs.readFileSync(path.join(src, "types/index.ts"), "utf-8");
    expect(content).toContain("Transaction");
    expect(content).toContain("PerpTransaction");
    expect(content).toContain("ChainAdapter");
    expect(content).toContain("FetchOptions");
  });

  it("has lib/adapters/index.ts with adapter registry", () => {
    const content = fs.readFileSync(
      path.join(src, "lib/adapters/index.ts"),
      "utf-8",
    );
    expect(content).toContain("registerAdapter");
    expect(content).toContain("getAdapter");
    expect(content).toContain("getAvailableChains");
  });

  it("has lib/csv/index.ts with CSV exports", () => {
    const content = fs.readFileSync(
      path.join(src, "lib/csv/index.ts"),
      "utf-8",
    );
    expect(content).toContain("generateStandardCSV");
    expect(content).toContain("generatePerpCSV");
  });

  it("has components/index.ts barrel file", () => {
    expect(fs.existsSync(path.join(src, "components/index.ts"))).toBe(true);
  });
});
