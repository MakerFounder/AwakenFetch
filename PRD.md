# AwakenFetch -- Implementation Tasks

> Reference the full product spec at `docs/prd.md` for detailed requirements, interfaces, CSV formats, and acceptance criteria.

## Phase 1: Project Setup & Foundation

- [ ] Initialize Next.js 16 project with TypeScript, Tailwind CSS, and App Router using pnpm in the current directory
- [ ] Set up project structure: `src/app`, `src/components`, `src/lib`, `src/lib/adapters`, `src/lib/csv`, `src/types`
- [ ] Define core TypeScript types and interfaces from PRD spec: `ChainAdapter`, `Transaction`, `PerpTransaction`, `FetchOptions` (see docs/prd.md Section 6)
- [ ] Create the `ChainAdapterRegistry` that maps chain IDs to their adapter implementations
- [ ] Set up a shared constants file for Awaken CSV column headers (standard and perpetuals formats from Appendix A)

## Phase 2: CSV Generation Engine

- [ ] Implement the standard Awaken CSV generator that takes `Transaction[]` and outputs a compliant CSV string (date format `MM/DD/YYYY HH:MM:SS` UTC, no negative numbers, max 8 decimal places)
- [ ] Implement multi-asset CSV support with numbered column suffixes (`Received Quantity 1`, `Received Currency 1`, etc.) for LP add/remove transactions
- [ ] Implement the perpetuals Awaken CSV generator that takes `PerpTransaction[]` and outputs a compliant perps CSV string (supports negative P&L, tags: `open_position`, `close_position`, `funding_payment`)
- [ ] Write unit tests for both CSV generators using the example rows from Appendix B of docs/prd.md
- [ ] Implement CSV file download utility with naming convention `awakenfetch_{chain}_{address_short}_{date}.csv`

## Phase 3: Chain Adapters (MVP -- Priority 1)

- [ ] Implement the Bittensor (TAO) chain adapter using the Taostats API: fetch all transaction types (transfers, staking, delegation, subnet registration), map to `Transaction` interface, implement address validation (ss58 format), and return explorer URL for tx hashes
- [ ] Implement the Kaspa (KAS) chain adapter using the Kaspa Explorer API: fetch transfers, map to `Transaction` interface, implement address validation, and return explorer URL for tx hashes
- [ ] Implement the Injective (INJ) chain adapter using the Injective Explorer API / LCD endpoints: fetch transfers and DeFi interactions (swaps, staking), map to `Transaction` interface, implement address validation, and return explorer URL for tx hashes
- [ ] Add pagination, rate limit handling (exponential backoff, max 3 retries), and cursor-based fetching to all adapters
- [ ] If any chain API has CORS issues, create a Next.js API route proxy for those specific chains

## Phase 4: UI -- Wallet Input & Fetching

- [ ] Build the main page layout with a wallet address text input and chain selector dropdown (only show chains with working adapters)
- [ ] Implement client-side address format validation per chain (ss58 for Bittensor/Polkadot, bech32 for Kaspa, Injective-specific format) with inline error messages
- [ ] Add a question mark tooltip next to the chain selector that opens a help modal explaining how to find your wallet address for each chain
- [ ] Implement the fetch flow: on submit, call the selected chain adapter's `fetchTransactions()`, show a progress indicator with transaction count, handle errors with non-blocking warnings and automatic retry

## Phase 5: UI -- Transaction Table

- [ ] Build a sortable, filterable, paginated transaction table with columns: Date (UTC), Type, Sent Qty, Sent Currency, Received Qty, Received Currency, Fee, Fee Currency, Tx Hash (hyperlinked to chain explorer), Notes
- [ ] Implement column sorting (click header to toggle asc/desc) and pagination (50 rows per page)
- [ ] Add date range filter with a date picker defaulting to previous calendar year (Jan 1 - Dec 31) plus custom range support
- [ ] Add transaction type filter dropdown
- [ ] Highlight ambiguous transactions (type = "other") with a yellow background, add a "Needs Review" filter, and make the Type column an editable dropdown for those rows so users can reclassify before export
- [ ] Add loading/skeleton states while transactions are being fetched

## Phase 6: UI -- Export Controls

- [ ] Add a "Download CSV" button that generates and downloads the standard Awaken CSV for all transactions in the current filtered view
- [ ] Add a separate "Download Perps CSV" button/toggle for perpetuals format export (visible only when a perps-capable chain/protocol is selected)
- [ ] Implement duplicate export warning: if the user re-exports the same address + date range, show a warning that importing again may create duplicates in Awaken
- [ ] Store export history in localStorage to power the duplicate detection

## Phase 7: Additional Chain Adapters (v1.0)

- [ ] Implement MultiversX (EGLD) chain adapter using the MultiversX API
- [ ] Implement Hedera (HBAR) chain adapter using the Hedera Mirror Node API
- [ ] Implement Radix (XRD) chain adapter using the Radix Gateway API
- [ ] Implement Ergo (ERG) chain adapter using the Ergo Explorer API
- [ ] Implement Polkadot (DOT) chain adapter using the Subscan API (focus on staking and parachain transactions)
- [ ] Implement Osmosis (OSMO) chain adapter using Mintscan API / LCD endpoints (focus on LP and IBC transactions)
- [ ] Implement Ronin (RON) chain adapter using SkyMavis API

## Phase 8: Perpetuals Protocol Adapters (v1.0)

- [ ] Implement Variational perpetuals adapter (Arbitrum): fetch open/close/funding transactions, map to `PerpTransaction` interface
- [ ] Implement Extended perpetuals adapter (StarkNet): fetch open/close/funding transactions, map to `PerpTransaction` interface

## Phase 9: Polish & Performance

- [ ] Cache fetched transaction data in localStorage so re-exports don't re-fetch
- [ ] Implement incremental streaming for wallets with > 5,000 transactions (results appear as they load)
- [ ] Add Content Security Policy headers to restrict script sources
- [ ] Final pass: ensure all CSV outputs pass Awaken's import validation (test with real wallets on each supported chain)
