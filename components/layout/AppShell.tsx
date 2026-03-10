"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import FolderView from "./FolderView";
import BlockEditor from "@/components/editor/BlockEditor";
import { usePagesStore } from "@/stores/pagesStore";
import { useTagsStore } from "@/stores/tagsStore";
import { useAppInit } from "@/hooks/useAppInit";
import React from "react";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronRightIcon, ChevronLeftIcon, FolderIcon, XIcon, CheckIcon } from "@/components/ui/icons";
import type { DecryptedPage } from "@/lib/BlockService";

const KanbanBoard        = dynamic(() => import("@/components/kanban/KanbanBoard"),               { ssr: false });
const CalendarView       = dynamic(() => import("@/components/calendar/CalendarView"),           { ssr: false });
const CategoryDetailView = dynamic(() => import("@/components/calendar/CategoryDetailView"),     { ssr: false });
const TagsView           = dynamic(() => import("@/components/tags/TagsView"),                   { ssr: false });
const TrashView          = dynamic(() => import("@/components/layout/TrashView"),                { ssr: false });

export type AppView = "notes" | "kanban" | "calendar" | "tags" | "trash";

export default function AppShell() {
  useAppInit();
  const { activePageId, setActivePage, pages } = usePagesStore();
  const [view, setView]               = useState<AppView>("notes");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const activePage = pages.find((p) => p.id === activePageId);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">

      {/* Sidebar — clip via width uniquement (pas de transform = position:fixed préservé) */}
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: sidebarCollapsed ? 0 : 360,
          transition: "width 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
          willChange: "width",
        }}
      >
        <Sidebar
          view={view}
          onViewChange={(v) => { setView(v); if (v !== "calendar") setActiveCategoryId(null); }}
          activeCategoryId={activeCategoryId}
          onCategorySelect={setActiveCategoryId}
        />
      </div>

      {/* Tab de toggle — toujours visible au bord de la sidebar */}
      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        className="shrink-0 self-start mt-3 w-4 flex items-center justify-center py-3 bg-[var(--surface)] border border-l-0 border-[var(--border)] rounded-r-md text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors z-10"
        title={sidebarCollapsed ? "Afficher le menu" : "Masquer le menu"}
      >
        {sidebarCollapsed ? <ChevronRightIcon size={10} /> : <ChevronLeftIcon size={10} />}
      </button>

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {view === "notes" && (
          <div className="flex-1 overflow-y-auto">
            {!activePage && (
              <div className="flex items-center justify-center h-full text-[var(--text-faint)] text-sm">
                Sélectionnez ou créez une page dans la sidebar
              </div>
            )}

            {/* Vue dossier */}
            {activePage?.isFolder && (
              <FolderView
                folder={activePage}
                pages={pages}
                onNavigate={setActivePage}
              />
            )}

            {/* Vue éditeur (feuilles uniquement) */}
            {activePage && !activePage.isFolder && (
              <div className="w-[75%] min-w-[480px]">
                <PageBreadcrumb
                  pages={pages}
                  activePageId={activePage.id}
                  onSelect={setActivePage}
                />
                <PageTitle pageId={activePage.id} title={activePage.title} />
                <PageTagsRow pageId={activePage.id} tagIds={activePage.tagIds ?? []} />
                <BlockEditor pageId={activePage.id} />
              </div>
            )}
          </div>
        )}

        {view === "kanban" && (
          <div className="flex-1 overflow-hidden">
            <KanbanBoard />
          </div>
        )}

        {view === "calendar" && !activeCategoryId && (
          <div className="flex-1 overflow-hidden">
            <CalendarView />
          </div>
        )}

        {view === "calendar" && activeCategoryId && (
          <div className="flex-1 overflow-hidden">
            <CategoryDetailView
              categoryId={activeCategoryId}
              onBack={() => setActiveCategoryId(null)}
            />
          </div>
        )}

        {view === "tags" && (
          <div className="flex-1 overflow-hidden">
            <TagsView />
          </div>
        )}

        {view === "trash" && (
          <div className="flex-1 overflow-hidden">
            <TrashView />
          </div>
        )}
      </main>
    </div>
  );
}

// ── Breadcrumb de navigation ──────────────────────────────────────────────────

function PageBreadcrumb({
  pages,
  activePageId,
  onSelect,
}: {
  pages: DecryptedPage[];
  activePageId: string;
  onSelect: (id: string) => void;
}) {
  // Build ancestor path
  const ancestors: DecryptedPage[] = [];
  let cursor = pages.find((p) => p.id === activePageId);
  while (cursor?.parentId) {
    const parent = pages.find((p) => p.id === cursor!.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    cursor = parent;
  }

  if (ancestors.length === 0) return null;

  return (
    <div className="px-16 pt-8 pb-0">
      <Breadcrumb>
        <BreadcrumbList>
          {ancestors.map((p) => (
            <React.Fragment key={p.id}>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => onSelect(p.id)}>
                  {p.isFolder && <FolderIcon size={13} className="inline-block mr-1" />}{p.title}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </React.Fragment>
          ))}
          <BreadcrumbItem>
            <BreadcrumbPage>
              {pages.find((p) => p.id === activePageId)?.title ?? ""}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

// ── Titre de page éditable ────────────────────────────────────────────────────

function PageTitle({ pageId, title }: { pageId: string; title: string }) {
  const { renamePage } = usePagesStore();

  return (
    <div className="px-16 pt-16 pb-2">
      <input
        key={pageId}
        defaultValue={title}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v && v !== title) renamePage(pageId, v);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="w-full bg-transparent outline-none text-4xl font-bold text-[var(--text)] placeholder:text-[var(--text-faint)] tracking-tight"
        placeholder="Sans titre"
      />
    </div>
  );
}

// ── Tags de la page ───────────────────────────────────────────────────────────

function PageTagsRow({ pageId, tagIds }: { pageId: string; tagIds: string[] }) {
  const { tags } = useTagsStore();
  const { setPageTags } = usePagesStore();
  const [open, setOpen] = useState(false);

  if (tags.length === 0) return null;

  function toggle(tagId: string) {
    const next = tagIds.includes(tagId)
      ? tagIds.filter((id) => id !== tagId)
      : [...tagIds, tagId];
    setPageTags(pageId, next);
  }

  const assigned = tags.filter((t) => tagIds.includes(t.id));

  return (
    <div className="px-16 pb-3 flex items-center gap-2 flex-wrap">
      {assigned.map((tag) => (
        <button
          key={tag.id}
          onClick={() => toggle(tag.id)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white font-medium hover:opacity-80 transition-opacity"
          style={{ backgroundColor: tag.color }}
          title="Retirer ce tag"
        >
          {tag.name} <XIcon size={10} />
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-[var(--border)] text-[var(--text-faint)] hover:border-[var(--border-light)] hover:text-[var(--text-muted)] transition-colors"
        >
          + Tag
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-20 bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-xl p-2 flex flex-col gap-1 min-w-[160px]">
            {tags.map((tag) => {
              const active = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => { toggle(tag.id); setOpen(false); }}
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-left transition-colors ${
                    active ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-3)]"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-[var(--text)] flex-1">{tag.name}</span>
                  {active && <CheckIcon size={10} className="text-[var(--accent)]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
