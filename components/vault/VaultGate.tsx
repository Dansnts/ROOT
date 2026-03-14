"use client";

import { useEffect, useState, useRef, type FC } from "react";
import { useVaultStore } from "@/stores/vaultStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTheme } from "@/hooks/useTheme";
import { LS_KEYS } from "@/lib/constants";
import { SunIcon, CloudSunIcon, MoonIcon, StarsIcon } from "@/components/ui/icons";
import OnboardingModal from "@/components/onboarding/OnboardingModal";

type Mode = "checking" | "init" | "unlock" | "loading";

// ── Salutations aléatoires par tranche horaire ────────────────────────────────

const GREETINGS: Record<"morning" | "afternoon" | "evening" | "night", string[]> = {
  morning:   ["Bonjour", "Belle matinée", "Bonne journée"],
  afternoon: ["Bon après-midi", "Bonne journée", "Salut"],
  evening:   ["Bonsoir", "Belle soirée", "Bonne soirée"],
  night:     ["Bonne nuit", "Encore debout ?", "Soirée tardive"],
};

const TIME_ICONS: Record<"morning" | "afternoon" | "evening" | "night", FC<{ size?: number }>> = {
  morning:   SunIcon,
  afternoon: CloudSunIcon,
  evening:   MoonIcon,
  night:     StarsIcon,
};

function getTimeSlot(): "morning" | "afternoon" | "evening" | "night" {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 23) return "evening";
  return "night";
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function VaultGate() {
  const { checkVaultExists, initVault, unlock, status } = useVaultStore();
  const { loadSettings, saveUserName } = useSettingsStore();
  useTheme(); // applique data-theme et data-accent depuis localStorage
  const [mode, setMode]           = useState<Mode>("checking");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [nameInput, setNameInput] = useState("");
  const [error, setError]         = useState<string | null>(null);

  // Prénom lu depuis localStorage (disponible avant déchiffrement)
  const [storedName] = useState<string | null>(() => {
    try { return localStorage.getItem("root-username"); } catch { return null; }
  });

  // Greeting fixé au montage (cohérent pendant toute la session de login)
  const [greeting] = useState(() => {
    const slot = getTimeSlot();
    return { text: randomFrom(GREETINGS[slot]), Icon: TIME_ICONS[slot] };
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkVaultExists().then(() => {
      const s = useVaultStore.getState().status;
      const isNew = s === "uninitialized";
      setMode(isNew ? "init" : "unlock");
      if (isNew) {
        try {
          const done = localStorage.getItem(LS_KEYS.onboardingDone);
          if (!done) setShowOnboarding(true);
        } catch {}
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }, [checkVaultExists]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "init" && password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 8) {
      setError("Le Master Password doit faire au moins 8 caractères.");
      return;
    }

    setMode("loading");
    try {
      if (status === "uninitialized") {
        await initVault(password);
        if (nameInput.trim()) await saveUserName(nameInput.trim());
        // isUnlocked passe à true dans le store → page.tsx bascule sur AppShell
      } else {
        const ok = await unlock(password);
        if (!ok) {
          setMode("unlock");
          setError("Mot de passe incorrect.");
          return;
        }
        await loadSettings();
        // isUnlocked passe à true → page.tsx bascule sur AppShell
      }
    } catch {
      setMode(status === "uninitialized" ? "init" : "unlock");
      setError("Une erreur inattendue s'est produite.");
    } finally {
      setPassword("");
      setConfirm("");
    }
  }

  const isLoading = mode === "checking" || mode === "loading";
  const showGreeting = mode === "unlock" && storedName;

  return (
    <>
    {showOnboarding && (
      <OnboardingModal onDone={() => { setShowOnboarding(false); setTimeout(() => inputRef.current?.focus(), 50); }} />
    )}

    {/* ── Atmospheric background ── */}
    <div className="relative flex items-center justify-center min-h-screen bg-[var(--bg)] overflow-hidden">
      <div className="vault-glow" />
      <div className="vault-grid" />
      <div className="vault-scan" />

      {/* ── Card ── */}
      <div className="vault-card relative z-10 w-full max-w-[360px] px-6">

        {/* Greeting / Logo */}
        {showGreeting ? (
          <div className="text-center mb-10">
            <div className="mb-4 flex justify-center text-[var(--text-faint)]">
              <greeting.Icon size={42} />
            </div>
            <h1 className="text-[1.6rem] font-bold text-[var(--text)] leading-tight">
              {greeting.text},{" "}
              <span className="text-[var(--accent)]">{storedName}</span>
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              Entrez votre mot de passe pour continuer
            </p>
          </div>
        ) : (
          <div className="text-center mb-10">
            {/* Logo avec halo bioluminescent */}
            <div className="flex justify-center mb-5">
              <div className="relative">
                {/* Halo externe */}
                <div style={{
                  position: "absolute",
                  inset: -20,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(var(--accent-rgb) / 0.18) 0%, transparent 70%)",
                  animation: "breathe-ring 4s ease-in-out infinite",
                }} />
                {/* Halo proche */}
                <div style={{
                  position: "absolute",
                  inset: -8,
                  borderRadius: "50%",
                  background: "rgba(var(--accent-rgb) / 0.08)",
                  filter: "blur(8px)",
                }} />
                <VaultLogoIcon size={58} />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-[0.22em] text-[var(--accent)] font-mono">
              ROOT
            </h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-2.5 tracking-wide">
              {mode === "init" ? "Créez votre espace sécurisé" : "Déverrouillez votre espace"}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {mode === "init" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-[0.14em]">
                Votre prénom <span className="text-[var(--text-faint)] normal-case opacity-60">(optionnel)</span>
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                disabled={isLoading}
                autoComplete="given-name"
                placeholder="Ex : Alice"
                className="vault-input w-full px-4 py-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--text-faint)] disabled:opacity-40"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-[0.14em]">
              Master Password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete={mode === "init" ? "new-password" : "current-password"}
              className="vault-input w-full px-4 py-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--text-faint)] disabled:opacity-40 font-mono tracking-widest"
              placeholder="••••••••••••"
            />
          </div>

          {mode === "init" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-[0.14em]">
                Confirmer
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isLoading}
                autoComplete="new-password"
                className="vault-input w-full px-4 py-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--text-faint)] disabled:opacity-40 font-mono tracking-widest"
                placeholder="••••••••••••"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--danger)]/8 border border-[var(--danger)]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />
              <p className="text-sm text-[var(--danger)]">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="vault-btn mt-1 w-full py-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-light)] text-[var(--text)] font-medium text-sm disabled:opacity-35 disabled:cursor-not-allowed font-mono tracking-wide"
          >
            {mode === "loading" ? (
              <span className="flex items-center justify-center gap-2.5">
                <Spinner />
                {status === "uninitialized" ? "Initialisation…" : "Déverrouillage…"}
              </span>
            ) : mode === "init" ? (
              "Créer le vault →"
            ) : (
              "Déverrouiller →"
            )}
          </button>
        </form>

        {/* Zero-knowledge badge */}
        <div className="mt-9 flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <p className="text-[10px] text-[var(--text-faint)] font-mono whitespace-nowrap tracking-wider">
            zero-knowledge · aes-gcm-256 · pbkdf2-600k
          </p>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

      </div>
    </div>
    </>
  );
}

// ── Logo SVG pour VaultGate (version grande avec accent) ──────────────────────
function VaultLogoIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L12 21" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 8 Q8 6 6 9"  stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M12 12 Q17 10 19 13" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M12 16 Q8 14 7 17" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}
