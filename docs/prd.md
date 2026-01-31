# AwakenFetch -- Product Requirements Document

---

## 1. Executive Summary

**Problem Statement:** Crypto users on chains not natively supported by Awaken Tax (Bittensor, Kaspa, Injective, etc.) or trading perpetuals on newer DEXs (Variational, Extended) must manually construct CSV files to import their transaction history -- a tedious, error-prone process that leads to misreported taxes.

**Proposed Solution:** AwakenFetch is a web application that takes a wallet address, fetches all transactions from a supported blockchain via its explorer/indexer API, displays them in a table, and exports a correctly formatted CSV file ready for Awaken Tax import (standard or perpetuals format).

**Success Criteria:**

| KPI | Target |
|---|---|
| CSV format compliance | 100% of generated CSVs pass Awaken's import validation without errors |
| Transaction fetch completeness | >= 99% of on-chain txs for a given address are captured (verified against block explorer) |
| Export latency | CSV ready to download within 30s for wallets with <= 5,000 txs |
| Supported chains at launch (MVP) | >= 3 chains from Priority 1 list |
| User error rate | < 5% of exports require manual correction before Awaken import |

---

## 2. Competitive Landscape & Positioning

**Market Gap:** While generic tax calculators like Koinly or CoinTracker aim for broad support, they often produce generic CSVs that still require manual mapping and correction for Awaken's specific labels, multi-asset formats, and perpetuals conventions.

**Unique Selling Proposition (USP):** AwakenFetch's sole focus is producing a **100% compliant, import-ready CSV specifically for Awaken Tax**. It saves users the final, frustrating step of data cleanup and reconciliation by being an opinionated "export adapter" rather than a general-purpose portfolio tracker.

---

## 3. User Experience & Functionality

**Important Note on Fiat Values:** v1 of AwakenFetch will not fetch historical fiat prices for transactions. The Fiat Amount columns will be left blank unless the source API provides them directly. The primary function of the AwakenFetch UI is to verify transaction *completeness* and *categorization*, not to calculate financial value. The final cost basis and capital gains will be calculated by Awaken Tax after the CSV is imported.

### User Personas

| Persona | Description | Primary Need |
|---|---|---|
| **Tax-season trader** | Holds assets on 2-5 chains, files taxes annually, moderate DeFi activity. | Quickly export a full year of txs in Awaken format without manually editing spreadsheets. |
| **Perp degen** | Trades perpetuals on Variational/Extended, needs P&L records for tax filing. | Generate Awaken-compatible perps CSV with accurate open/close/funding entries. |
| **Crypto accountant** | Manages tax filings for multiple clients across many wallets. | Batch-process multiple addresses, trust the output accuracy, minimize review time. |

### User Stories & Acceptance Criteria

**US-1: Fetch transactions for a wallet**
> As a tax-season trader, I want to enter my wallet address and select a chain so that all my transactions are fetched and displayed.

- [ ] Address input validates format per chain (e.g., ss58 for Polkadot, bech32 for Bittensor).
- [ ] Chain selector shows only chains with working adapters.
- [ ] Fetching shows a progress indicator with tx count and estimated time remaining.
- [ ] Results display within 30s for <= 5,000 txs; for larger wallets, results stream incrementally.
- [ ] If the API returns an error or rate-limits, the UI shows a non-blocking warning and retries automatically (exponential backoff, max 3 retries).

**US-2: View transactions in a table**
> As a tax-season trader, I want to view my transactions in a sortable, filterable table so that I can review them before exporting.

- [ ] Table columns: Date (UTC), Type, Sent Qty, Sent Currency, Received Qty, Received Currency, Fee, Fee Currency, Tx Hash (hyperlinked to chain explorer), Notes.
- [ ] Sortable by any column (click header to toggle asc/desc).
- [ ] Filterable by date range and transaction type.
- [ ] Paginated at 50 rows per page with page navigation.
- [ ] Tx Hash links open the correct block explorer in a new tab.

**US-3: Export standard Awaken CSV**
> As a tax-season trader, I want to download my transactions as a CSV in Awaken's format so that I can import them directly.

