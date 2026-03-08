"use client";

import { useState } from "react";
import Image from "next/image";
import { useTheme } from "@/hooks/useTheme";

// ── Contenu ────────────────────────────────────────────────────────────────────

interface HelpSection {
  id: string;
  label: string;
  icon: string;
  intro: string;
  tips: string[];
  genSays: string;
}

const SECTIONS: HelpSection[] = [
  {
    id: "notes",
    label: "Notes & Pages",
    icon: "📝",
    intro: "Crée, organise et édite tes pages dans un arbre hiérarchique chiffré.",
    tips: [
      "Clique sur « + Page » en bas de la sidebar pour créer une page.",
      "Crée des dossiers pour regrouper tes pages (ils n'ont pas de contenu éditeur).",
      "Fais glisser une page dans la sidebar pour la réorganiser.",
      "Tape « / » dans l'éditeur pour ouvrir le menu de blocs (titres, listes, tableau, image…).",
      "Sélectionne du texte pour afficher la barre de formatage flottante (gras, lien, surlignage…).",
      "Le titre de la page est modifiable directement en haut de l'éditeur.",
      "Les pages supprimées vont dans la corbeille et peuvent être restaurées.",
    ],
    genSays: "Tape « / » n'importe où dans une page pour que je te montre tous les blocs disponibles !",
  },
  {
    id: "kanban",
    label: "Kanban",
    icon: "📋",
    intro: "Gère tes tâches en colonnes — À faire, En cours, Terminé, Annulé.",
    tips: [
      "Clique sur « + » dans une colonne pour créer une tâche rapidement.",
      "Fais glisser une carte pour la déplacer entre les colonnes.",
      "Clique sur une carte pour l'ouvrir et ajouter une description, priorité ou tags.",
      "Les tags colorés apparaissent comme bordure gauche sur la carte.",
      "Si une tâche a une date d'échéance, elle apparaît aussi dans le Calendrier.",
      "Plusieurs tags → couleur neutre grise sur la carte et dans le calendrier.",
    ],
    genSays: "Les tâches Kanban sont indépendantes des pages — elles vivent dans leur propre espace !",
  },
  {
    id: "calendar",
    label: "Calendrier",
    icon: "📅",
    intro: "Visualise tes événements et synchronise un agenda CalDAV (Infomaniak, iCloud, Fastmail…).",
    tips: [
      "Clique sur un jour du calendrier pour créer un événement.",
      "Fais glisser un événement pour changer sa date.",
      "Clique sur une catégorie dans l'en-tête pour voir tous ses événements.",
      "Configure CalDAV dans Paramètres → CalDAV pour synchroniser ton agenda.",
      "Chaque calendrier CalDAV est lié à une catégorie colorée.",
      "Les événements sans catégorie connue apparaissent dans « Sans catégorie ».",
      "Les pastilles de tags sur les événements viennent des tâches Kanban.",
    ],
    genSays: "La sync CalDAV est bidirectionnelle — les événements créés ici remontent sur ton serveur !",
  },
  {
    id: "tags",
    label: "Tags",
    icon: "🏷️",
    intro: "Crée des tags colorés et assigne-les à tes pages, tâches et événements.",
    tips: [
      "Crée un tag depuis la vue Tags ou depuis l'éditeur de tâche.",
      "Chaque tag a un nom et une couleur personnalisable.",
      "Les tags s'affichent en pastilles sur les pages, cartes Kanban et événements.",
      "Filtre les tâches par tag depuis la vue Tags.",
      "Un tag supprimé est retiré de tous les éléments qui l'utilisaient.",
    ],
    genSays: "Les tags sont le meilleur moyen de relier tes notes, tâches et événements entre eux !",
  },
  {
    id: "export",
    label: "Export & Import",
    icon: "↕️",
    intro: "Exporte tes notes en Markdown ou fais un backup complet de toutes tes données.",
    tips: [
      "Export Markdown (Paramètres → Export MD) : 4 formats disponibles.",
      "ZIP — un fichier .md par page dans une archive.",
      "Fichier unique — toutes les pages concaténées.",
      "Fichiers séparés — un téléchargement par page.",
      "Dossier — enregistre directement dans un dossier (Chrome/Edge uniquement).",
      "Backup JSON (Paramètres → Données) — exporte tout, portable entre vaults.",
      "Le backup JSON est déchiffré à l'export et ré-chiffré à l'import avec ton vault courant.",
    ],
    genSays: "Le backup JSON est portable — tu peux l'importer dans un nouveau vault avec un mot de passe différent !",
  },
  {
    id: "trash",
    label: "Corbeille",
    icon: "🗑️",
    intro: "Les pages supprimées ne disparaissent pas immédiatement — elles vont d'abord dans la corbeille.",
    tips: [
      "Accède à la corbeille depuis la sidebar (icône poubelle en bas).",
      "Restaure une page pour la remettre à sa position d'origine.",
      "Supprime définitivement une page pour libérer de l'espace.",
      "Les sous-pages d'une page supprimée sont aussi déplacées dans la corbeille.",
    ],
    genSays: "Rien n'est perdu tant que tu n'as pas cliqué sur « Supprimer définitivement » !",
  },
  {
    id: "vault",
    label: "Vault & Sécurité",
    icon: "🔒",
    intro: "Toutes tes données sont chiffrées avec AES-256-GCM. Ton mot de passe ne quitte jamais ton appareil.",
    tips: [
      "Le mot de passe n'est jamais stocké — il dérive la clé de chiffrement en mémoire.",
      "Verrouille avec le cadenas en haut de la sidebar (ou ferme l'onglet).",
      "Si tu oublies ton mot de passe, tu devras réinitialiser via IndexedDB (DevTools → Application → IndexedDB).",
      "Le backup JSON est déchiffré — garde-le dans un endroit sûr.",
      "Le chiffrement est zero-knowledge : même l'hébergeur ne peut pas lire tes données.",
    ],
    genSays: "Je veille sur tes données 🐾 — mais garde bien ton mot de passe, je ne peux pas le récupérer !",
  },
];

