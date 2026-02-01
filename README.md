# AwakenFetch

A web application that fetches cryptocurrency transaction history from blockchain explorers and exports Awaken Tax-compatible CSV files. Built for chains and protocols not natively supported by Awaken Tax.

## Why AwakenFetch?

Crypto users on unsupported chains (Bittensor, Kaspa, Injective, etc.) or trading perpetuals on newer DEXs must manually construct CSV files for tax import -- a tedious, error-prone process. AwakenFetch automates this by producing **100% compliant, import-ready CSVs specifically for Awaken Tax**.

## Supported Chains

### Standard Transactions

| Chain | Ticker | Status |
|-------|--------|--------|
| Bittensor | TAO | Supported |
| Kaspa | KAS | Supported |
| Injective | INJ | Supported |
| MultiversX | EGLD | Supported |
| Hedera | HBAR | Supported |
| Radix | XRD | Supported |
| Ergo | ERG | Supported |
| Polkadot | DOT | Supported |
| Osmosis | OSMO | Supported |
| Ronin | RON | Supported |

### Perpetuals / Futures

| Protocol | Chain | Status |
|----------|-------|--------|
| Variational | Arbitrum | Supported |
| Extended | StarkNet | Supported |

## Features

- **Wallet address input** with per-chain format validation
- **Transaction table** -- sortable, filterable, paginated view of all fetched transactions
- **Date range filtering** -- filter by tax year or custom date range
- **Standard CSV export** -- Awaken Tax format with multi-asset support
- **Perpetuals CSV export** -- Awaken perps format with open/close/funding tags
- **Ambiguous transaction flagging** -- manually review and reclassify uncertain transactions before export
- **Duplicate export warnings** -- prevents accidental double-imports
- **Automatic retry** -- exponential backoff for rate-limited APIs
- **Client-side only** -- no data leaves your browser; CSV files are generated and downloaded locally

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Testing:** Vitest + React Testing Library
- **Package Manager:** pnpm

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing

```bash
pnpm test
```

### Linting

```bash
pnpm lint
```

### Production Build

```bash
pnpm build
pnpm start
```

## CSV Formats

### Standard CSV

```
Date,Received Quantity,Received Currency,Received Fiat Amount,Sent Quantity,Sent Currency,Sent Fiat Amount,Fee Amount,Fee Currency,Transaction Hash,Notes,Tag
```

- Dates formatted as `MM/DD/YYYY HH:MM:SS` (UTC)
- Multi-asset transactions use numbered column suffixes (`Received Quantity 1`, etc.)
- No negative numbers in quantity columns
- Up to 8 decimal places

### Perpetuals CSV

```
Date,Asset,Amount,Fee,P&L,Payment Token,Notes,Transaction Hash,Tag
```

- Tags: `open_position`, `close_position`, `funding_payment`
- P&L permits negative values

## Architecture

AwakenFetch uses an adapter pattern for chain integrations. Each chain implements a `ChainAdapter` interface that handles fetching transactions from the chain's explorer API and converting them to Awaken's CSV format. All processing happens client-side -- API calls that require keys are proxied through Next.js API routes.

## License

Private
