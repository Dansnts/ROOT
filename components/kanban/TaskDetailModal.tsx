"use client";

import { useState } from "react";
import { useKanbanStore } from "@/stores/kanbanStore";
import { createTask, updateTask } from "@/lib/KanbanService";
import type { KanbanTask, TaskProperties } from "@/lib/KanbanService";
import type { TaskStatus, TaskPriority } from "@/lib/database";
import { useTagsStore } from "@/stores/tagsStore";

const TAG_PALETTE = [
  "#22d472", "#3b82f6", "#a855f7", "#ec4899",
  "#f97316", "#eab308", "#06b6d4", "#ef4444",
  "#84cc16", "#64748b",
];

interface Props {
  task?: KanbanTask;   // undefined = mode création
  defaultStatus?: TaskStatus;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo",        label: "À faire" },
  { value: "in_progress", label: "En cours" },
  { value: "done",        label: "Terminé" },
  { value: "cancelled",   label: "Annulé" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "none",   label: "Aucune" },
  { value: "low",    label: "Basse" },
  { value: "medium", label: "Moyenne" },
  { value: "high",   label: "Haute" },
  { value: "urgent", label: "Urgente" },
];

export default function TaskDetailModal({ task, defaultStatus = "todo", onClose }: Props) {
  const isNew = !task;
  const { removeTask, loadTasks } = useKanbanStore();
  const { tags, createTag, setTaskTags } = useTagsStore();

  const [title, setTitle]       = useState(task?.title ?? "");
  const [status, setStatus]     = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPri]      = useState<TaskPriority>(task?.priority ?? "none");
  const [dueDate, setDueDate]   = useState(task?.dueDate ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [taskTags, setTaskTagsLocal] = useState<string[]>(task?.tags ?? []);
  const [saving, setSaving]     = useState(false);

  // Création de tag à la volée
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_PALETTE[0]);

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    const tag = await createTag(name, newTagColor);
    setTaskTagsLocal((prev) => [...prev, tag.id]);
    setNewTagName("");
    setNewTagColor(TAG_PALETTE[0]);
    setShowNewTag(false);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const props = {
        status,
        priority,
        dueDate: dueDate || undefined,
        tags: taskTags,
        description: description || undefined,
      } satisfies Partial<TaskProperties> & { status: typeof status };

      if (isNew) {
        const created = await createTask(title.trim(), props);
        await setTaskTags(created.blockId, taskTags);
      } else {
        await updateTask(task!.blockId, title, props);
        await setTaskTags(task!.blockId, taskTags);
      }

      await loadTasks();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    await removeTask(task.blockId);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-[var(--surface-2)] border border-[var(--border-light)] rounded-2xl shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            {isNew ? "Nouvelle tâche" : "Tâche"}
          </h3>
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-sm">✕</button>
        </div>

        {/* Titre */}
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={2}
          autoFocus={isNew}
          className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm resize-none outline-none focus:border-[var(--accent-hover)] transition-colors"
          placeholder="Titre de la tâche"
        />

        {/* Statut et Priorité */}
        <div className="grid grid-cols-2 gap-4">
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

        {/* Échéance */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Échéance</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm outline-none focus:border-[var(--accent-hover)] transition-colors [color-scheme:dark]"
          />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Notes</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] text-sm resize-none outline-none focus:border-[var(--accent-hover)] transition-colors"
            placeholder="Description, notes, contexte…"
          />
        </div>

        {/* Tags */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Tags</label>
            <button
              onClick={() => setShowNewTag((v) => !v)}
              className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              + Nouveau tag
            </button>
          </div>

          {/* Formulaire création inline */}
          {showNewTag && (
            <div className="bg-[var(--surface-3)] border border-[var(--border)] rounded-lg p-3 flex flex-col gap-2">
              <input
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); if (e.key === "Escape") setShowNewTag(false); }}
                placeholder="Nom du tag"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
              <div className="flex flex-wrap gap-1.5">
                {TAG_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewTagColor(c)}
                    className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
                    style={{ backgroundColor: c, borderColor: newTagColor === c ? "white" : "transparent" }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateTag}
                  className="flex-1 text-xs py-1 rounded bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                >
                  Créer
                </button>
                <button
                  onClick={() => setShowNewTag(false)}
                  className="text-xs px-2 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Liste des tags existants */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = taskTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => setTaskTagsLocal(active
                      ? taskTags.filter((id) => id !== tag.id)
                      : [...taskTags, tag.id]
                    )}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-all ${
                      active
                        ? "border-transparent text-white"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-light)]"
                    }`}
                    style={active ? { backgroundColor: tag.color } : {}}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}

          {tags.length === 0 && !showNewTag && (
            <p className="text-xs text-[var(--text-faint)] italic">Aucun tag — crée-en un avec le bouton ci-dessus.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1 shrink-0">
          {!isNew && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg text-sm text-[var(--danger)] hover:bg-red-900/20 transition-colors"
            >
              Supprimer
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-3)] transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--surface-3)] border border-[var(--border-light)] text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {saving ? "Sauvegarde…" : isNew ? "Créer" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