// ── Composant ──────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export default function HelpModal({ onClose }: Props) {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const { theme } = useTheme();
  const section = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  // a.png = panda vert (dark), a2.png = panda orange (light)
  const genSrc = theme === "dark" ? "/pictures/a.png" : "/pictures/a2.png";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[58rem] bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0">
          <span className="text-sm font-semibold text-[var(--text)]">Aide — Gen te guide</span>
          <span className="text-xs text-[var(--text-faint)]">根 · racine</span>
          <button onClick={onClose} className="ml-auto text-[var(--text-faint)] hover:text-[var(--text-muted)]">✕</button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left — categories */}
          <div className="w-48 shrink-0 border-r border-[var(--border)] flex flex-col py-3 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
                  activeId === s.id
                    ? "bg-[var(--surface-3)] text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                }`}
              >
                <span className="text-base">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          {/* Right — content */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

            {/* Title + intro */}
            <div>
              <h3 className="text-base font-semibold text-[var(--text)] mb-1">
                {section.icon} {section.label}
              </h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {section.intro}
              </p>
            </div>

            {/* Tips */}
            <ul className="flex flex-col gap-2">
              {section.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-muted)]">
                  <span className="mt-0.5 text-[var(--accent)] shrink-0 text-xs">▸</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>

            {/* Gen speech bubble */}
            <div className="mt-auto pt-4 flex items-end gap-4">
              {/* Bubble */}
              <div className="flex-1 relative bg-[var(--surface-3)] border border-[var(--border-light)] rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="text-sm text-[var(--text)] italic leading-relaxed">
                  « {section.genSays} »
                </p>
                {/* Tail */}
                <span className="absolute -bottom-2 left-4 w-3 h-3 bg-[var(--surface-3)] border-b border-r border-[var(--border-light)] rotate-45" />
              </div>

              {/* Gen */}
              <div className="shrink-0 flex flex-col items-center gap-1 select-none">
                <Image
                  src={genSrc}
                  alt="Gen"
                  width={80}
                  height={80}
                  className="object-contain"
                  style={{ imageRendering: "pixelated" }}
                  unoptimized
                />
                <span className="text-[10px] text-[var(--text-faint)] tracking-widest font-mono">GEN</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
