import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Project Configuration", () => {
  const root = path.resolve(__dirname, "../..");

  it("has a valid package.json with correct project name", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8")
    );
    expect(pkg.name).toBe("awaken-fetch");
    expect(pkg.private).toBe(true);
  });

  it("has required dependencies installed", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8")
    );
    expect(pkg.dependencies).toHaveProperty("next");
    expect(pkg.dependencies).toHaveProperty("react");
    expect(pkg.dependencies).toHaveProperty("react-dom");
  });

  it("has required dev dependencies for TypeScript and Tailwind", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8")
    );
    expect(pkg.devDependencies).toHaveProperty("typescript");
    expect(pkg.devDependencies).toHaveProperty("tailwindcss");
    expect(pkg.devDependencies).toHaveProperty("@tailwindcss/postcss");
    expect(pkg.devDependencies).toHaveProperty("eslint");
    expect(pkg.devDependencies).toHaveProperty("eslint-config-next");
  });

  it("has TypeScript strict mode enabled", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(root, "tsconfig.json"), "utf-8")
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("has path alias configured for @/*", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(root, "tsconfig.json"), "utf-8")
    );
    expect(tsconfig.compilerOptions.paths).toEqual({
      "@/*": ["./src/*"],
    });
  });

  it("has required scripts configured", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8")
    );
    expect(pkg.scripts).toHaveProperty("dev");
    expect(pkg.scripts).toHaveProperty("build");
    expect(pkg.scripts).toHaveProperty("start");
    expect(pkg.scripts).toHaveProperty("lint");
    expect(pkg.scripts).toHaveProperty("test");
  });

  it("has App Router directory structure (src/app)", () => {
    expect(fs.existsSync(path.join(root, "src/app"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/app/layout.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/app/page.tsx"))).toBe(true);
  });

  it("has Tailwind CSS configured via PostCSS", () => {
    expect(fs.existsSync(path.join(root, "postcss.config.mjs"))).toBe(true);
  });

  it("has globals.css with tailwind import", () => {
    const css = fs.readFileSync(
      path.join(root, "src/app/globals.css"),
      "utf-8"
    );
    expect(css).toContain("@import \"tailwindcss\"");
  });

  it("has ESLint configuration", () => {
    expect(fs.existsSync(path.join(root, "eslint.config.mjs"))).toBe(true);
  });

  it("has next.config.ts", () => {
    expect(fs.existsSync(path.join(root, "next.config.ts"))).toBe(true);
  });
});
