/**
 * CalendarService.ts
 *
 * Charge tous les blocs possédant une propriété 'dueDate' (tous types confondus),
 * les déchiffre, et les retourne comme événements FullCalendar.
 */

import { db, type BlockRecord, type TaskStatus, type TaskPriority } from "./database";
import { decryptValue } from "@/stores/vaultStore";
import { loadAllPages } from "./BlockService";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;       // ISO 8601
  end?: string;
  allDay: boolean;
  pageId: string;
  pageTitle: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  color: string;
}

interface BlockProps {
  dueDate?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}

// Couleur selon le statut de la tâche
function statusColor(status?: TaskStatus): string {
  switch (status) {
    case "done":       return "#3d8a5c";
    case "in_progress":return "#7a8fa3";
    case "cancelled":  return "#6b3333";
    default:           return "#5b6a7a";
  }
}

function extractText(node: Record<string, unknown>): string {
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content))
    return (node.content as Record<string, unknown>[]).map(extractText).join("");
  return "";
}

export async function loadCalendarEvents(): Promise<CalendarEvent[]> {
  const allBlocks = await db.blocks.filter((b: BlockRecord) => !b.isDeleted).toArray();
  const pages = await loadAllPages();
  const pageMap = new Map(pages.map((p) => [p.id, p.title]));

  const events: CalendarEvent[] = [];

  await Promise.all(
    allBlocks.map(async (block: BlockRecord) => {
      try {
        const props = await decryptValue<BlockProps>(block.encryptedProperties);
        if (!props.dueDate) return;

        const content = await decryptValue<Record<string, unknown>>(
          block.encryptedContent
        );
        const title = extractText(content) || "Sans titre";

        events.push({
          id: block.id,
          title,
          start: props.dueDate,
          allDay: true,
          pageId: block.pageId,
          pageTitle: pageMap.get(block.pageId) ?? "—",
          status: props.status,
          priority: props.priority,
          color: statusColor(props.status),
        });
      } catch {
        // Bloc inaccessible (corruption) — ignoré silencieusement
      }
    })
  );

  return events.sort((a, b) => a.start.localeCompare(b.start));
}
