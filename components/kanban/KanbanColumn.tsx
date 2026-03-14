"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { KanbanTask } from "@/lib/KanbanService";
import type { TaskStatus } from "@/lib/database";
import { useKanbanStore } from "@/stores/kanbanStore";
import TaskCard from "./TaskCard";

interface Props {
  id: TaskStatus;
  label: string;
  accent: string;
  tasks: KanbanTask[];
}

export default function KanbanColumn({ id, label, accent, tasks }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const { addTask } = useKanbanStore();
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");

  async function commitAdd() {
    const title = draft.trim();
    if (!title) { setIsAdding(false); setDraft(""); return; }
    await addTask(title, id);
    setDraft("");
    setIsAdding(false);
  }

  return (
    <div className="flex flex-col w-72 min-w-[280px] shrink-0">
      {/* Header — label + grand nombre fantôme + ligne dégradée */}
      <div className="mb-3 px-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)] tracking-wide">{label}</h3>
          <span
            className="text-[28px] font-bold font-mono leading-none tabular-nums select-none"
            style={{ color: accent, opacity: 0.28 }}
          >
            {tasks.length}
          </span>
        </div>
        <div
          className="mt-1.5 h-[1.5px] rounded-full"
          style={{
            background: `linear-gradient(90deg, ${accent} 0%, ${accent}55 45%, transparent 100%)`,
          }}
        />
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 flex-1 min-h-[120px] rounded-xl p-2 transition-all duration-200 ${
          isOver ? "kanban-drop-active" : "bg-[var(--surface)]"
        }`}
      >
        {tasks.map((task) => (
          <TaskCard key={task.blockId} task={task} />
        ))}

        {/* Inline add form */}
        {isAdding ? (
          <div className="bg-[var(--surface-2)] border border-[var(--border-light)] rounded-lg p-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitAdd(); }
                if (e.key === "Escape") { setIsAdding(false); setDraft(""); }
              }}
              placeholder="Titre de la tâche…"
              rows={2}
              className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={commitAdd}
                className="px-3 py-1 text-xs rounded-md bg-[var(--surface-3)] text-[var(--text)] hover:bg-[var(--border)] transition-colors"
              >
                Ajouter
              </button>
              <button
                onClick={() => { setIsAdding(false); setDraft(""); }}
                className="px-3 py-1 text-xs rounded-md text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="btn-shimmer flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] border border-transparent transition-colors"
          >
            <span style={{ color: accent }}>+</span> Ajouter une tâche
          </button>
        )}
      </div>
    </div>
  );
}
