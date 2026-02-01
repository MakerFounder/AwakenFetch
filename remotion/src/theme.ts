// Light mode colors from the actual AwakenFetch app
export const theme = {
  bg: "#f6f2e5",
  foreground: "#1b0d04",
  accent: "#c4883c",
  accentHover: "#a8702e",
  surface: "#ede6d6",
  surfaceHover: "#e5dcc8",
  border: "#d4cbb8",
  borderHover: "#b8ad96",
  muted: "#7b7165",
  success: "#4a7c59",
  warning: "#b8860b",
  error: "#a63d40",
  link: "#8b5e3c",

  // Type badge colors (light mode)
  typeSend: { bg: "#fee2e2", text: "#991b1b" },
  typeReceive: { bg: "#dcfce7", text: "#166534" },
  typeTrade: { bg: "#dbeafe", text: "#1e40af" },
  typeStake: { bg: "#f3e8ff", text: "#6b21a8" },
  typeClaim: { bg: "#d1fae5", text: "#065f46" },
} as const;
