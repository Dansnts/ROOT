"use client";

import { useState } from "react";
import { useKanbanStore } from "@/stores/kanbanStore";
import { updateTaskDueDate } from "@/lib/KanbanService";
import { db } from "@/lib/database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import type { KanbanTask, TaskProperties } from "@/lib/KanbanService";
import type { TaskStatus, TaskPriority } from "@/lib/database";
import { usePagesStore } from "@/stores/pagesStore";

interface Props {
  task: KanbanTask;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo",        label: "À faire" },
  { value: "in_progress", label: "En cours" },
  { value: "done",        label: "Terminé" },
  { value: "cancelled",   label: "Annulé" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "none",   label: "Aucune",  color: "text-[var(--text-faint)]" },
  { value: "low",    label: "Basse",   color: "text-blue-400" },
  { value: "medium", label: "Moyenne", color: "text-yellow-400" },
  { value: "high",   label: "Haute",   color: "text-orange-400" },
  { value: "urgent", label: "Urgente", color: "text-red-400" },
];

export default function TaskDetailModal({ task, onClose }: Props) {
  const { moveTask, setPriority, removeTask, loadTasks } = useKanbanStore();
  const { setActivePage } = usePagesStore();

  const [title, setTitle]     = useState(task.title);
  const [status, setStatus]   = useState<TaskStatus>(task.status);
  const [priority, setPri]    = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [saving, setSaving]   = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const block = await db.blocks.get(task.blockId);
      if (!block) return;

      const content = { type: "paragraph", content: [{ type: "text", text: title.trim() || "Sans titre" }] };
      const props = await decryptValue<TaskProperties>(block.encryptedProperties);
      const updatedProps: TaskProperties = { ...props, status, priority, dueDate: dueDate || undefined };

      await db.blocks.update(task.blockId, {
        encryptedContent: await encryptValue(content),
        encryptedProperties: await encryptValue(updatedProps),
        updatedAt: Date.now(),
      });

      if (status   !== task.status)   await moveTask(task.blockId, status);
      if (priority !== task.priority) await setPriority(task.blockId, priority);
      if (dueDate  !== (task.dueDate ?? "")) await updateTaskDueDate(task.blockId, dueDate || undefined);

      await loadTasks();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await removeTask(task.blockId);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-widest">Tâche</h3>
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-sm">✕</button>
        </div>

        {/* Title */}
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={2}
          className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm resize-none outline-none focus:border-[var(--accent-hover)] transition-colors"
          placeholder="Titre de la tâche"
        />

        <div className="grid grid-cols-2 gap-4">
          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Statut</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm outline-none focus:border-[var(--accent-hover)] transition-colors"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Priorité</label>
            <select
              value={priority}
              onChange={(e) => setPri(e.target.value as TaskPriority)}
              className="bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm outline-none focus:border-[var(--accent-hover)] transition-colors"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Due date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Échéance</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm outline-none focus:border-[var(--accent-hover)] transition-colors [color-scheme:dark]"
          />
        </div>

        {/* Page source */}
        {task.pageTitle && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-faint)]">Page :</span>
            <button
              onClick={() => { setActivePage(task.pageId); onClose(); }}
              className="text-xs text-[var(--accent-hover)] hover:underline"
            >
              {task.pageTitle} →
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg text-sm text-[var(--danger)] hover:bg-red-900/20 transition-colors"
          >
            Supprimer
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface-3)] border border-[var(--border-light)] text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
