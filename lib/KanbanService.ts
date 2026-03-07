/**
 * KanbanService.ts
 *
 * Lit les blocs de type 'task' depuis IndexedDB, les déchiffre,
 * et expose les opérations Kanban (move, create, delete).
 */

import { db, type TaskStatus, type TaskPriority } from "./database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import { loadAllPages } from "./BlockService";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskProperties {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;    // ISO 8601
  tags?: string[];
}

export interface KanbanTask {
  blockId: string;
  pageId: string;
  pageTitle: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags?: string[];
  order: number;
  createdAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(node: Record<string, unknown>): string {
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    return (node.content as Record<string, unknown>[]).map(extractText).join("");
  }
  return "";
}

// ── Lecture ───────────────────────────────────────────────────────────────────

export async function loadAllTasks(): Promise<KanbanTask[]> {
  const blocks = await db.blocks
    .where("type")
    .equals("task")
    .filter((b) => !b.isDeleted)
    .toArray();

  const pages = await loadAllPages();
  const pageMap = new Map(pages.map((p) => [p.id, p.title]));

  const tasks = await Promise.all(
    blocks.map(async (block) => {
      const [content, props] = await Promise.all([
        decryptValue<Record<string, unknown>>(block.encryptedContent),
        decryptValue<TaskProperties>(block.encryptedProperties),
      ]);

      return {
        blockId: block.id,
        pageId: block.pageId,
        pageTitle: pageMap.get(block.pageId) ?? "—",
        title: extractText(content) || "Sans titre",
        status: props.status ?? "todo",
        priority: props.priority ?? "none",
        dueDate: props.dueDate,
        tags: props.tags,
        order: block.order,
        createdAt: block.createdAt,
      } satisfies KanbanTask;
    })
  );

  return tasks.sort((a, b) => a.createdAt - b.createdAt);
}

// ── Écriture ──────────────────────────────────────────────────────────────────

export async function updateTaskStatus(
  blockId: string,
  newStatus: TaskStatus
): Promise<void> {
  const block = await db.blocks.get(blockId);
  if (!block) return;
  const props = await decryptValue<TaskProperties>(block.encryptedProperties);
  await db.blocks.update(blockId, {
    encryptedProperties: await encryptValue({ ...props, status: newStatus }),
    updatedAt: Date.now(),
  });
}

export async function updateTaskPriority(
  blockId: string,
  priority: TaskPriority
): Promise<void> {
  const block = await db.blocks.get(blockId);
  if (!block) return;
  const props = await decryptValue<TaskProperties>(block.encryptedProperties);
  await db.blocks.update(blockId, {
    encryptedProperties: await encryptValue({ ...props, priority }),
    updatedAt: Date.now(),
  });
}

export async function updateTaskDueDate(
  blockId: string,
  dueDate: string | undefined
): Promise<void> {
  const block = await db.blocks.get(blockId);
  if (!block) return;
  const props = await decryptValue<TaskProperties>(block.encryptedProperties);
  await db.blocks.update(blockId, {
    encryptedProperties: await encryptValue({ ...props, dueDate }),
    updatedAt: Date.now(),
  });
}

export async function createTask(
  title: string,
  status: TaskStatus,
  pageId: string
): Promise<KanbanTask> {
  const now = Date.now();
  const id = crypto.randomUUID();

  const content = {
    type: "paragraph",
    content: [{ type: "text", text: title }],
  };
  const props: TaskProperties = { status, priority: "none" };

  const count = await db.blocks
    .where("pageId")
    .equals(pageId)
    .filter((b) => !b.isDeleted)
    .count();

  await db.blocks.add({
    id,
    pageId,
    parentBlockId: null,
    type: "task",
    encryptedContent: await encryptValue(content),
    encryptedProperties: await encryptValue(props),
    order: count,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  });

  return {
    blockId: id,
    pageId,
    pageTitle: "",
    title,
    status,
    priority: "none",
    order: count,
    createdAt: now,
  };
}

export async function deleteTask(blockId: string): Promise<void> {
  await db.blocks.update(blockId, { isDeleted: true, updatedAt: Date.now() });
}
