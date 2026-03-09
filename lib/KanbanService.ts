/**
 * KanbanService.ts
 *
 * Lit les blocs de type 'task' depuis IndexedDB, les déchiffre,
 * et expose les opérations Kanban (move, create, delete).
 */

import { db, type BlockRecord, type TaskStatus, type TaskPriority } from "./database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import { extractText } from "@/lib/utils/tiptap";
import { KANBAN_PAGE_ID } from "@/lib/constants";

export { KANBAN_PAGE_ID };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskProperties {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;    // ISO 8601
  tags?: string[];
  details?: string;    // description libre
}

export interface KanbanTask {
  blockId: string;
  pageId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags?: string[];
  details?: string;
  order: number;
  createdAt: number;
}

// ── Lecture ───────────────────────────────────────────────────────────────────

export async function loadAllTasks(): Promise<KanbanTask[]> {
  const blocks = await db.blocks
    .where("type")
    .equals("task")
    .filter((b: BlockRecord) => !b.isDeleted)
    .toArray();

  const tasks = await Promise.all(
    blocks.map(async (block: BlockRecord) => {
      const [content, props] = await Promise.all([
        decryptValue<Record<string, unknown>>(block.encryptedContent),
        decryptValue<TaskProperties>(block.encryptedProperties),
      ]);

      return {
        blockId: block.id,
        pageId: block.pageId,
        title: extractText(content) || "Sans titre",
        status: props.status ?? "todo",
        priority: props.priority ?? "none",
        dueDate: props.dueDate,
        tags: props.tags,
        details: props.details,
        order: block.order,
        createdAt: block.createdAt,
      } satisfies KanbanTask;
    })
  );

  return tasks.sort((a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt);
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
  props: Partial<TaskProperties> & { status: TaskStatus }
): Promise<KanbanTask> {
  const pageId = KANBAN_PAGE_ID;
  const now = Date.now();
  const id = crypto.randomUUID();

  const content = {
    type: "paragraph",
    content: [{ type: "text", text: title }],
  };
  const fullProps: TaskProperties = { priority: "none", ...props };

  const count = await db.blocks
    .where("pageId")
    .equals(pageId)
    .filter((b: BlockRecord) => !b.isDeleted)
    .count();

  await db.blocks.add({
    id,
    pageId,
    parentBlockId: null,
    type: "task",
    encryptedContent: await encryptValue(content),
    encryptedProperties: await encryptValue(fullProps),
    order: count,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  });

  return {
    blockId: id,
    pageId,
    title,
    status: fullProps.status,
    priority: fullProps.priority ?? "none",
    dueDate: fullProps.dueDate,
    tags: fullProps.tags,
    details: fullProps.details,
    order: count,
    createdAt: now,
  };
}

export async function deleteTask(blockId: string): Promise<void> {
  await db.blocks.update(blockId, { isDeleted: true, updatedAt: Date.now() });
}

export async function updateTask(
  blockId: string,
  title: string,
  props: TaskProperties
): Promise<void> {
  const content = {
    type: "paragraph",
    content: [{ type: "text", text: title.trim() || "Sans titre" }],
  };
  await db.blocks.update(blockId, {
    encryptedContent: await encryptValue(content),
    encryptedProperties: await encryptValue(props),
    updatedAt: Date.now(),
  });
}
