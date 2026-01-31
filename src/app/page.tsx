import { getAvailableChains } from "@/lib/adapters";
import { WalletForm } from "@/components/WalletForm";

export default function Home() {
  const chains = getAvailableChains();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="flex w-full max-w-xl flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">AwakenFetch</h1>
          <p className="mt-2 text-base text-foreground/70">
            Fetch crypto transactions and export Awaken Tax-compliant CSVs
          </p>
        </div>
        <WalletForm chains={chains} />
      </div>
    </main>
  );
}