- [ ] Downloaded file is named `awakenfetch_{chain}_{address_short}_{date}.csv`.
- [ ] Header row matches Awaken spec exactly (see Appendix A).
- [ ] All dates formatted as `MM/DD/YYYY HH:MM:SS` in UTC.
- [ ] No negative numbers appear in any quantity column.
- [ ] Numbers have at most 8 decimal places.
- [ ] Multi-asset txs use numbered column suffixes (`Received Quantity 1`, etc.).
- [ ] If the user re-exports the same address + date range, a warning is shown: "You have already exported this range. Importing again may create duplicates in Awaken."

**US-4: Export perpetuals Awaken CSV**
> As a perp degen, I want to download my perpetuals trading history in Awaken's perps CSV format so that I can report derivatives P&L.

- [ ] Separate export button / toggle for perps format.
- [ ] Header row matches Awaken perps spec exactly (see Appendix A).
- [ ] Each row tagged as `open_position`, `close_position`, or `funding_payment`.
- [ ] P&L column permits negative values.
- [ ] Payment Token column is always populated for close and funding rows.

**US-5: Date range filtering**
> As a crypto accountant, I want to filter transactions by tax year (or custom date range) so that I only export what's needed for a specific filing period.

- [ ] Date picker defaults to the previous calendar year (Jan 1 - Dec 31).
- [ ] Custom range supported with start/end date inputs.
- [ ] Exported CSV only includes transactions within the selected range.

**US-6: Flag and Review Ambiguous Transactions**
> As a crypto accountant, I want the tool to flag transactions it cannot confidently classify so that I can manually review and categorize them before export.

- [ ] A "Needs Review" filter appears in the table if any ambiguous transactions are found.
- [ ] Ambiguous rows are highlighted (e.g., with a yellow background).
- [ ] The "Type" column for these rows becomes a dropdown selector, allowing the user to manually change it from "other" to "trade", "lp_add", etc.

**US-7: Access Help Guides for Wallet Addresses**
> As a tax-season trader, I want to see a small tooltip or link next to the chain selector so that I can get help finding my wallet address.

- [ ] A small question mark icon appears next to the chain selector.
- [ ] Clicking the icon opens a small modal or links to a simple guide (e.g., "How to find your Bittensor wallet address on Taostats").

### Non-Goals (v1)

- **Portfolio tracking or valuation** -- this is a fetch-and-export tool, not a portfolio dashboard.
- **Fiat price lookups** -- Fiat Amount columns are populated only if the chain API provides them; we do not integrate a separate price oracle in v1.
- **Direct Awaken API integration** -- we generate a CSV file; we do not upload it to Awaken programmatically.
- **Multi-wallet batch processing** -- v1 supports one address at a time.
- **Mobile-optimized UI** -- desktop-first; responsive is a nice-to-have, not a requirement.
- **User accounts or saved history** -- no login, no persistence beyond the current session (localStorage cache only).

---

## 4. Core Features

### 1. Wallet Input
- Single text field accepting a wallet address (or ENS / chain-specific name where applicable).
- Dropdown (or auto-detect) to select the target chain.
- Client-side address format validation per chain before making any API call.

### 2. Transaction Fetching
- Query the chain's explorer / indexer API for all transactions tied to the address.
- Handle pagination, rate limits, and retries gracefully.
- Support both standard transfers and DeFi interactions (swaps, liquidity adds/removes, staking rewards, bridging).

### 3. Transaction Table
- Sortable, filterable, paginated table.
- Columns: Date (UTC), Type, Sent Qty, Sent Currency, Received Qty, Received Currency, Fee, Fee Currency, Tx Hash (linked to explorer), Notes.
- Loading / skeleton state while fetching.

### 4. CSV Export -- Awaken Standard Format
Generate a CSV matching Awaken's exact spec (see Appendix A). The header row must be:

```
Date,Received Quantity,Received Currency,Received Fiat Amount,Sent Quantity,Sent Currency,Sent Fiat Amount,Fee Amount,Fee Currency,Transaction Hash,Notes,Tag
```

