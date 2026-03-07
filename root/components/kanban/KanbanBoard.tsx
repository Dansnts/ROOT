"use client";

import { useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useKanbanStore } from "@/stores/kanbanStore";
import KanbanColumn from "./KanbanColumn";
import type { TaskStatus } from "@/lib/database";

interface Column {
  id: TaskStatus;
  label: string;
  accent: string;
}

const COLUMNS: Column[] = [
  { id: "todo",        label: "À faire",   accent: "#5b6a7a" },
  { id: "in_progress", label: "En cours",  accent: "#7a8fa3" },
  { id: "done",        label: "Terminé",   accent: "#3d8a5c" },
  { id: "cancelled",   label: "Annulé",    accent: "#b84040" },
];

export default function KanbanBoard() {
  const { tasks, isLoading, loadTasks, moveTask } = useKanbanStore();

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.blockId === active.id);
    if (task && task.status !== newStatus) moveTask(task.blockId, newStatus);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border)] shrink-0">
        <h2 className="text-lg font-semibold">Kanban</h2>
        <button
          onClick={loadTasks}
          className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          ↻ Rafraîchir
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 text-[var(--text-muted)] text-sm">
          Chargement…
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-5 flex-1 overflow-x-auto p-6 items-start">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                label={col.label}
                accent={col.accent}
                tasks={tasks.filter((t) => t.status === col.id)}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}
