"use client";

import { useState, useEffect, useCallback } from "react";
import { db, type PageRecord, type BlockRecord } from "@/lib/database";
import { decryptValue } from "@/stores/vaultStore";
import { usePagesStore } from "@/stores/pagesStore";
import { useKanbanStore } from "@/stores/kanbanStore";

interface TrashedPage {
  id: string;
  title: string;
  icon?: string;
  deletedAt: number;
  isFolder?: boolean;
}

interface TrashedTask {
  id: string;
  title: string;
  deletedAt: number;
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return (n.content as unknown[]).map(extractText).join("");
  return "";
}

export default function TrashView() {
  const { restorePage, permanentlyDeletePage, emptyTrash, loadPages } = usePagesStore();
  const { loadTasks } = useKanbanStore();

  const [pages, setPages]   = useState<TrashedPage[]>([]);
  const [tasks, setTasks]   = useState<TrashedTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pageRecs = await db.pages.filter((p: PageRecord) => p.isDeleted).toArray();
      const decPages = await Promise.all(pageRecs.map(async (p: PageRecord) => ({
        id: p.id,
        title: (await decryptValue<string>(p.encryptedTitle)) ?? "Sans titre",
        icon:  p.encryptedIcon ? (await decryptValue<string>(p.encryptedIcon)) : undefined,
        deletedAt: p.updatedAt,
        isFolder: p.isFolder,
      })));
      setPages(decPages.sort((a: TrashedPage, b: TrashedPage) => b.deletedAt - a.deletedAt));

      const taskRecs = await db.blocks.filter((b: BlockRecord) => b.isDeleted && b.type === "task").toArray();
      const decTasks = await Promise.all(taskRecs.map(async (t: BlockRecord) => {
        try {
          const content = await decryptValue<Record<string, unknown>>(t.encryptedContent);
          return { id: t.id, title: extractText(content) || "Sans titre", deletedAt: t.updatedAt };
        } catch {
          return { id: t.id, title: "Sans titre", deletedAt: t.updatedAt };
        }
      }));
      setTasks(decTasks.sort((a: TrashedTask, b: TrashedTask) => b.deletedAt - a.deletedAt));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRestorePage(id: string) {
    await restorePage(id);
    await load();
  }

  async function handleDeletePage(id: string) {
    await permanentlyDeletePage(id);
    await load();
  }

  async function handleRestoreTask(id: string) {
    await db.blocks.update(id, { isDeleted: false, updatedAt: Date.now() });
    await loadTasks();
    await load();
  }

  async function handleDeleteTask(id: string) {
    await db.blocks.delete(id);
    await loadTasks();
    await load();
  }

  async function handleEmptyTrash() {
    if (!confirm("Vider définitivement toute la corbeille ? Cette action est irréversible.")) return;
    await emptyTrash();
    await loadTasks();
    await load();
  }

  const total = pages.length + tasks.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0">
        <h2 className="text-sm font-semibold text-[var(--text)]">Corbeille</h2>
        <span className="text-xs text-[var(--text-faint)]">
          {total} élément{total !== 1 ? "s" : ""}
        </span>
        {total > 0 && (
          <button
            onClick={handleEmptyTrash}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-red-900/20 border border-red-700/30 text-red-400 hover:bg-red-900/40 transition-colors"
          >
            Vider la corbeille
          </button>
        )}
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <p className="text-sm text-[var(--text-faint)]">Chargement…</p>
        )}

        {!loading && total === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-faint)]">
            <TrashEmptyIcon />
            <p className="text-sm">La corbeille est vide</p>
          </div>
        )}

        {!loading && pages.length > 0 && (
          <section className="mb-6">
            <h3 className="text-xs text-[var(--text-faint)] uppercase tracking-wider mb-3">
              Pages &amp; dossiers ({pages.length})
            </h3>
            <div className="flex flex-col gap-0.5">
              {pages.map((page) => (
                <TrashItem
                  key={page.id}
                  icon={page.isFolder ? "📁" : (page.icon ?? "▪")}
                  title={page.title}
                  deletedAt={page.deletedAt}
                  onRestore={() => handleRestorePage(page.id)}
                  onDelete={() => handleDeletePage(page.id)}
                />
              ))}
            </div>
          </section>
        )}

        {!loading && tasks.length > 0 && (
          <section>
            <h3 className="text-xs text-[var(--text-faint)] uppercase tracking-wider mb-3">
              Tâches ({tasks.length})
            </h3>
            <div className="flex flex-col gap-0.5">
              {tasks.map((task) => (
                <TrashItem
                  key={task.id}
                  icon="☐"
                  title={task.title}
                  deletedAt={task.deletedAt}
                  onRestore={() => handleRestoreTask(task.id)}
                  onDelete={() => handleDeleteTask(task.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function TrashItem({ icon, title, deletedAt, onRestore, onDelete }: {
  icon: string;
  title: string;
  deletedAt: number;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const dateStr = new Date(deletedAt).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short",
  });

  return (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors">
      <span className="text-xs opacity-50 shrink-0">{icon}</span>
      <span className="flex-1 text-sm text-[var(--text-muted)] truncate">{title}</span>
      <span className="text-xs text-[var(--text-faint)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {dateStr}
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onRestore}
          className="px-2 py-0.5 rounded text-xs text-[var(--accent)] hover:bg-[var(--surface-3)] transition-colors"
          title="Restaurer"
        >
          ↩ Restaurer
        </button>
        <button
          onClick={onDelete}
          className="px-2 py-0.5 rounded text-xs text-[var(--danger)] hover:bg-red-900/20 transition-colors"
          title="Supprimer définitivement"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function TrashEmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.25">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/>
      <path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}
