"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanTask } from "@/lib/KanbanService";
import type { TaskPriority } from "@/lib/database";
import { useKanbanStore } from "@/stores/kanbanStore";
import { useTagsStore } from "@/stores/tagsStore";
import TaskDetailModal from "./TaskDetailModal";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { toast } from "@/components/ui/sonner";
import { XIcon, PencilIcon, WarningIcon } from "@/components/ui/icons";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  none:    "text-[var(--text-faint)]",
  low:     "text-blue-400",
  medium:  "text-yellow-400",
  high:    "text-orange-400",
  urgent:  "text-red-400",
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "—", low: "Basse", medium: "Moyenne", high: "Haute", urgent: "Urgente",
};
const PRIORITY_ORDER: TaskPriority[] = ["none", "low", "medium", "high", "urgent"];

export default function TaskCard({ task }: { task: KanbanTask }) {
  const { removeTask, setPriority } = useKanbanStore();
  const { tags } = useTagsStore();
  const taskTagDefs = tags.filter((t) => (task.tags ?? []).includes(t.id));
  const [showDetail, setShowDetail] = useState(false);

  // Couleur d'accent : tag unique → couleur du tag ; plusieurs → neutre ; aucun → transparente
  const accentColor = taskTagDefs.length === 1
    ? taskTagDefs[0].color
    : taskTagDefs.length > 1
      ? "#6b7280"
      : undefined;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.blockId,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const dueDateLabel = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    : null;

  const isPastDue = task.dueDate
    ? new Date(task.dueDate) < new Date() && task.status !== "done"
    : false;

  function cyclePriority() {
    const idx = PRIORITY_ORDER.indexOf(task.priority);
    const next = PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length];
    setPriority(task.blockId, next);
  }

  return (
    <ContextMenu>
    <>
    {showDetail && <TaskDetailModal task={task} onClose={() => setShowDetail(false)} />}
    <ContextMenuTrigger asChild>
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderLeftColor: accentColor ?? undefined,
        borderLeftWidth: accentColor ? 3 : undefined,
      }}
      className="group bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[var(--border-light)] transition-colors"
      {...attributes}
      {...listeners}
    >
      {/* Title — clic ouvre le modal détail */}
      <p
        className="text-sm text-[var(--text)] leading-snug mb-2 break-words select-none hover:text-[var(--accent-hover)] transition-colors"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setShowDetail(true)}
      >
        {task.title}
      </p>

      {/* Notes — extrait tronqué */}
      {task.description && (
        <p
          className="text-xs text-[var(--text-faint)] mb-2 line-clamp-2 leading-relaxed select-none"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowDetail(true)}
        >
          {task.description}
        </p>
      )}

      {/* Tag dots */}
      {taskTagDefs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {taskTagDefs.map((tag) => (
            <span
              key={tag.id}
              className="px-1.5 py-0.5 rounded-full text-[10px] text-white font-medium"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Priority badge */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={cyclePriority}
          className={`text-xs font-medium ${PRIORITY_COLORS[task.priority]} hover:opacity-80 transition-opacity`}
          title="Changer la priorité"
        >
          {task.priority !== "none" ? `↑ ${PRIORITY_LABELS[task.priority]}` : "·"}
        </button>

        {/* Due date */}
        {dueDateLabel && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              isPastDue
                ? "bg-red-900/30 text-red-400"
                : "bg-[var(--surface-3)] text-[var(--text-muted)]"
            }`}
          >
            {isPastDue && <WarningIcon size={11} className="inline-block mr-0.5" />}
            {dueDateLabel}
          </span>
        )}

        {/* Delete */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => { removeTask(task.blockId); toast("Tâche supprimée", { description: task.title }); }}
          className="ml-auto opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--danger)] transition-all text-xs"
          title="Supprimer"
        >
          <XIcon size={11} />
        </button>
      </div>
    </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem onClick={() => setShowDetail(true)}>
        <PencilIcon size={13} /> Modifier la tâche
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem danger onClick={() => { removeTask(task.blockId); toast("Tâche supprimée", { description: task.title }); }}>
        <XIcon size={13} /> Supprimer
      </ContextMenuItem>
    </ContextMenuContent>
    </>
    </ContextMenu>
  );
}
