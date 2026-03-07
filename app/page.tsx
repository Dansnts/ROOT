"use client";

import dynamic from "next/dynamic";
import { useVaultStore } from "@/stores/vaultStore";

const VaultGate = dynamic(() => import("@/components/vault/VaultGate"), { ssr: false });
const AppShell  = dynamic(() => import("@/components/layout/AppShell"),  { ssr: false });

export default function Home() {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  return isUnlocked ? <AppShell /> : <VaultGate />;
}
