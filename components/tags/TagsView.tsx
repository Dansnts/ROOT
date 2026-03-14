"use client";

import { useState, useMemo } from "react";
import { useTagsStore } from "@/stores/tagsStore";
import { usePagesStore } from "@/stores/pagesStore";
import { useKanbanStore } from "@/stores/kanbanStore";
import type { TagDefinition } from "@/lib/database";
import { COLOR_PALETTE as PALETTE } from "@/lib/constants";
import { PencilIcon, XIcon, FolderOpenIcon, FileIcon, ArrowRightIcon, CheckIcon, WarningIcon } from "@/components/ui/icons";

export default function TagsView() {
  const { tags, createTag, updateTag, deleteTag } = useTagsStore();
  const { pages, setActivePage, setPageTags } = usePagesStore();
  const { tasks } = useKanbanStore();

  const [selected, setSelected]   = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [formName, setFormName]   = useState("");
  const [formColor, setFormColor] = useState(PALETTE[5]);

  const activePagesOnly = pages.filter((p) => !p.isDeleted);

  // Nombre d'éléments par tag
  const usageMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const tag of tags) {
      const pageCount = activePagesOnly.filter((p) => (p.tagIds ?? []).includes(tag.id)).length;
      const taskCount = tasks.filter((t) => (t.tags ?? []).includes(tag.id)).length;
      map.set(tag.id, pageCount + taskCount);
    }
    return map;
  }, [tags, activePagesOnly, tasks]);

  const maxUsage = Math.max(1, ...Array.from(usageMap.values()));

  const selectedTag = tags.find((t) => t.id === selected);

  // Éléments liés au tag sélectionné
  const linkedPages = selectedTag
    ? activePagesOnly.filter((p) => (p.tagIds ?? []).includes(selectedTag.id))
    : [];
  const linkedTasks = selectedTag
    ? tasks.filter((t) => (t.tags ?? []).includes(selectedTag.id))
    : [];

  // Tâches avec une échéance, triées par date
  const upcomingDeadlines = linkedTasks
    .filter((t) => !!t.dueDate && t.status !== "done" && t.status !== "cancelled")
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  function openCreate() {
    setEditId(null);
    setFormName("");
    setFormColor(PALETTE[tags.length % PALETTE.length]);
    setShowForm(true);
  }

  function openEdit(tag: TagDefinition) {
    setEditId(tag.id);
    setFormName(tag.name);
    setFormColor(tag.color);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    if (editId) {
      await updateTag(editId, formName.trim(), formColor);
    } else {
      await createTag(formName.trim(), formColor);
    }
    setShowForm(false);
    setEditId(null);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }

  const isPast = (iso: string) => new Date(iso) < new Date();

  return (
    <div className="flex h-full overflow-hidden">

      {/* Panneau gauche — liste des tags */}
      <div className="w-72 shrink-0 border-r border-[var(--border)] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)] flex-1">Tags</h2>
          <button
            onClick={openCreate}
            className="text-xs px-2 py-1 rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            + Nouveau
          </button>
        </div>

        {/* Formulaire create/edit */}
        {showForm && (
          <form onSubmit={handleSubmit} className="p-3 border-b border-[var(--border)] flex flex-col gap-2 bg-[var(--surface-2)]">
            <input
              autoFocus
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nom du tag"
              className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFormColor(c)}
                  className="w-5 h-5 rounded-full border-2 transition-all"
                  style={{ backgroundColor: c, borderColor: formColor === c ? "var(--text)" : "transparent" }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-1 rounded-lg text-xs bg-[var(--surface-3)] border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors">
                {editId ? "Mettre à jour" : "Créer"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1 rounded-lg text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
                Annuler
              </button>
            </div>
          </form>
        )}

        {/* Liste des tags avec barre d'usage */}
        <div className="flex-1 overflow-y-auto py-2">
          {tags.length === 0 && (
            <p className="px-4 py-6 text-xs text-[var(--text-faint)] text-center">
              Aucun tag.<br/>Cliquez sur &ldquo;+ Nouveau&rdquo; pour commencer.
            </p>
          )}
          {tags.map((tag) => {
            const usage = usageMap.get(tag.id) ?? 0;
            const barW = Math.round((usage / maxUsage) * 100);
            return (
              <div
                key={tag.id}
                onClick={() => setSelected(selected === tag.id ? null : tag.id)}
                className={`group flex flex-col gap-1 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                  selected === tag.id
                    ? "bg-[var(--surface-3)]"
                    : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="flex-1 text-sm text-[var(--text)] truncate">{tag.name}</span>
                  <span className="text-xs text-[var(--text-faint)]">{usage}</span>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(tag); }}
                      className="w-5 h-5 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--accent)] rounded text-xs transition-colors"
                      title="Modifier"
                    ><PencilIcon size={13} /></button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTag(tag.id); if (selected === tag.id) setSelected(null); }}
                      className="w-5 h-5 flex items-center justify-center text-[var(--text-faint)] hover:text-red-400 rounded transition-colors"
                      title="Supprimer"
                    ><XIcon size={13} /></button>
                  </div>
                </div>
                {/* Barre d'usage */}
                <div className="h-1 rounded-full bg-[var(--surface-3)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${barW}%`, backgroundColor: tag.color, opacity: 0.7 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panneau droit — détail du tag sélectionné */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedTag ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 select-none" style={{ opacity: 0.4 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-faint)]">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <p className="text-xs text-[var(--text-faint)] font-mono">← sélectionne un tag</p>
          </div>
        ) : (
          <div className="max-w-2xl flex flex-col gap-8">

            {/* Header tag — utilise la couleur du tag comme accent local */}
            <div className="flex items-center gap-3 pb-4"
              style={{ borderBottom: `1px solid ${selectedTag.color}28` }}>
              <div className="relative">
                <div style={{
                  position: "absolute", inset: -6, borderRadius: "50%",
                  background: `radial-gradient(circle, ${selectedTag.color}22 0%, transparent 70%)`,
                }} />
                <span className="w-5 h-5 rounded-full block"
                  style={{ backgroundColor: selectedTag.color, boxShadow: `0 0 10px ${selectedTag.color}60` }} />
              </div>
              <h3 className="text-xl font-bold text-[var(--text)]">{selectedTag.name}</h3>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-mono ml-1"
                style={{ color: selectedTag.color, background: `${selectedTag.color}18`, border: `1px solid ${selectedTag.color}30` }}
              >
                {(usageMap.get(selectedTag.id) ?? 0)} élément{(usageMap.get(selectedTag.id) ?? 0) !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Timeline des échéances */}
            {upcomingDeadlines.length > 0 && (
              <div className="flex flex-col gap-3">
                <h4 className="text-xs text-[var(--text-faint)] uppercase tracking-wider">Échéances à venir</h4>
                <div className="flex flex-col gap-2">
                  {upcomingDeadlines.map((task) => (
                    <div
                      key={task.blockId}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                        isPast(task.dueDate!)
                          ? "border-red-700/40 bg-red-900/10"
                          : "border-[var(--border)] bg-[var(--surface-2)]"
                      }`}
                    >
                      <span
                        className="text-xs font-mono shrink-0 px-2 py-0.5 rounded"
                        style={{ backgroundColor: selectedTag.color + "30", color: selectedTag.color }}
                      >
                        {formatDate(task.dueDate!)}
                      </span>
                      {isPast(task.dueDate!) && <WarningIcon size={13} className="text-red-400 shrink-0" />}
                      <span className="text-sm text-[var(--text)] truncate flex-1">{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pages / dossiers liés */}
            {linkedPages.length > 0 && (
              <div className="flex flex-col gap-3">
                <h4 className="text-xs text-[var(--text-faint)] uppercase tracking-wider">
                  Documents &amp; dossiers ({linkedPages.length})
                </h4>
                <div className="flex flex-col gap-1">
                  {linkedPages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => setActivePage(page.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <span className="opacity-60 text-[var(--text-faint)]">{page.isFolder ? <FolderOpenIcon size={14} /> : <FileIcon size={14} />}</span>
                      <span className="text-sm text-[var(--text)] flex-1 truncate">{page.title}</span>
                      <span className="text-[var(--accent)] opacity-0 group-hover:opacity-100"><ArrowRightIcon size={12} /></span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tâches kanban liées */}
            {linkedTasks.length > 0 && (
              <div className="flex flex-col gap-3">
                <h4 className="text-xs text-[var(--text-faint)] uppercase tracking-wider">
                  Tâches Kanban ({linkedTasks.length})
                </h4>
                <div className="flex flex-col gap-1">
                  {linkedTasks.map((task) => {
                    const STATUS_LABEL: Record<string, string> = {
                      todo: "À faire", in_progress: "En cours", done: "Terminé", cancelled: "Annulé"
                    };
                    return (
                      <div
                        key={task.blockId}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]"
                      >
                        <span className={`text-xs shrink-0 ${
                          task.status === "done" ? "text-green-400" :
                          task.status === "cancelled" ? "text-[var(--text-faint)] line-through" :
                          task.status === "in_progress" ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                        }`}>
                          {STATUS_LABEL[task.status]}
                        </span>
                        <span className="text-sm text-[var(--text)] flex-1 truncate">{task.title}</span>
                        {task.dueDate && (
                          <span className={`text-xs shrink-0 ${isPast(task.dueDate) && task.status !== "done" ? "text-red-400" : "text-[var(--text-faint)]"}`}>
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {linkedPages.length === 0 && linkedTasks.length === 0 && (
              <p className="text-sm text-[var(--text-faint)]">Aucun élément assigné à ce tag.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
