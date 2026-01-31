"use client";

import { useEffect, useRef } from "react";

interface ChainHelpEntry {
  chainName: string;
  ticker: string;
  instructions: string;
  examplePrefix: string;
}

const chainHelpEntries: ChainHelpEntry[] = [
  {
    chainName: "Bittensor",
    ticker: "TAO",
    instructions:
      'Open the Bittensor wallet (e.g. Bittensor Wallet extension or polkadot.js). Your address starts with "5" and is 48 characters long (SS58 format).',
    examplePrefix: "5F3sa2TJ\u2026",
  },
  {
    chainName: "Kaspa",
    ticker: "KAS",
    instructions:
      'Open your Kaspa wallet (e.g. KDX or Kaspa Web Wallet). Your address starts with "kaspa:" followed by a long alphanumeric string.',
    examplePrefix: "kaspa:qqkq\u2026",
  },
  {
    chainName: "Injective",
    ticker: "INJ",
    instructions:
      'Open your Injective-compatible wallet (e.g. Keplr, Leap, or Ninji). Your address starts with "inj1" and is a bech32-encoded string.',
    examplePrefix: "inj1abc\u2026",
  },
];

export interface ChainHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChainHelpModal({ open, onClose }: ChainHelpModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    } else {
      if (typeof dialog.close === "function") {
        dialog.close();
      }
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleClose() {
      onClose();
    }

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-md rounded-xl border border-foreground/20 bg-background p-0 shadow-lg backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Finding Your Wallet Address
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help modal"
            className="cursor-pointer rounded-md p-1 text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M15 5L5 15M5 5l10 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {chainHelpEntries.map((entry) => (
            <div
              key={entry.ticker}
              className="rounded-lg border border-foreground/10 p-3"
            >
              <p className="text-sm font-medium text-foreground">
                {entry.chainName} ({entry.ticker})
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/70">
                {entry.instructions}
              </p>
              <p className="mt-1.5 text-xs text-foreground/50">
                Example: <code className="font-mono">{entry.examplePrefix}</code>
              </p>
            </div>
          ))}
        </div>

        <p className="text-xs text-foreground/50">
          Only public wallet addresses are needed — never share your private
          keys or seed phrases.
        </p>
      </div>
    </dialog>
  );
}
