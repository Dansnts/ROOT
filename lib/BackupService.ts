/**
 * BackupService.ts
 *
 * JSON backup export and import for the entire ROOT vault.
 * Data is decrypted before export (portable between vaults)
 * and re-encrypted with the current vault key on import.
 */

import Dexie from "dexie";
import { db, type PageRecord, type BlockRecord, type SettingRecord } from "./database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BackupSelection {
  /** Pages, dossiers et tous les blocs (notes, tâches, événements) */
  pages: boolean;
  /** Paramètres : nom, avatar, thème, tags, colonnes Kanban, CalDAV… */
  settings: boolean;
}

export interface ImportOptions {
  mode: "overwrite" | "merge";
  selection: BackupSelection;
}

// ── Backup generation (shared between export and Drive sync) ──────────────────

export async function generateBackupJson(
  selection: BackupSelection = { pages: true, settings: true }
): Promise<string> {
  const tasks: Promise<void>[] = [];

  let pages:    { id: string; parentId: string | null; order: number; createdAt: number; updatedAt: number; isDeleted: boolean; isFolder?: boolean; tagIds?: string[]; title: string; icon?: string }[] = [];
  let blocks:   { id: string; pageId: string; parentBlockId: string | null; type: string; order: number; createdAt: number; updatedAt: number; isDeleted: boolean; tagIds?: string[]; content: Record<string, unknown>; properties: Record<string, unknown> }[] = [];
  let settings: { key: string; updatedAt: number; value: unknown }[] = [];

  if (selection.pages) {
    tasks.push(
      (async () => {
        const [pageRecs, blockRecs] = await Promise.all([
          db.pages.toArray(),
          db.blocks.toArray(),
        ]);
        pages = await Promise.all(pageRecs.map(async (p: PageRecord) => ({
          id: p.id, parentId: p.parentId, order: p.order,
          createdAt: p.createdAt, updatedAt: p.updatedAt,
          isDeleted: p.isDeleted, isFolder: p.isFolder, tagIds: p.tagIds,
          title: await decryptValue<string>(p.encryptedTitle),
          icon:  p.encryptedIcon ? await decryptValue<string>(p.encryptedIcon) : undefined,
        })));
        blocks = await Promise.all(blockRecs.map(async (b: BlockRecord) => ({
          id: b.id, pageId: b.pageId, parentBlockId: b.parentBlockId,
          type: b.type, order: b.order,
          createdAt: b.createdAt, updatedAt: b.updatedAt, isDeleted: b.isDeleted,
          tagIds: b.tagIds,
          content:    await decryptValue<Record<string, unknown>>(b.encryptedContent),
          properties: await decryptValue<Record<string, unknown>>(b.encryptedProperties),
        })));
      })()
    );
  }

  if (selection.settings) {
    tasks.push(
      (async () => {
        const settingRecs = await db.settings.toArray();
        settings = await Promise.all(settingRecs.map(async (s: SettingRecord) => ({
          key: s.key, updatedAt: s.updatedAt,
          value: await decryptValue<unknown>(s.encryptedValue),
        })));
      })()
    );
  }

  await Promise.all(tasks);
  return JSON.stringify({ version: 2, exportedAt: Date.now(), pages, blocks, settings });
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportBackup(
  selection: BackupSelection = { pages: true, settings: true }
): Promise<void> {
  const json = await generateBackupJson(selection);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `root-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importBackup(
  file: File,
  onStatus: (msg: string) => void,
  options: ImportOptions = { mode: "overwrite", selection: { pages: true, settings: true } }
): Promise<void> {
  const text   = await file.text();
  const backup = JSON.parse(text) as Record<string, unknown>;

  if (!Array.isArray(backup.pages) || !Array.isArray(backup.blocks)) {
    throw new Error("Fichier invalide — champs pages/blocks manquants.");
  }

  const version = (backup.version as number) ?? 1;
  if (version > 2) {
    throw new Error(`Format de backup v${version} non supporté par cette version de ROOT.`);
  }

  const { mode, selection } = options;

  onStatus("Ré-chiffrement des données…");

  // ── Re-encrypt pages + blocks ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pageRecs:    any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let blockRecs:   any[] = [];
  let settingRecs: SettingRecord[] = [];

  if (selection.pages && (backup.pages as unknown[]).length > 0) {
    pageRecs = await Promise.all((backup.pages as {
      id: string; parentId: string | null; order: number;
      createdAt: number; updatedAt: number; isDeleted: boolean; isFolder?: boolean;
      tagIds?: string[]; title: string; icon?: string;
    }[]).map(async (p) => ({
      id: p.id, parentId: p.parentId ?? null, order: p.order ?? 0,
      createdAt: p.createdAt ?? Date.now(), updatedAt: p.updatedAt ?? Date.now(),
      isDeleted: p.isDeleted ?? false, isFolder: p.isFolder ?? false,
      tagIds: p.tagIds ?? [],
      encryptedTitle: await encryptValue(p.title ?? ""),
      ...(p.icon ? { encryptedIcon: await encryptValue(p.icon) } : {}),
    })));

    blockRecs = await Promise.all((backup.blocks as {
      id: string; pageId: string; parentBlockId: string | null;
      type: string; order: number; createdAt: number; updatedAt: number; isDeleted: boolean;
      tagIds?: string[]; content: Record<string, unknown>; properties: Record<string, unknown>;
    }[]).map(async (b) => ({
      id: b.id, pageId: b.pageId, parentBlockId: b.parentBlockId ?? null,
      type: b.type, order: b.order ?? 0,
      createdAt: b.createdAt ?? Date.now(), updatedAt: b.updatedAt ?? Date.now(),
      isDeleted: b.isDeleted ?? false,
      tagIds: b.tagIds ?? [],
      encryptedContent:    await encryptValue(b.content ?? {}),
      encryptedProperties: await encryptValue(b.properties ?? {}),
    })));
  }

  if (selection.settings && Array.isArray(backup.settings) && (backup.settings as unknown[]).length > 0) {
    settingRecs = await Promise.all(((backup.settings) as {
      key: string; updatedAt: number; value: unknown;
    }[]).map(async (s) => ({
      key: s.key, updatedAt: s.updatedAt ?? Date.now(),
      encryptedValue: await encryptValue(s.value),
    })));
  }

  onStatus("Écriture en base…");

  if (mode === "overwrite") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as unknown as Dexie).transaction("rw", db.pages as any, db.blocks as any, db.settings as any, async () => {
      if (selection.pages) {
        await db.pages.clear();
        await db.blocks.clear();
        if (pageRecs.length)  await db.pages.bulkPut(pageRecs as never);
        if (blockRecs.length) await db.blocks.bulkPut(blockRecs as never);
      }
      if (selection.settings) {
        await db.settings.clear();
        if (settingRecs.length) await db.settings.bulkPut(settingRecs as never);
      }
    });
  } else {
    // merge: upsert by primary key — existing records updated, new ones added, missing ones kept
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as unknown as Dexie).transaction("rw", db.pages as any, db.blocks as any, db.settings as any, async () => {
      if (selection.pages) {
        if (pageRecs.length)  await db.pages.bulkPut(pageRecs as never);
        if (blockRecs.length) await db.blocks.bulkPut(blockRecs as never);
      }
      if (selection.settings) {
        if (settingRecs.length) await db.settings.bulkPut(settingRecs as never);
      }
    });
  }
}

// ── Nuke ──────────────────────────────────────────────────────────────────────

export async function nukeVault(): Promise<void> {
  await (db as unknown as Dexie).delete();
  localStorage.clear();
  window.location.reload();
}
