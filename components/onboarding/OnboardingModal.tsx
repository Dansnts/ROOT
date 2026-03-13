"use client";

import { useState } from "react";
import { LS_KEYS } from "@/lib/constants";

const CONSTRAINTS: { id: string; title: string; body: string }[] = [
  {
    id: "password",
    title: "Mon Master Password est irremplaçable",
    body: "C'est la seule clé de déchiffrement de mes données. S'il est perdu ou oublié, mes données deviennent inaccessibles pour toujours. ROOT ne peut pas le réinitialiser.",
  },
  {
    id: "local",
    title: "Mes données restent sur cet appareil",
    body: "ROOT est 100 % local. Aucune donnée n'est envoyée à un serveur. Si l'appareil est perdu, formaté ou cassé sans backup, les données sont perdues.",
  },
  {
    id: "zero-knowledge",
    title: "Personne d'autre ne peut lire mes données",
    body: "Tout est chiffré côté client (AES-GCM 256, PBKDF2 600k). Ni les développeurs de ROOT, ni aucun tiers ne peuvent déchiffrer mon vault.",
  },
  {
    id: "no-recovery",
    title: "Aucun système de récupération de compte",
    body: "Il n'existe ni e-mail de récupération, ni question secrète, ni support pouvant débloquer mon accès. La perte du Master Password est définitive.",
  },
  {
    id: "backup",
    title: "Je dois sauvegarder régulièrement",
    body: "ROOT propose un export backup (Paramètres → Données). C'est ma responsabilité de le faire régulièrement et de le conserver en lieu sûr.",
  },
];

interface Props {
  /** Si true, la modal peut être fermée sans avoir tout coché (mode "relecture" depuis les paramètres) */
  dismissible?: boolean;
  onDone: () => void;
}

export default function OnboardingModal({ dismissible = false, onDone }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDone() {
    try { localStorage.setItem(LS_KEYS.onboardingDone, "1"); } catch {}
    onDone();
  }

  const allChecked = CONSTRAINTS.every((c) => checked.has(c.id));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg tracking-widest text-[var(--accent)] font-mono">ROOT</span>
          </div>
          <h2 className="text-base font-semibold text-[var(--text)]">
            Avant de commencer
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
            ROOT est un espace personnel chiffré. Lisez et cochez chaque point pour confirmer que vous avez compris le fonctionnement et les contraintes.
          </p>
        </div>

        {/* Contraintes */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
          {CONSTRAINTS.map((c) => {
            const isChecked = checked.has(c.id);
            return (
              <label
                key={c.id}
                className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-all select-none ${
                  isChecked
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/8"
                    : "border-[var(--border)] hover:border-[var(--border-light)] bg-[var(--surface-3)]"
                }`}
              >
                {/* Checkbox custom */}
                <div className="shrink-0 mt-0.5">
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                      isChecked
                        ? "bg-[var(--accent)] border-[var(--accent)]"
                        : "border-[var(--border-light)] bg-[var(--surface-2)]"
                    }`}
                  >
                    {isChecked && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path d="M1 4L4 7.5L10 1" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(c.id)}
                    className="sr-only"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-[var(--text)] leading-snug">{c.title}</p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">{c.body}</p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] flex items-center gap-3">
          {dismissible && (
            <button
              onClick={onDone}
              className="text-sm text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors"
            >
              Fermer
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-[var(--text-faint)]">
              {checked.size}/{CONSTRAINTS.length} confirmé{checked.size > 1 ? "s" : ""}
            </span>
            <button
              onClick={handleDone}
              disabled={!allChecked}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-black hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            >
              J&apos;ai compris, continuer →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
