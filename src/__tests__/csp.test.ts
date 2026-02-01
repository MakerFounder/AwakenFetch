import { describe, it, expect } from "vitest";
import {
  buildCspHeaderValue,
  cspDirectives,
  getSecurityHeaders,
  type CspDirectives,
} from "@/lib/csp";

describe("CSP configuration", () => {
  describe("cspDirectives", () => {
    it("restricts default-src to self", () => {
      expect(cspDirectives["default-src"]).toEqual(["'self'"]);
    });

    it("allows script-src with self, unsafe-inline, and unsafe-eval", () => {
      expect(cspDirectives["script-src"]).toContain("'self'");
      expect(cspDirectives["script-src"]).toContain("'unsafe-inline'");
      expect(cspDirectives["script-src"]).toContain("'unsafe-eval'");
    });

    it("disallows framing via frame-ancestors none", () => {
      expect(cspDirectives["frame-ancestors"]).toEqual(["'none'"]);
    });

    it("disallows object embeds", () => {
      expect(cspDirectives["object-src"]).toEqual(["'none'"]);
    });

    it("restricts form-action to self", () => {
      expect(cspDirectives["form-action"]).toEqual(["'self'"]);
    });

    it("restricts base-uri to self", () => {
      expect(cspDirectives["base-uri"]).toEqual(["'self'"]);
    });
  });

  describe("buildCspHeaderValue", () => {
    it("returns a semicolon-separated string of all directives", () => {
      const value = buildCspHeaderValue();
      expect(value).toContain("default-src 'self'");
      expect(value).toContain("script-src 'self'");
      expect(value).toContain("frame-ancestors 'none'");
      expect(value).toContain("object-src 'none'");
    });

    it("joins multiple sources with spaces", () => {
      const value = buildCspHeaderValue();
      expect(value).toContain("style-src 'self' 'unsafe-inline'");
      expect(value).toContain("img-src 'self' data: blob:");
    });

    it("accepts custom directives", () => {
      const custom: CspDirectives = {
        ...cspDirectives,
        "script-src": ["'self'", "https://cdn.example.com"],
      };
      const value = buildCspHeaderValue(custom);
      expect(value).toContain(
        "script-src 'self' https://cdn.example.com",
      );
    });

    it("separates directives with semicolons", () => {
      const value = buildCspHeaderValue();
      const parts = value.split("; ");
      expect(parts.length).toBe(Object.keys(cspDirectives).length);
    });
  });

  describe("getSecurityHeaders", () => {
    it("includes Content-Security-Policy header", () => {
      const headers = getSecurityHeaders();
      const csp = headers.find((h) => h.key === "Content-Security-Policy");
      expect(csp).toBeDefined();
      expect(csp!.value).toContain("script-src 'self'");
    });

    it("includes X-Content-Type-Options nosniff", () => {
      const headers = getSecurityHeaders();
      const header = headers.find(
        (h) => h.key === "X-Content-Type-Options",
      );
      expect(header).toBeDefined();
      expect(header!.value).toBe("nosniff");
    });

    it("includes X-Frame-Options DENY", () => {
      const headers = getSecurityHeaders();
      const header = headers.find((h) => h.key === "X-Frame-Options");
      expect(header).toBeDefined();
      expect(header!.value).toBe("DENY");
    });

    it("includes Referrer-Policy", () => {
      const headers = getSecurityHeaders();
      const header = headers.find((h) => h.key === "Referrer-Policy");
      expect(header).toBeDefined();
      expect(header!.value).toBe("strict-origin-when-cross-origin");
    });

    it("includes Permissions-Policy restricting sensitive APIs", () => {
      const headers = getSecurityHeaders();
      const header = headers.find((h) => h.key === "Permissions-Policy");
      expect(header).toBeDefined();
      expect(header!.value).toContain("camera=()");
      expect(header!.value).toContain("microphone=()");
      expect(header!.value).toContain("geolocation=()");
    });

    it("returns headers as key-value pairs", () => {
      const headers = getSecurityHeaders();
      for (const header of headers) {
        expect(header).toHaveProperty("key");
        expect(header).toHaveProperty("value");
        expect(typeof header.key).toBe("string");
        expect(typeof header.value).toBe("string");
      }
    });
  });
});
