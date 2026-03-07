"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import FolderView from "./FolderView";
import BlockEditor from "@/components/editor/BlockEditor";
import { usePagesStore } from "@/stores/pagesStore";

const KanbanBoard  = dynamic(() => import("@/components/kanban/KanbanBoard"),    { ssr: false });
const CalendarView = dynamic(() => import("@/components/calendar/CalendarView"), { ssr: false });

export type AppView = "notes" | "kanban" | "calendar";

export default function AppShell() {
  const { loadPages, activePageId, setActivePage, pages, newPage } = usePagesStore();
  const [view, setView] = useState<AppView>("notes");

  useEffect(() => {
    loadPages().then(() => {
      const { pages: loaded, activePageId: active } = usePagesStore.getState();
      if (loaded.length === 0) {
        newPage("Brouillon");
      } else if (!active) {
        // Préférer une feuille à un dossier comme page par défaut
        const firstPage = [...loaded]
          .sort((a, b) => a.createdAt - b.createdAt)
          .find((p) => !p.isFolder) ?? loaded[0];
        usePagesStore.setState({ activePageId: firstPage.id });
      }
    });
  }, [loadPages, newPage]);

  const activePage = pages.find((p) => p.id === activePageId);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      <Sidebar view={view} onViewChange={setView} />

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
              <div className="max-w-3xl mx-0">
                <PageTitle pageId={activePage.id} title={activePage.title} />
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

        {view === "calendar" && (
          <div className="flex-1 overflow-hidden">
            <CalendarView />
          </div>
        )}
      </main>
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
