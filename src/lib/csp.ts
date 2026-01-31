/**
 * Content Security Policy configuration.
 *
 * Restricts which sources the browser may load scripts, styles, images, etc.
 * from. The policy follows the principle of least privilege – only origins that
 * the application actually needs are allowed.
 */

export interface CspDirectives {
  "default-src": string[];
  "script-src": string[];
  "style-src": string[];
  "img-src": string[];
  "font-src": string[];
  "connect-src": string[];
  "frame-ancestors": string[];
  "form-action": string[];
  "base-uri": string[];
  "object-src": string[];
}

export const cspDirectives: CspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
};

/**
 * Serialise the directives map into a single CSP header value string.
 */
export function buildCspHeaderValue(
  directives: CspDirectives = cspDirectives,
): string {
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

/**
 * All security-related headers that should be applied to every response.
 */
export function getSecurityHeaders(): { key: string; value: string }[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildCspHeaderValue(),
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}
