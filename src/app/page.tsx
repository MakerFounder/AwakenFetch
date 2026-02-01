import { getAvailableChains } from "@/lib/adapters";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const chains = getAvailableChains();

  return (
    <main className="flex min-h-screen flex-col items-center justify-start">
      <Dashboard chains={chains} />
    </main>
  );
}
