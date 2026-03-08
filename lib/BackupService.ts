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

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<void> {
  const [pageRecs, blockRecs, settingRecs] = await Promise.all([
    db.pages.toArray(),
    db.blocks.toArray(),
    db.settings.toArray(),
  ]);

  const pages = await Promise.all(pageRecs.map(async (p: PageRecord) => ({
    id: p.id, parentId: p.parentId, order: p.order,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    isDeleted: p.isDeleted, isFolder: p.isFolder,
    title: await decryptValue<string>(p.encryptedTitle),
    icon:  p.encryptedIcon ? await decryptValue<string>(p.encryptedIcon) : undefined,
  })));

  const blocks = await Promise.all(blockRecs.map(async (b: BlockRecord) => ({
    id: b.id, pageId: b.pageId, parentBlockId: b.parentBlockId,
    type: b.type, order: b.order,
    createdAt: b.createdAt, updatedAt: b.updatedAt, isDeleted: b.isDeleted,
    content:    await decryptValue<Record<string, unknown>>(b.encryptedContent),
    properties: await decryptValue<Record<string, unknown>>(b.encryptedProperties),
  })));

  const settings = await Promise.all(settingRecs.map(async (s: SettingRecord) => ({
    key: s.key, updatedAt: s.updatedAt,
    value: await decryptValue<unknown>(s.encryptedValue),
  })));

  const backup = { version: 2, exportedAt: Date.now(), pages, blocks, settings };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
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
  onStatus: (msg: string) => void
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

  onStatus("Ré-chiffrement des données…");

  const pageRecs = await Promise.all((backup.pages as {
    id: string; parentId: string | null; order: number;
    createdAt: number; updatedAt: number; isDeleted: boolean; isFolder?: boolean;
    title: string; icon?: string;
  }[]).map(async (p) => ({
    id: p.id, parentId: p.parentId ?? null, order: p.order ?? 0,
    createdAt: p.createdAt ?? Date.now(), updatedAt: p.updatedAt ?? Date.now(),
    isDeleted: p.isDeleted ?? false,
    isFolder: p.isFolder ?? false,
    encryptedTitle: await encryptValue(p.title ?? ""),
    ...(p.icon ? { encryptedIcon: await encryptValue(p.icon) } : {}),
  })));

  const blockRecs = await Promise.all((backup.blocks as {
    id: string; pageId: string; parentBlockId: string | null;
    type: string; order: number; createdAt: number; updatedAt: number; isDeleted: boolean;
    content: Record<string, unknown>; properties: Record<string, unknown>;
  }[]).map(async (b) => ({
    id: b.id, pageId: b.pageId, parentBlockId: b.parentBlockId ?? null,
    type: b.type, order: b.order ?? 0,
    createdAt: b.createdAt ?? Date.now(), updatedAt: b.updatedAt ?? Date.now(),
    isDeleted: b.isDeleted ?? false,
    encryptedContent:    await encryptValue(b.content ?? {}),
    encryptedProperties: await encryptValue(b.properties ?? {}),
  })));

  const settingRecs = await Promise.all(((backup.settings ?? []) as {
    key: string; updatedAt: number; value: unknown;
  }[]).map(async (s) => ({
    key: s.key, updatedAt: s.updatedAt ?? Date.now(),
    encryptedValue: await encryptValue(s.value),
  })));

  onStatus("Écriture en base…");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as unknown as Dexie).transaction("rw", db.pages as any, db.blocks as any, db.settings as any, async () => {
    await db.pages.clear();
    await db.blocks.clear();
    await db.settings.clear();
    if (pageRecs.length)    await db.pages.bulkPut(pageRecs as never);
    if (blockRecs.length)   await db.blocks.bulkPut(blockRecs as never);
    if (settingRecs.length) await db.settings.bulkPut(settingRecs as never);
  });
}

// ── Nuke ──────────────────────────────────────────────────────────────────────

export async function nukeVault(): Promise<void> {
  await (db as unknown as Dexie).delete();
  localStorage.clear();
  window.location.reload();
}
