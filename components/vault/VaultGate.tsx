"use client";

import { useEffect, useState, useRef } from "react";
import { useVaultStore } from "@/stores/vaultStore";
import { useSettingsStore } from "@/stores/settingsStore";

type Mode = "checking" | "init" | "unlock" | "loading";

// ── Salutations aléatoires par tranche horaire ────────────────────────────────

const GREETINGS: Record<"morning" | "afternoon" | "evening" | "night", string[]> = {
  morning:   ["Bonjour", "Belle matinée", "Bonne journée"],
  afternoon: ["Bon après-midi", "Bonne journée", "Salut"],
  evening:   ["Bonsoir", "Belle soirée", "Bonne soirée"],
  night:     ["Bonne nuit", "Encore debout ?", "Soirée tardive"],
};

const EMOJIS: Record<"morning" | "afternoon" | "evening" | "night", string> = {
  morning:   "☀️",
  afternoon: "🌤️",
  evening:   "🌙",
  night:     "🌃",
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

  const [mode, setMode]           = useState<Mode>("checking");
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
    return { text: randomFrom(GREETINGS[slot]), emoji: EMOJIS[slot] };
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkVaultExists().then(() => {
      const s = useVaultStore.getState().status;
      setMode(s === "uninitialized" ? "init" : "unlock");
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
    <div className="flex items-center justify-center min-h-screen bg-[var(--bg)]">
      <div className="w-full max-w-sm px-4">

        {/* Greeting — visible sur l'écran de déverrouillage si prénom connu */}
        {showGreeting ? (
          <div className="text-center mb-10">
            <div className="text-4xl mb-3">{greeting.emoji}</div>
            <h1 className="text-2xl font-bold text-[var(--text)]">
              {greeting.text},{" "}
              <span className="text-[var(--accent)]">{storedName}</span>
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              Entrez votre mot de passe pour continuer
            </p>
          </div>
        ) : (
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold tracking-widest text-[var(--accent)] font-mono">ROOT</h1>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              {mode === "init" ? "Créez votre espace sécurisé" : "Déverrouillez votre espace"}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">

          {/* Prénom — uniquement à l'initialisation */}
          {mode === "init" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">
                Votre prénom <span className="text-[var(--text-faint)] normal-case">(optionnel)</span>
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                disabled={isLoading}
                autoComplete="given-name"
                placeholder="Ex : Alice"
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">
              Master Password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete={mode === "init" ? "new-password" : "current-password"}
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40 font-mono tracking-wider"
              placeholder="••••••••••••"
            />
          </div>

          {mode === "init" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-widest">
                Confirmer
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={isLoading}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40 font-mono tracking-wider"
                placeholder="••••••••••••"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-[var(--danger)] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="mt-1 w-full py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border-light)] text-[var(--text)] font-medium text-sm hover:bg-[var(--surface-3)] hover:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mode === "loading" ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                {status === "uninitialized" ? "Initialisation…" : "Déverrouillage…"}
              </span>
            ) : mode === "init" ? (
              "Créer le vault"
            ) : (
              "Déverrouiller"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-faint)] mt-8 leading-relaxed font-mono">
          Zero-Knowledge · AES-GCM 256 · PBKDF2 600k
        </p>
      </div>
    </div>
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