Rules:
- **Date format:** `MM/DD/YYYY HH:MM:SS` in UTC.
- **No negative numbers.**
- **Decimal precision:** up to 8 places.
- **Send / Withdrawal:** leave Received Quantity & Received Currency empty. Sent Quantity excludes fees.
- **Receive / Deposit:** leave Sent Quantity & Sent Currency empty. Received Quantity excludes fees.
- **Trade / Swap:** fill both Sent and Received columns.
- **Multi-asset transactions** (e.g., LP add/remove): use Awaken's multi-asset template with numbered columns (`Received Quantity 1`, `Received Currency 1`, `Sent Quantity 1`, `Sent Currency 1`, etc.).
- **Fiat Amount columns** are optional but recommended when available.
- **Tag column** (optional): valid labels per Awaken's taxonomy (see https://help.awaken.tax/en/articles/10453755-how-do-i-label-my-transactions).
- **Avoid duplicates** -- warn the user if they re-fetch an already-exported range.

### 5. CSV Export -- Awaken Perpetuals Format
For perpetual / futures protocols (Variational, Extended, Hyperliquid, etc.), generate a separate CSV:

```
Date,Asset,Amount,Fee,P&L,Payment Token,Notes,Transaction Hash,Tag
```

Rules:
- **Date format:** same `MM/DD/YYYY HH:MM:SS` UTC.
- **Asset:** underlying perp asset (e.g., BTC, FARTCOIN).
- **Amount:** quantity of the underlying.
- **P&L:** net profit/loss, can be negative, positive, or zero.
- **Payment Token:** settlement token (usually USDC, USDT, or fiat).
- **Tag:** one of `open_position`, `close_position`, `funding_payment`.
- **Decimal precision:** up to 8 places.

---

## 5. Supported Chains & Data Sources

### Priority 1 -- Not natively supported by Awaken (highest value)

