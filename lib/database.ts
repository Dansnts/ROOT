/**
 * database.ts
 *
 * Schéma Dexie.js (IndexedDB) pour ROOT.
 *
 * PRINCIPES DE SÉCURITÉ DU SCHÉMA :
 *  - Seuls les champs insensibles (IDs, types, timestamps, flags) sont indexés.
 *    Dexie ne peut pas indexer un EncryptedPayload opaque → aucune fuite de
 *    structure dans les index du moteur de stockage.
 *  - Tout contenu applicatif (titres, texte, propriétés, credentials) est
 *    stocké exclusivement sous forme EncryptedPayload.
 *  - Les tables sont versionnées : les migrations futures doivent re-chiffrer
 *    les données si le schéma change.
 */

import _DexieImport from "dexie";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Dexie = _DexieImport as any as { new(name: string): { version(n: number): { stores(s: Record<string, string>): void }; open(): Promise<void> }; semVer: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Table<T = any, K = any> {
  get(key: K): Promise<T | undefined>;
  put(item: T): Promise<K>;
  add(item: T): Promise<K>;
  update(key: K, changes: Partial<T>): Promise<number>;
  delete(key: K): Promise<void>;
  toArray(): Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter(fn: (item: T) => boolean): QueryChain<T, K>;
  where(index: string): WhereClause<T, K>;
  bulkAdd(items: T[]): Promise<K>;
  bulkPut(items: T[]): Promise<K>;
  clear(): Promise<void>;
  count(): Promise<number>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface WhereClause<T = any, K = any> {
  equals(val: K | string | number): QueryChain<T, K>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  between(lower: any, upper: any): QueryChain<T, K>;
  anyOf(keys: (K | string | number)[]): QueryChain<T, K>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface QueryChain<T = any, K = any> {
  toArray(): Promise<T[]>;
  filter(fn: (item: T) => boolean): QueryChain<T, K>;
  count(): Promise<number>;
  modify(changes: Partial<T> | ((item: T) => void)): Promise<number>;
  delete(): Promise<number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  primaryKeys(): Promise<any[]>;
}
import type { EncryptedPayload } from "./VaultService";

// ── Énumérations ──────────────────────────────────────────────────────────────

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet_list"
  | "ordered_list"
  | "list_item"
  | "code"
  | "quote"
  | "callout"
  | "divider"
  | "image"
  | "embed"
  | "task"           // Kanban card / Todo item
  | "calendar-event"; // Calendar-only event (not shown in Kanban)

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

// ── Types des enregistrements ─────────────────────────────────────────────────

/**
 * Métadonnées du vault (non sensible sauf verifier).
 * Singleton : id = 1, toujours.
 */
export interface VaultMeta {
  id: 1;
  /** Salt PBKDF2 (256 bits) — en base64, NON secret, nécessaire pour re-dériver */
  salt: string;
  /** Chiffrement de la constante sentinelle : prouve que le MDP est correct */
  verifier: EncryptedPayload;
  schemaVersion: number;
  createdAt: number;
}

/**
 * Page / Document ROOT.
 * Une page est un conteneur ordonné de Block.
 * Son titre et son icône sont chiffrés.
 */
export interface PageRecord {
  /** UUID v4 — en clair (FK pour les blocs, routing interne) */
  id: string;
  /** UUID du parent, null si page racine */
  parentId: string | null;
  /** Titre chiffré */
  encryptedTitle: EncryptedPayload;
  /** Emoji ou URL d'icône — chiffré */
  encryptedIcon?: EncryptedPayload;
  /** URL de couverture — chiffrée */
  encryptedCover?: EncryptedPayload;
  /** Ordre parmi les siblings (entier, pour tri) */
  order: number;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  /** Soft-delete : la page est cachée mais non supprimée du stockage */
  isDeleted: boolean;
  /** Dossier : conteneur sans contenu éditeur, sert à regrouper des pages */
  isFolder?: boolean;
  /** IDs des tags assignés (en clair — les UUIDs ne révèlent pas les noms) */
  tagIds?: string[];
}

/**
 * Bloc atomique de contenu ROOT.
 * L'unité minimale de chiffrement.
 *
 * encryptedContent contient le JSON sérialisé du contenu TipTap du bloc.
 * encryptedProperties contient les métadonnées spécifiques au type :
 *   - task   → { status, priority, dueDate, tags, assignee }
 *   - code   → { language }
 *   - image  → { url, alt, width }
 *   - callout → { emoji, color }
 */
export interface BlockRecord {
  /** UUID v4 */
  id: string;
  /** FK → PageRecord.id */
  pageId: string;
  /** FK → BlockRecord.id (pour imbrication : listes, toggle…) */
  parentBlockId: string | null;
  /** Type du bloc — en clair (nécessaire pour le rendu sans déchiffrer) */
  type: BlockType;
  /** Contenu TipTap sérialisé en JSON, puis chiffré */
  encryptedContent: EncryptedPayload;
  /** Propriétés métier sérialisées en JSON, puis chiffrées */
  encryptedProperties: EncryptedPayload;
  /** Position du bloc dans la page / le parent */
  order: number;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  /** IDs des tags (en clair, pour filtrage sans déchiffrement) */
  tagIds?: string[];
}

/**
 * Paramètre de configuration générique (clé / valeur chiffrée).
 *
 * Clés réservées :
 *   caldav_config      → { serverUrl, username, encryptedPassword }
 *   ui_preferences     → { theme, sidebarWidth, defaultView }
 *   kanban_columns     → [ { id, label, order } ]
 */
export interface SettingRecord {
  /** Identifiant du paramètre — en clair */
  key: string;
  /** Valeur JSON sérialisée, puis chiffrée */
  encryptedValue: EncryptedPayload;
  updatedAt: number;
}

// ── Classe Dexie ──────────────────────────────────────────────────────────────

class OnyxDatabase extends Dexie {
  vault_meta!: Table<VaultMeta, number>;
  pages!: Table<PageRecord, string>;
  blocks!: Table<BlockRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super("root_vault");

    /**
     * Version 1 — schéma initial.
     *
     * Règle d'index : on n'indexe QUE les champs en clair utilisés pour
     * filtrer/trier. Les EncryptedPayload sont JAMAIS indexés (ils sont
     * opaques et non comparables de façon significative).
     *
     * Syntaxe Dexie :
     *   'id'          → clé primaire (non auto-incrémentée)
     *   '++id'        → clé primaire auto-incrémentée
     *   'field'       → index secondaire unique non-unique
     *   '[a+b]'       → index composite
     */
    this.version(1).stores({
      vault_meta: "id",

      pages: [
        "id",           // PK
        "parentId",     // navigation arborescente
        "order",        // tri des siblings
        "createdAt",
        "updatedAt",
        "isDeleted",    // filtre soft-delete
      ].join(", "),

      blocks: [
        "id",           // PK
        "pageId",       // récupération de tous les blocs d'une page
        "parentBlockId",// récupération des blocs enfants
        "type",         // filtre par type (ex : toutes les Tasks pour Kanban)
        "[pageId+order]", // index composite : blocs d'une page triés
        "createdAt",
        "updatedAt",
        "isDeleted",
      ].join(", "),

      settings: [
        "key",          // PK
        "updatedAt",
      ].join(", "),
    });
  }
}

// Singleton — une seule connexion IndexedDB par onglet
export const db = new OnyxDatabase();

// ── Helpers typés ─────────────────────────────────────────────────────────────

/**
 * Définition d'un tag utilisateur.
 * Stocké chiffré dans settings["app_tags"] sous forme de tableau JSON.
 */
export interface TagDefinition {
  id: string;
  name: string;
  /** Couleur hex (#RRGGBB) */
  color: string;
  createdAt: number;
}

/**
 * Propriétés d'un bloc de type 'task' (stockées dans encryptedProperties).
 * À sérialiser en JSON avant chiffrement.
 */
export interface TaskProperties {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string; // ISO 8601
  tags?: string[];
  caldavEventId?: string; // FK vers un événement CalDAV synchronisé
}

/**
 * Catégorie de calendrier (anciennement liée à une page ROOT).
 * Stockée dans settings["calendar_categories"].
 */
export interface CalendarCategory {
  id: string;
  name: string;
  /** Couleur hex (#RRGGBB) */
  color: string;
}

/**
 * Un calendrier CalDAV configuré, avec son mode d'affichage dans ROOT.
 */
export interface CalendarEntry {
  /** URL complète du calendrier sur le serveur CalDAV */
  url: string;
  /** Nom affiché (displayname du serveur ou personnalisé) */
  displayName: string;
  /** Couleur hex optionnelle (#RRGGBB) */
  color?: string;
  /**
   * Mode d'affichage dans ROOT :
   *   "calendar" → les événements vont dans la vue Calendrier (blocs calendar-event)
   *   "kanban"   → les événements vont dans le Kanban (blocs task)
   */
  mode: "calendar" | "kanban";
  /** Catégorie cible (UUID) — remplace targetPageId */
  categoryId?: string;
  /** @deprecated Utiliser categoryId. Conservé pour migration automatique. */
  targetPageId?: string;
}

/**
 * Configuration CalDAV stockée dans settings['caldav_config'].
 * L'objet entier est sérialisé en JSON puis chiffré via encryptValue()
 * avant d'être stocké dans IndexedDB — le password n'est donc jamais
 * en clair sur disque. Il est déchiffré en RAM uniquement lors des
 * requêtes réseau CalDAV.
 */
export interface CalDAVConfig {
  /** URL de base du serveur (ex: https://caldav.infomaniak.com/calendars/user/) */
  serverUrl: string;
  username: string;
  /** Mot de passe CalDAV — protégé par le chiffrement de l'enveloppe settings */
  password: string;
  /** Calendriers configurés avec leur mode et page cible */
  calendars: CalendarEntry[];
  lastSyncAt?: number;
}
