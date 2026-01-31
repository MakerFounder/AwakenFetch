/**
 * Streaming API route for chain explorer APIs.
 *
 * Uses NDJSON (newline-delimited JSON) to stream transaction batches
 * as they are fetched from chain adapters. This enables incremental
 * display for wallets with large numbers of transactions (> 5,000).
 *
 * GET /api/proxy/[chain]/stream?address=<addr>&fromDate=<iso>&toDate=<iso>
 *
 * Streams NDJSON lines:
 *   { "type": "batch", "transactions": [...] }   — a batch of transactions
 *   { "type": "done", "total": number }           — final message with total count
 *   { "type": "error", "error": string }          — error during fetch
 */

import { type NextRequest } from "next/server";
import { getAdapter } from "@/lib/adapters";
import type { FetchOptions, Transaction } from "@/types";

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
): Promise<Response> {
  const { chain } = await params;

  // Validate chain adapter exists
  const adapter = getAdapter(chain);
  if (!adapter) {
    return new Response(
      JSON.stringify({ error: `No adapter found for chain "${chain}".` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Parse query parameters
  const { searchParams } = request.nextUrl;
  const address = searchParams.get("address");

  if (!address) {
    return new Response(
      JSON.stringify({ error: "Missing required query parameter: address" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate address format
  if (!adapter.validateAddress(address)) {
    return new Response(
      JSON.stringify({ error: `Invalid ${adapter.chainName} address format.` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Build fetch options from optional date params
  const options: FetchOptions = {};
  const fromDateStr = searchParams.get("fromDate");
  const toDateStr = searchParams.get("toDate");

  if (fromDateStr) {
    const parsed = new Date(fromDateStr);
    if (Number.isNaN(parsed.getTime())) {
      return new Response(
        JSON.stringify({ error: "Invalid fromDate format. Use ISO 8601." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    options.fromDate = parsed;
  }

  if (toDateStr) {
    const parsed = new Date(toDateStr);
    if (Number.isNaN(parsed.getTime())) {
      return new Response(
        JSON.stringify({ error: "Invalid toDate format. Use ISO 8601." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    options.toDate = parsed;
  }

  // Create a readable stream that pushes NDJSON lines
  const encoder = new TextEncoder();
  let totalSent = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Set up onProgress callback for streaming batches
        options.onProgress = (batch: Transaction[]) => {
          if (batch.length === 0) return;
          const line = JSON.stringify({
            type: "batch",
            transactions: batch.map(serialiseTransaction),
          });
          controller.enqueue(encoder.encode(line + "\n"));
          totalSent += batch.length;
        };

        // Fetch all transactions — onProgress will stream batches as they arrive
        const transactions = await adapter.fetchTransactions(address, options);

        // If the adapter didn't call onProgress (no streaming support),
        // send all transactions as a single batch
        if (totalSent === 0 && transactions.length > 0) {
          const line = JSON.stringify({
            type: "batch",
            transactions: transactions.map(serialiseTransaction),
          });
          controller.enqueue(encoder.encode(line + "\n"));
          totalSent = transactions.length;
        }

        // Send the final done message with total count
        const doneLine = JSON.stringify({
          type: "done",
          total: transactions.length,
        });
        controller.enqueue(encoder.encode(doneLine + "\n"));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";
        const errorLine = JSON.stringify({
          type: "error",
          error: message,
        });
        controller.enqueue(encoder.encode(errorLine + "\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
