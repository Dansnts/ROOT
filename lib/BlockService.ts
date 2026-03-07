/**
 * BlockService.ts
 *
 * Couche d'accès aux données ROOT.
 * Chaque écriture → chiffrement AES-GCM → IndexedDB.
 * Chaque lecture  → IndexedDB → déchiffrement AES-GCM → objet typé en RAM.
 */

import { db, type PageRecord, type BlockRecord, type BlockType } from "./database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";

// ── Types déchiffrés (RAM uniquement) ─────────────────────────────────────────

export interface DecryptedPage {
  id: string;
  parentId: string | null;
  title: string;
  icon?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  isFolder?: boolean;
}

export interface DecryptedBlock {
  id: string;
  pageId: string;
  parentBlockId: string | null;
  type: BlockType;
  // Nœud TipTap JSON tel que retourné par editor.getJSON().content[i]
  content: Record<string, unknown>;
  properties: Record<string, unknown>;
  order: number;
  createdAt: number;
  updatedAt: number;
}

// ── Helpers internes ──────────────────────────────────────────────────────────

async function decryptPage(r: PageRecord): Promise<DecryptedPage> {
  const [title, icon] = await Promise.all([
    decryptValue<string>(r.encryptedTitle),
    r.encryptedIcon ? decryptValue<string>(r.encryptedIcon) : Promise.resolve(undefined),
  ]);
  return { id: r.id, parentId: r.parentId, title, icon, order: r.order, createdAt: r.createdAt, updatedAt: r.updatedAt, isDeleted: r.isDeleted, isFolder: r.isFolder };
}

async function decryptBlock(r: BlockRecord): Promise<DecryptedBlock> {
  const [content, properties] = await Promise.all([
    decryptValue<Record<string, unknown>>(r.encryptedContent),
    decryptValue<Record<string, unknown>>(r.encryptedProperties),
  ]);
  return { id: r.id, pageId: r.pageId, parentBlockId: r.parentBlockId, type: r.type, content, properties, order: r.order, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

// ── Pages ─────────────────────────────────────────────────────────────────────

export async function loadAllPages(): Promise<DecryptedPage[]> {
  const records = await db.pages.filter((p) => !p.isDeleted).toArray();
  return Promise.all(records.map(decryptPage));
}

export async function createPage(
  title: string,
  parentId: string | null = null,
  isFolder = false,
): Promise<DecryptedPage> {
  const now = Date.now();
  const siblings = await db.pages.filter((p) => p.parentId === parentId && !p.isDeleted).toArray();
  const order = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;

  const record: PageRecord = {
    id: crypto.randomUUID(),
    parentId,
    encryptedTitle: await encryptValue(title),
    order,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    ...(isFolder ? { isFolder: true } : {}),
  };

  await db.pages.add(record);
  return { id: record.id, parentId, title, order, createdAt: now, updatedAt: now, isDeleted: false, isFolder: isFolder || undefined };
}

export async function updatePageTitle(id: string, title: string): Promise<void> {
  await db.pages.update(id, {
    encryptedTitle: await encryptValue(title),
    updatedAt: Date.now(),
  });
}

export async function updatePageIcon(id: string, icon: string): Promise<void> {
  await db.pages.update(id, {
    encryptedIcon: await encryptValue(icon),
    updatedAt: Date.now(),
  });
}

export async function softDeletePage(id: string): Promise<void> {
  // Supprime récursivement les sous-pages et leurs blocs
  const children = await db.pages.filter((p) => p.parentId === id).toArray();
  for (const child of children) await softDeletePage(child.id);

  await db.blocks.where("pageId").equals(id).modify({ isDeleted: true });
  await db.pages.update(id, { isDeleted: true, updatedAt: Date.now() });
}

export async function reorderPage(id: string, newOrder: number, newParentId?: string | null): Promise<void> {
  const update: Partial<PageRecord> = { order: newOrder, updatedAt: Date.now() };
  if (newParentId !== undefined) update.parentId = newParentId;
  await db.pages.update(id, update);
}

// ── Blocs ─────────────────────────────────────────────────────────────────────

/**
 * Charge tous les blocs d'une page, déchiffrés, triés par ordre.
 */
export async function loadPageBlocks(pageId: string): Promise<DecryptedBlock[]> {
  const records = await db.blocks
    .where("[pageId+order]")
    .between([pageId, -Infinity], [pageId, Infinity])
    .filter((b) => !b.isDeleted)
    .toArray();

  records.sort((a, b) => a.order - b.order);
  return Promise.all(records.map(decryptBlock));
}

/**
 * Reconstruit le document TipTap complet à partir des blocs déchiffrés.
 * { type: 'doc', content: [...nodes] }
 */
export async function loadPageAsDocument(pageId: string): Promise<Record<string, unknown>> {
  const blocks = await loadPageBlocks(pageId);
  return {
    type: "doc",
    content: blocks.map((b) => b.content),
  };
}

/**
 * Persiste le document TipTap en blocs atomiques chiffrés.
 * Stratégie : remplacement complet des blocs de la page dans une transaction.
 * Les IDs existants sont réutilisés pour préserver la stabilité des clés primaires.
 */
export async function savePageDocument(
  pageId: string,
  doc: Record<string, unknown>
): Promise<void> {
  const nodes = (doc.content as Record<string, unknown>[] | undefined) ?? [];
  const now = Date.now();

  // Charger les blocs existants pour réutiliser leurs IDs et createdAt
  const existing = await db.blocks
    .where("pageId")
    .equals(pageId)
    .filter((b) => !b.isDeleted)
    .toArray();
  existing.sort((a, b) => a.order - b.order);

  await db.transaction("rw", db.pages, db.blocks, async () => {
    // Supprimer les blocs en surplus (si le doc a raccourci)
    if (existing.length > nodes.length) {
      const toDelete = existing.slice(nodes.length).map((b) => b.id);
      await db.blocks.where("id").anyOf(toDelete).modify({ isDeleted: true, updatedAt: now });
    }

    // Upsert chaque nœud TipTap comme bloc
    const upserts: BlockRecord[] = await Promise.all(
      nodes.map(async (node, i) => {
        const prev = existing[i];
        const nodeType = (node.type as string) ?? "paragraph";

        return {
          id: prev?.id ?? crypto.randomUUID(),
          pageId,
          parentBlockId: null,
          type: tiptapTypeToBlockType(nodeType),
          encryptedContent: await encryptValue(node),
          encryptedProperties: await encryptValue({}),
          order: i,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
          isDeleted: false,
        } satisfies BlockRecord;
      })
    );

    await db.blocks.bulkPut(upserts);

    // Mettre à jour updatedAt de la page
    await db.pages.update(pageId, { updatedAt: now });
  });
}

function tiptapTypeToBlockType(tiptapType: string): BlockType {
  const map: Record<string, BlockType> = {
    paragraph: "paragraph",
    heading: "heading1",    // affiné par attrs.level si besoin
    bulletList: "bullet_list",
    orderedList: "ordered_list",
    listItem: "list_item",
    taskList: "task",
    taskItem: "task",
    codeBlock: "code",
    blockquote: "quote",
    horizontalRule: "divider",
    image: "image",
  };
  return map[tiptapType] ?? "paragraph";
}
