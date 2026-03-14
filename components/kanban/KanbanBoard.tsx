"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useKanbanStore } from "@/stores/kanbanStore";
import { useTagsStore } from "@/stores/tagsStore";
import KanbanColumn from "./KanbanColumn";
import TaskDetailModal from "./TaskDetailModal";
import type { KanbanTask } from "@/lib/KanbanService";
import type { TaskStatus, TaskPriority } from "@/lib/database";
import { RefreshIcon, ChevronDownIcon, CheckIcon, XIcon, PlusIcon } from "@/components/ui/icons";

interface Column { id: TaskStatus; label: string; accent: string }

const COLUMNS: Column[] = [
  { id: "todo",        label: "À faire",   accent: "#5b6a7a" },
  { id: "in_progress", label: "En cours",  accent: "#7a8fa3" },
  { id: "done",        label: "Terminé",   accent: "#3d8a5c" },
  { id: "cancelled",   label: "Annulé",    accent: "#b84040" },
];

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low", "none"];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgente", high: "Haute", medium: "Moyenne", low: "Basse", none: "Aucune",
};
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6", none: "#6b7280",
};

type SortMode = "order" | "date" | "priority";

function applyFiltersAndSort(
  tasks: KanbanTask[],
  sort: SortMode,
  filterPriorities: TaskPriority[],
  filterTagIds: string[],
): KanbanTask[] {
  let result = [...tasks];

  if (filterPriorities.length > 0) {
    result = result.filter((t) => filterPriorities.includes(t.priority));
  }
  if (filterTagIds.length > 0) {
    result = result.filter((t) => filterTagIds.some((id) => (t.tags ?? []).includes(id)));
  }

  if (sort === "date") {
    result.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  } else if (sort === "priority") {
    result.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
  } else {
    result.sort((a, b) => a.createdAt - b.createdAt);
  }

  return result;
}

export default function KanbanBoard() {
  const { tasks, isLoading, loadTasks, moveTask } = useKanbanStore();
  const { tags } = useTagsStore();

  const [showCreate,        setShowCreate]        = useState(false);
  const [sort,              setSort]              = useState<SortMode>("order");
  const [filterPriorities,  setFilterPriorities]  = useState<TaskPriority[]>([]);
  const [filterTagIds,      setFilterTagIds]      = useState<string[]>([]);
  const [showTagFilter,     setShowTagFilter]     = useState(false);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const task = tasks.find((t) => t.blockId === active.id);
    if (task && task.status !== over.id) moveTask(task.blockId, over.id as TaskStatus);
  }

  function togglePriority(p: TaskPriority) {
    setFilterPriorities((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function toggleTag(id: string) {
    setFilterTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function clearAll() {
    setSort("order");
    setFilterPriorities([]);
    setFilterTagIds([]);
  }

  const hasActiveFilter = sort !== "order" || filterPriorities.length > 0 || filterTagIds.length > 0;

  const filteredTasks = useMemo(
    () => applyFiltersAndSort(tasks, sort, filterPriorities, filterTagIds),
    [tasks, sort, filterPriorities, filterTagIds],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="view-header flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0">
        <h2 className="text-sm font-semibold text-[var(--text)] font-mono tracking-widest uppercase flex items-center gap-2">
          <span className="text-[var(--accent)]">▸</span> kanban
        </h2>
        <button
          onClick={loadTasks}
          className="text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors hover:rotate-180 duration-500"
          title="Rafraîchir"
        >
          <RefreshIcon size={13} />
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-cta ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm border font-medium"
        >
          <PlusIcon size={13} /> Nouvelle tâche
        </button>
      </div>

      {/* Barre de filtres */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-[var(--border)] shrink-0 flex-wrap">

        {/* Tri */}
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] mr-1">Tri</span>
        {(["order", "date", "priority"] as SortMode[]).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s === sort ? "order" : s)}
            className={`btn-shimmer px-2.5 py-1 rounded-md text-xs border transition-colors ${
              sort === s
                ? "bg-[var(--surface-3)] text-[var(--accent)] border-[var(--accent)]/30"
                : "border-transparent text-[var(--text-faint)] hover:text-[var(--text-muted)]"
            }`}
          >
            {s === "order" ? "Manuel" : s === "date" ? "Date ↑" : "Priorité ↓"}
          </button>
        ))}

        <div className="w-px h-4 bg-[var(--border)] mx-1" />

        {/* Filtre priorité */}
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] mr-1">Priorité</span>
        {(["urgent", "high", "medium", "low"] as TaskPriority[]).map((p) => (
          <button
            key={p}
            onClick={() => togglePriority(p)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
              filterPriorities.includes(p)
                ? "text-white border-transparent"
                : "border-[var(--border)] text-[var(--text-faint)] hover:border-[var(--border-light)] hover:text-[var(--text-muted)]"
            }`}
            style={filterPriorities.includes(p) ? { backgroundColor: PRIORITY_COLOR[p] } : {}}
          >
            {PRIORITY_LABEL[p]}
          </button>
        ))}

        {/* Filtre tags */}
        {tags.length > 0 && (
          <>
            <div className="w-px h-4 bg-[var(--border)] mx-1" />
            <span className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] mr-1">Tags</span>
            <div className="relative">
              <button
                onClick={() => setShowTagFilter((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors border ${
                  filterTagIds.length > 0
                    ? "bg-[var(--surface-3)] border-[var(--border-light)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                }`}
              >
                {filterTagIds.length > 0 ? `${filterTagIds.length} tag${filterTagIds.length > 1 ? "s" : ""}` : "Tous"}
                <ChevronDownIcon size={11} />
              </button>

              {showTagFilter && (
                <div
                  className="absolute top-full left-0 mt-1 z-30 bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-xl p-2 flex flex-col gap-1 min-w-[160px]"
                  onMouseLeave={() => setShowTagFilter(false)}
                >
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-left transition-colors ${
                        filterTagIds.includes(tag.id) ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-3)]"
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      <span className="text-[var(--text)] flex-1">{tag.name}</span>
                      {filterTagIds.includes(tag.id) && <CheckIcon size={10} className="text-[var(--accent)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Reset */}
        {hasActiveFilter && (
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1 text-xs text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
          >
            <XIcon size={11} /> Réinitialiser
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1 text-[var(--text-muted)] text-sm">Chargement…</div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-5 flex-1 overflow-x-auto p-6 items-start">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                label={col.label}
                accent={col.accent}
                tasks={filteredTasks.filter((t) => t.status === col.id)}
              />
            ))}
          </div>
        </DndContext>
      )}

      {showCreate && <TaskDetailModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
