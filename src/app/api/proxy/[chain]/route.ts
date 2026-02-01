/**
 * Next.js API route proxy for chain explorer APIs.
 *
 * Browser-side fetch calls to external chain APIs are blocked by CORS.
 * This route proxies requests server-side so the client only calls our
 * own origin (same-origin → no CORS issues).
 *
 * Supported chains: bittensor, kaspa, injective, osmosis, ergo, ronin, extended
 *
 * GET /api/proxy/[chain]?address=<addr>&fromDate=<iso>&toDate=<iso>
 *
 * Returns: { transactions: Transaction[] } (dates serialised as ISO strings)
 */

import { type NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters";
import type { FetchOptions, Transaction } from "@/types";

/** Chains whose explorer APIs require a server-side proxy due to CORS. */
const PROXY_ENABLED_CHAINS = new Set(["bittensor", "kaspa", "injective", "osmosis", "ergo", "ronin", "extended"]);

/**
 * Serialise a Transaction for JSON transport.
 * The `date` field is a Date object — convert it to an ISO string.
 */
function serialiseTransaction(
  tx: Transaction,
): Record<string, unknown> {
  return {
    ...tx,
    date: tx.date.toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string }> },
): Promise<NextResponse> {
  const { chain } = await params;

  // Validate chain is proxy-enabled
  if (!PROXY_ENABLED_CHAINS.has(chain)) {
    return NextResponse.json(
      { error: `Chain "${chain}" is not available for proxying.` },
      { status: 400 },
    );
  }

  // Validate chain adapter exists
  const adapter = getAdapter(chain);
  if (!adapter) {
    return NextResponse.json(
      { error: `No adapter found for chain "${chain}".` },
      { status: 404 },
    );
  }

  // Parse query parameters
  const { searchParams } = request.nextUrl;
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "Missing required query parameter: address" },
      { status: 400 },
    );
  }

  // Validate address format
  if (!adapter.validateAddress(address)) {
    return NextResponse.json(
      { error: `Invalid ${adapter.chainName} address format.` },
      { status: 400 },
    );
  }

  // Build fetch options from optional date params
  const options: FetchOptions = {};
  const fromDateStr = searchParams.get("fromDate");
  const toDateStr = searchParams.get("toDate");

  if (fromDateStr) {
    const parsed = new Date(fromDateStr);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid fromDate format. Use ISO 8601." },
        { status: 400 },
      );
    }
    options.fromDate = parsed;
  }

  if (toDateStr) {
    const parsed = new Date(toDateStr);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid toDate format. Use ISO 8601." },
        { status: 400 },
      );
    }
    options.toDate = parsed;
  }

  try {
    const transactions = await adapter.fetchTransactions(address, options);
    return NextResponse.json({
      transactions: transactions.map(serialiseTransaction),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
