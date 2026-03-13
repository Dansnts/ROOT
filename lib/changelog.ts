/**
 * changelog.ts
 *
 * Source unique de vérité pour le numéro de version et l'historique des
 * modifications. Pour publier une nouvelle version :
 *   1. Ajouter une entrée en tête du tableau RELEASES
 *   2. Mettre à jour APP_VERSION
 *   3. Mettre à jour "version" dans package.json (même valeur)
 *   4. `git tag v<version>` puis `git push origin v<version>`
 */

export const APP_VERSION = "1.2.4";

export type ReleaseType = "feat" | "fix" | "perf" | "chore";

export interface ChangeEntry {
  type: ReleaseType;
  text: string;
}

export interface Release {
  version: string;
  date: string;         // ISO YYYY-MM-DD
  changes: ChangeEntry[];
}

export const RELEASES: Release[] = [
  {
    version: "1.2.4",
    date: "2026-03-13",
    changes: [
      { type: "feat", text: "Éditeur : largeur 90 %, centrage dynamique (ResizeObserver, s'adapte à la sidebar)" },
      { type: "feat", text: "Éditeur : hub flottant visible au survol avec animation pop depuis le bas" },
      { type: "feat", text: "Éditeur : clic droit = menu contextuel avec toutes les options slash-command + actions tableau" },
      { type: "feat", text: "App : suppression du menu contextuel natif du navigateur" },
      { type: "feat", text: "Backup export : choix du contenu (Pages & blocs / Paramètres)" },
      { type: "feat", text: "Backup import : mode Écraser ou Fusionner, avec choix du contenu à importer" },
    ],
  },
  {
    version: "1.2.3",
    date: "2026-03-11",
    changes: [
      { type: "feat", text: "Calendrier : filtres de visibilité par catégorie (toggle live sur les événements)" },
      { type: "feat", text: "Calendrier : popover '+X en plus' remplacé par un panel custom propre et cliquable" },
      { type: "feat", text: "Sidebar DnD : dépôt avant/après les dossiers pour remonter à la racine" },
    ],
  },
  {
    version: "1.2.2",
    date: "2026-03-11",
    changes: [
      { type: "chore", text: "Suppression du logo image au démarrage (remplacé par wordmark texte)" },
      { type: "chore", text: "Suppression de l'onglet Nouveautés dans les paramètres" },
    ],
  },
  {
    version: "1.2.1",
    date: "2026-03-10",
    changes: [
      {
        type: "feat",
        text: "Vue Statistiques : radar chart d'urgence par tag (score pondéré), tableau des rendus de la semaine, compteurs de priorités globaux et filtrables par tag.",
      },
      {
        type: "feat",
        text: "Avatar utilisateur : recadrage interactif (react-easy-crop) avec zoom, forme circulaire et aperçu en temps réel. Les ObjectURLs temporaires sont libérés immédiatement après confirmation ou annulation.",
      },
      {
        type: "feat",
        text: "Confirmation du Master Password avant le téléchargement du backup JSON.",
      },
      {
        type: "fix",
        text: "Drawers (événement, tâche Kanban, changelog) : animation de fermeture slide vers la droite désormais visible avant le démontage du composant.",
      },
      {
        type: "fix",
        text: "Date picker (react-day-picker v9) : boutons ‹ › ne débordent plus hors du conteneur — positionnement corrigé avec relative sur la racine et nav en absolute.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-03-09",
    changes: [
      {
        type: "feat",
        text: "Avatar utilisateur dans la sidebar : un bouton circulaire avec les initiales remplace les trois anciens boutons. Le menu déroulant regroupe le changement de thème, les paramètres et le verrouillage.",
      },
      {
        type: "feat",
        text: "Changelog intégré : cliquer sur le numéro de version en bas de la sidebar ouvre un panneau latéral avec l'historique complet des versions et un lien vers le dépôt GitHub.",
      },
      {
        type: "feat",
        text: "Vue Jour dans le Calendrier : nouveau bouton d'affichage quotidien via FullCalendar timeGridDay, en plus des vues Mois et Liste.",
      },
      {
        type: "fix",
        text: "Centrage du titre du calendrier : les colonnes gauche et droite du header prennent la même largeur flexible, assurant un centrage réel du titre.",
      },
      {
        type: "feat",
        text: "Migration complète vers les SVGs : tous les emojis et caractères Unicode décoratifs remplacés par des icônes SVG centralisées (icons.tsx) dans l'ensemble de l'application.",
      },
      {
        type: "chore",
        text: "Bouton de masquage de la sidebar repositionné en haut de page, aligné avec les headers des vues.",
      },
    ],
  },
  {
    version: "1.0.4",
    date: "2026-03-09",
    changes: [
      {
        type: "feat",
        text: "Notifications toast (Sonner) : confirmations visuelles pour chaque création, sauvegarde ou suppression d'élément.",
      },
      {
        type: "feat",
        text: "Menu contextuel (clic droit) sur les pages de la sidebar (renommer, nouvelle sous-page, supprimer) et sur les cartes Kanban (modifier, supprimer).",
      },
      {
        type: "feat",
        text: "Panneau latéral droit (Drawer) : les modales de tâche Kanban et d'événement Calendrier s'ouvrent désormais en glissant depuis la droite.",
      },
      {
        type: "feat",
        text: "Sélecteur de date visuel (react-day-picker) pour les échéances des tâches Kanban et les dates des événements Calendrier.",
      },
      {
        type: "feat",
        text: "Fil d'Ariane (breadcrumb) au-dessus des pages pour naviguer rapidement vers les dossiers parents.",
      },
    ],
  },
  {
    version: "1.0.3",
    date: "2026-03-09",
    changes: [
      {
        type: "feat",
        text: "Barre de filtres dans le Kanban : tri manuel, par date d'échéance ou par priorité, filtres par niveau de priorité et par tags, réinitialisation en un clic.",
      },
    ],
  },
  {
    version: "1.0.2",
    date: "2026-03-09",
    changes: [
      {
        type: "feat",
        text: "Les tâches Kanban avec une échéance apparaissent dans le Calendrier sous une catégorie virtuelle Kanban, visible automatiquement dans le sous-menu dès qu'une tâche a une date.",
      },
      {
        type: "fix",
        text: "Les notes d'une tâche Kanban sont maintenant correctement sauvegardées et rechargées. Le champ utilisait un nom différent de celui du système CalDAV, les deux sont unifiés sous description.",
      },
      {
        type: "fix",
        text: "La modification d'une tâche Kanban ne supprime plus les métadonnées CalDAV associées comme l'identifiant de synchronisation et l'URL distante.",
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-03-09",
    changes: [
      {
        type: "fix",
        text: "Correction critique : le contenu de l'éditeur n'était pas sauvegardé lors du changement de page. Les opérations de chiffrement s'exécutaient à l'intérieur de la transaction IndexedDB, provoquant un auto-commit prématuré avant l'écriture des blocs.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-01-01",
    changes: [
      { type: "feat", text: "Lancement initial de ROOT — éditeur de notes chiffré zéro-connaissance." },
      { type: "feat", text: "Kanban avec colonnes personnalisables, priorités et dates d'échéance." },
      { type: "feat", text: "Calendrier avec synchronisation CalDAV (Infomaniak, iCloud, Nextcloud…)." },
      { type: "feat", text: "Système de Tags : créer, assigner et visualiser les tags sur pages, dossiers et tâches." },
      { type: "feat", text: "Export/import de sauvegarde chiffrée portable entre vaults." },
      { type: "feat", text: "Thème clair/sombre, sidebar collapsible, drag-and-drop dans l'arbre de pages." },
      { type: "feat", text: "Chiffrement AES-GCM 256 bits, dérivation PBKDF2 600 000 itérations." },
    ],
  },
];