| Chain | Ticker | Explorer / API | Notes |
|---|---|---|---|
| **Bittensor** | TAO | [Taostats API](https://taostats.io/) / [Bittensor SDK](https://docs.bittensor.com/bt-api-ref) | Decentralized AI network. Staking, delegation, subnet registration txs. ~$3.3B market cap. |
| **Kaspa** | KAS | [Kaspa Explorer API](https://explorer.kaspa.org/) | Fast PoW chain, growing community. Not on Awaken. |
| **Injective** | INJ | [Injective Explorer API](https://explorer.injective.network/) / LCD | Cosmos-based DeFi chain with perps, options. Not on Awaken. |
| **MultiversX** | EGLD | [MultiversX API](https://api.multiversx.com/) | Former Elrond. Sharded L1. Not on Awaken. |
| **Hedera** | HBAR | [Hedera Mirror Node API](https://mainnet-public.mirrornode.hedera.com/) | Enterprise-grade DLT. Not on Awaken. |
| **Radix** | XRD | [Radix Gateway API](https://mainnet.radixdlt.com/) | DeFi-focused L1 with unique asset model. Not on Awaken. |
| **Ergo** | ERG | [Ergo Explorer API](https://api.ergoplatform.com/) | UTXO smart contract platform. Not on Awaken. |

### Priority 2 -- On Awaken but may have limited or CSV-only support

| Chain | Ticker | Explorer / API | Notes |
|---|---|---|---|
| **Polkadot** | DOT | [Subscan API](https://polkadot.subscan.io/) | Supported on Awaken but staking/parachain txs may need CSV supplement. |
| **Osmosis** | OSMO | [Mintscan API](https://www.mintscan.io/osmosis) / LCD endpoints | Cosmos DEX hub. On Awaken but LP/IBC txs may need CSV. |
| **Ronin** | RON | [SkyMavis API](https://docs.skymavis.com/) (migrating to Moralis) | Axie Infinity chain. On Awaken but gaming txs may need CSV. |

### Priority 3 -- Perpetual / Futures DEXs (use Awaken Perps CSV format)

| Protocol | Chain | API / Data Source | Notes |
|---|---|---|---|
| **Variational** | Arbitrum | [Variational API](https://docs.variational.io/) | P2P perp DEX. Zero-fee perps. RFQ model. Open/close/funding txs. |
| **Extended** | StarkNet | [Extended API](https://docs.extended.exchange/) | Perp DEX (fka X10). Up to 100x leverage. USDC collateral. |

---

## 6. Technical Specifications

### Architecture Overview

```
[Browser UI]
    |
    v
[Chain Selector] --> [ChainAdapter Registry]
    |                        |
    v                        v
[Address Input] --> [ChainAdapter.fetchTransactions()]
    |                        |
    |                  [Explorer/Indexer API]
    v                        |
[Transaction Store (in-memory)] <---+
    |
    +---> [Table Renderer (sortable, filterable, paginated)]
    |
    +---> [CSV Generator (standard or perps format)]
              |
              v
         [File Download]
```

- **Frontend-only SPA** -- no backend server required in v1. All API calls go directly from the browser to public chain explorer APIs.
- **If CORS is an issue** for any chain API, use a lightweight proxy (Cloudflare Worker or Next.js API route).

### API Integration Pattern
For each chain, implement an adapter with this interface:

```typescript
interface ChainAdapter {
  chainId: string;
  fetchTransactions(address: string, options?: FetchOptions): Promise<Transaction[]>;
  toAwakenCSV(txs: Transaction[]): string;
  getExplorerUrl(txHash: string): string;
}

interface FetchOptions {
  fromDate?: Date;
  toDate?: Date;
  cursor?: string;
  limit?: number;
}

interface Transaction {
  date: Date;
  type: 'send' | 'receive' | 'trade' | 'lp_add' | 'lp_remove' | 'stake' | 'unstake' | 'claim' | 'bridge' | 'approval' | 'other';
  sentQuantity?: number;
  sentCurrency?: string;
  sentFiatAmount?: number;
  receivedQuantity?: number;
  receivedCurrency?: string;
  receivedFiatAmount?: number;
  feeAmount?: number;
  feeCurrency?: string;
  txHash?: string;
  notes?: string;
  tag?: string;
  // For multi-asset txs
  additionalSent?: { quantity: number; currency: string; fiatAmount?: number }[];
  additionalReceived?: { quantity: number; currency: string; fiatAmount?: number }[];
}
```

For perpetual protocols, use a separate interface:

```typescript
interface PerpTransaction {
  date: Date;
  asset: string;
  amount: number;
  fee?: number;
  pnl: number;
  paymentToken: string;
  notes?: string;
  txHash?: string;
  tag: 'open_position' | 'close_position' | 'funding_payment';
}
```

### Security & Privacy

- **No wallet private keys** are ever requested or handled. Only public addresses.
- **No user data leaves the browser** -- all processing is client-side; no analytics or telemetry beyond basic page loads.
- **API keys** for chain explorers (if required) are stored as environment variables, never exposed to the client. If a chain API requires a key, requests are proxied through a server-side route.
- **CSV files** are generated in-browser and downloaded directly; they are not uploaded to any server.
- **Content Security Policy** headers restrict script sources to prevent XSS.

### Error Handling
- Invalid address format -> show inline validation error.
- API rate limit -> automatic backoff + retry with progress indicator.
- Partial fetch failure -> show partial results with warning banner.

### Performance
- Stream / paginate large histories (some wallets have 100k+ txs).
- Cache fetched data in-memory or localStorage so re-exports don't re-fetch.

---

## 7. Risks & Roadmap

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Chain API rate limits block large wallet fetches | Users with 10k+ txs can't export | Medium | Implement exponential backoff, request queuing, and progress streaming. Cache results in localStorage. |
| Chain API deprecation or breaking changes (e.g., SkyMavis Skynet sunsetting Q1 2025) | Adapter stops working | Medium | Abstract behind ChainAdapter interface; monitor API changelogs; maintain fallback data sources per chain. |
| Awaken changes their CSV format | Exports fail validation on import | Low | Pin to a known working format version; add a "CSV format version" selector if Awaken publishes updates. |
| CORS restrictions on chain explorer APIs | Browser can't reach API directly | High for some chains | Deploy a minimal Cloudflare Worker proxy; document which chains require it. |
| Incorrect transaction categorization (e.g., swap vs. transfer) | Tax miscalculation | Medium | Implement a robust classification engine. Allow users to manually override tx type in the table before export. Add a "Needs Review" filter for ambiguous transactions. |

### Phased Rollout

**MVP (v0.1)** -- 4-6 weeks
- 3 Priority 1 chain adapters (Bittensor, Kaspa, Injective).
- Standard Awaken CSV export only.
- Basic table view (sortable, paginated).
- Date range filter.

**v1.0** -- 8-12 weeks
- All Priority 1 chains.
- Priority 2 chains (Polkadot, Osmosis, Ronin).
- Perpetuals CSV export for Variational and Extended.
- Multi-asset (LP) CSV support.
- Duplicate export warning.
- Manual tx type override & ambiguous transaction flagging.

**v1.1** -- 14-18 weeks
- Fiat price enrichment via CoinGecko API (populate optional Fiat Amount columns).
- Multi-wallet batch export (enter multiple addresses, get one merged CSV).
- Help tooltips for finding wallet addresses.

**v2.0** -- Future
- Direct Awaken API upload (if they expose an import endpoint).
- Browser extension for one-click export from block explorer pages.
- Community-contributed chain adapters with a plugin system.

---

## Appendix A -- Awaken CSV Column Reference

### Standard CSV

| Column | Required | Description |
|---|---|---|
| Date | Yes | `MM/DD/YYYY HH:MM:SS` UTC |
| Received Quantity [n] | Conditional | Amount received (empty for sends) |
| Received Currency [n] | Conditional | Token symbol received |
| Received Fiat Amount [n] | No | USD value at time of receipt |
| Sent Quantity [n] | Conditional | Amount sent, excluding fees (empty for receives) |
| Sent Currency [n] | Conditional | Token symbol sent |
| Sent Fiat Amount [n] | No | USD value at time of send |
| Fee Amount | No | Fee quantity |
| Fee Currency | No | Fee token symbol |
| Transaction Hash | No | Links to block explorer in Awaken |
| Notes | No | Free-text notes |
| Tag | No | Awaken label (see label docs) |

`[n]` suffix supports multi-asset rows (e.g., `Received Quantity 1`, `Received Quantity 2`).

### Perpetuals CSV

| Column | Required | Description |
|---|---|---|
| Date | Yes | `MM/DD/YYYY HH:MM:SS` UTC |
| Asset | Yes | Underlying asset (e.g., BTC) |
| Amount | Yes | Quantity of underlying |
| Fee | No | Fee in payment token |
| P&L | Yes | Net profit/loss (can be negative) |
| Payment Token | Yes | Settlement token (USDC, USDT, USD) |
| Notes | No | Free-text |
| Transaction Hash | No | Tx hash |
| Tag | Yes | `open_position`, `close_position`, or `funding_payment` |

---

## Appendix B -- Example CSV Rows

### Standard: Send 10 USDC (0.001 ETH fee)
```
Date,Received Quantity,Received Currency,Received Fiat Amount,Sent Quantity,Sent Currency,Sent Fiat Amount,Fee Amount,Fee Currency,Transaction Hash,Notes,Tag
01/15/2025 14:30:00,,,, 9.999,USDC,,0.001,ETH,0xabc123...,,
```

### Standard: Receive 10 SOL
```
01/15/2025 14:30:00,10,SOL,,,,,,,0xdef456...,,
```

### Standard: Swap 10 USDC for 1 SOL
```
01/15/2025 14:30:00,1,SOL,,10,USDC,,0.00005,SOL,0x789abc...,,
```

### Standard: LP Add (multi-asset) -- 10 USDC + 1 SOL -> 5 LP tokens
```
01/15/2025 14:30:00,5,USDC-SOL-LP,,,,,,,0xmulti1...,LP Add,
```
(Uses multi-asset template with `Sent Quantity 1`, `Sent Currency 1`, `Sent Quantity 2`, `Sent Currency 2` columns)

### Perpetuals: Open short 2 BTC
```
Date,Asset,Amount,Fee,P&L,Payment Token,Notes,Transaction Hash,Tag
04/01/2024 00:00:00,BTC,2,,0,,,0xperp1...,open_position
```

### Perpetuals: Close short 1 BTC, +20 USDC profit
```
04/02/2024 00:00:00,BTC,1,,20,USDC,,0xperp2...,close_position
```

### Perpetuals: Funding payment +10 USDC
```
04/04/2024 00:00:00,USDC,10,,10,USDC,,0xperp3...,funding_payment
```

---

## References

- [Awaken CSV Format Guide](https://help.awaken.tax/en/articles/10422149-how-to-format-your-csv-for-awaken-tax)
- [Awaken Perpetuals CSV Guide](https://help.awaken.tax/en/articles/10453931-formatting-perpetuals-futures-csvs)
- [Awaken Labels Documentation](https://help.awaken.tax/en/articles/10453755-how-do-i-label-my-transactions)
- [Awaken Supported Integrations](https://awaken.tax/integrations)
