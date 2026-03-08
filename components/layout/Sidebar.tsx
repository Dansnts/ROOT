"use client";

import React, { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { usePagesStore } from "@/stores/pagesStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useTagsStore } from "@/stores/tagsStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useCalendarStore, UNCATEGORIZED_ID } from "@/stores/calendarStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTheme } from "@/hooks/useTheme";
import { type DecryptedPage } from "@/lib/BlockService";
import type { AppView } from "@/components/layout/AppShell";
import { COLOR_PALETTE } from "@/lib/constants";

const SettingsModal = dynamic(() => import("@/components/settings/SettingsModal"), { ssr: false });
const HelpModal     = dynamic(() => import("@/components/help/HelpModal"),         { ssr: false });

// ── Icônes SVG inline (currentColor → s'adaptent dark/light auto) ──────────
const NAV_ITEMS: { id: AppView; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "notes",    label: "Notes",      Icon: NotesIcon    },
  { id: "kanban",   label: "Kanban",     Icon: KanbanIcon   },
  { id: "calendar", label: "Calendrier", Icon: CalendarIcon },
  { id: "tags",     label: "Tags",       Icon: TagsIcon     },
];

interface SidebarProps {
  view: AppView;
  onViewChange: (v: AppView) => void;
  activeCategoryId: string | null;
  onCategorySelect: (id: string | null) => void;
}

// ── Helpers DnD ───────────────────────────────────────────────────────────────

function isDescendantOf(targetId: string, ancestorId: string, pages: DecryptedPage[]): boolean {
  let cur = pages.find((p) => p.id === targetId);
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = pages.find((p) => p.id === cur!.parentId);
  }
  return false;
}

export default function Sidebar({ view, onViewChange, activeCategoryId, onCategorySelect }: SidebarProps) {
  const { pages, activePageId, newPage, newFolder, setActivePage, movePage, lock } = usePagesStore();
  const { lock: lockVault } = useVaultStore();
  const { lock: lockTags } = useTagsStore();
  const { lock: lockCategories } = useCategoriesStore();
  const { theme, toggle: toggleTheme } = useTheme();

  const [showSettings, setShowSettings] = useState(false);
  const [showHelp,     setShowHelp]     = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<{ id: string; pos: "before" | "after" | "into" } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const roots = pages
    .filter((p) => p.parentId === null && !p.isDeleted)
    .sort((a, b) => a.order - b.order);

  const draggedPage = dragId ? pages.find((p) => p.id === dragId) : null;

  function handleLock() { lockVault(); lock(); lockTags(); lockCategories(); }

  function handleDragStart({ active }: DragStartEvent) {
    setDragId(String(active.id));
    setDropPos(null);
  }

  function handleDragMove({ active, over }: DragMoveEvent) {
    if (!over || active.id === over.id) { setDropPos(null); return; }

    const targetId = String(over.id);
    const target   = pages.find((p) => p.id === targetId);
    if (!target || isDescendantOf(targetId, String(active.id), pages)) {
      setDropPos(null); return;
    }

    if (target.isFolder) {
      setDropPos({ id: targetId, pos: "into" });
    } else {
      // Comparer le centre Y du dragged vs le centre Y du target
      const aRect = active.rect.current.translated;
      const oRect = over.rect;
      if (aRect && oRect) {
        const aCy = aRect.top + aRect.height / 2;
        const oCy = oRect.top + oRect.height / 2;
        setDropPos({ id: targetId, pos: aCy < oCy ? "before" : "after" });
      }
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const currentDropPos = dropPos;
    setDragId(null);
    setDropPos(null);
    if (!over || active.id === over.id) return;

    const draggedId = String(active.id);
    const targetId  = String(over.id);
    const target    = pages.find((p) => p.id === targetId);
    if (!target) return;
    if (isDescendantOf(targetId, draggedId, pages)) return;

    if (currentDropPos?.pos === "into" && target.isFolder) {
      const siblings = pages.filter((p) => p.parentId === target.id && !p.isDeleted);
      const newOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
      movePage(draggedId, newOrder, target.id);
    } else if (currentDropPos?.pos === "before") {
      movePage(draggedId, target.order - 0.5, target.parentId);
    } else {
      movePage(draggedId, target.order + 0.5, target.parentId);
    }
  }

  return (
    <>
    {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    {showHelp     && <HelpModal     onClose={() => setShowHelp(false)} />}
    <aside className="flex flex-col w-[360px] h-screen bg-[var(--surface)] border-r border-[var(--border)] select-none shrink-0">

      {/* Header — Logo + nom */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[var(--border)]">
        <LogoIcon size={26} />
        <span className="font-bold text-base tracking-widest text-[var(--accent)] font-mono">ROOT</span>

        <div className="ml-auto flex items-center gap-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit"}
            className="w-7 h-7 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors rounded"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Aide */}
          <button
            onClick={() => setShowHelp(true)}
            title="Aide — Gen"
            className="w-7 h-7 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors rounded text-sm font-bold font-mono"
          >
            ?
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            title="Paramètres"
            className="w-7 h-7 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors rounded"
          >
            <SettingsIcon size={17} />
          </button>

          {/* Lock */}
          <button
            onClick={handleLock}
            title="Verrouiller"
            className="w-7 h-7 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors rounded"
          >
            <LockIcon />
          </button>
        </div>
      </div>

      {/* Navigation principale */}
      <nav className="flex flex-col gap-0.5 px-2 py-2 border-b border-[var(--border)]">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <React.Fragment key={id}>
            <button
              onClick={() => onViewChange(id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[15px] transition-colors w-full text-left ${
                view === id
                  ? "bg-[var(--surface-3)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={20} />
              {label}
              {view === id && id !== "calendar" && (
                <span className="ml-auto w-1 h-1 rounded-full bg-[var(--accent)]" />
              )}
              {id === "calendar" && view === "calendar" && (
                <span className="ml-auto text-[10px] text-[var(--text-faint)]">▾</span>
              )}
            </button>

            {/* Sous-menu catégories sous Calendrier */}
            {id === "calendar" && view === "calendar" && (
              <CategoriesSubNav
                activeCategoryId={activeCategoryId}
                onCategorySelect={onCategorySelect}
              />
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Arbre de pages (vue Notes uniquement) */}
      {view === "notes" && (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          >
          <nav className="flex-1 overflow-y-auto py-2">
            {roots.length === 0 && (
              <p className="px-4 py-3 text-xs text-[var(--text-faint)]">
                Aucune page.
              </p>
            )}
            {roots.map((page) => (
              <PageNode
                key={page.id}
                page={page}
                pages={pages}
                depth={0}
                activePageId={activePageId}
                dragId={dragId}
                dropPos={dropPos}
                onSelect={setActivePage}
              />
            ))}
          </nav>

          <DragOverlay dropAnimation={null}>
            {draggedPage && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--surface-3)] border border-[var(--accent)] text-[var(--text)] text-sm shadow-xl opacity-90 max-w-[280px]">
                <span className="text-xs">{draggedPage.isFolder ? "📁" : "▪"}</span>
                <span className="truncate">{draggedPage.title}</span>
              </div>
            )}
          </DragOverlay>
          </DndContext>

          <div className="p-3 border-t border-[var(--border)] flex flex-col gap-1">
            <button
              onClick={() => newPage()}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-base text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <span className="text-[var(--accent)]">+</span> Nouvelle page
            </button>
            <button
              onClick={() => newFolder()}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-base text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <span className="text-[var(--accent)]">⊞</span> Nouveau dossier
            </button>
          </div>
        </>
      )}

      {view !== "notes" && <div className="flex-1" />}

      {/* Corbeille — toujours en bas */}
      <div className="px-2 py-1 border-t border-[var(--border)]">
        <button
          onClick={() => onViewChange("trash")}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left ${
            view === "trash"
              ? "bg-[var(--surface-3)] text-[var(--danger)]"
              : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)]"
          }`}
        >
          <TrashIcon size={15} />
          Corbeille
        </button>
      </div>

      {/* Footer — version */}
      <div className="px-4 py-2 border-t border-[var(--border)] flex items-center justify-between">
        <p className="text-[10px] text-[var(--text-faint)] font-mono">
          ROOT <span className="opacity-40">·</span> v1.0
        </p>
        <p className="text-[10px] text-[var(--text-faint)] opacity-40 font-mono">
          zero-knowledge
        </p>
      </div>
    </aside>
    </>
  );
}

// ── Nœud de page récursif ─────────────────────────────────────────────────────

function PageNode({
  page, pages, depth, activePageId, dragId, dropPos, onSelect,
}: {
  page: DecryptedPage;
  pages: DecryptedPage[];
  depth: number;
  activePageId: string | null;
  dragId: string | null;
  dropPos: { id: string; pos: "before" | "after" | "into" } | null;
  onSelect: (id: string) => void;
}) {
  const { newPage, newFolder, deletePage, renamePage } = usePagesStore();
  const [expanded, setExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(page.title);

  // ── Drag (handle uniquement) ───────────────────────────────────────────────
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: page.id,
  });

  // ── Drop (toute la ligne) ──────────────────────────────────────────────────
  const isInvalidTarget = dragId === page.id || (dragId ? isDescendantOf(page.id, dragId, pages) : false);
  const { setNodeRef: setDropRef } = useDroppable({
    id: page.id,
    disabled: isInvalidTarget,
  });

  const children = pages
    .filter((p) => p.parentId === page.id && !p.isDeleted)
    .sort((a, b) => a.order - b.order);
  const isActive      = page.id === activePageId;
  const isFolder      = !!page.isFolder;
  const isBeingDragged = isDragging;

  // Feedback visuel drop basé sur dropPos calculé dans le parent
  const showBefore = dropPos?.id === page.id && dropPos.pos === "before";
  const showAfter  = dropPos?.id === page.id && dropPos.pos === "after";
  const showInto   = dropPos?.id === page.id && dropPos.pos === "into";

  function handleRowClick() {
    if (isFolder) {
      setExpanded((v) => !v);
      onSelect(page.id); // Ouvre aussi la FolderView dans la zone principale
    } else {
      onSelect(page.id);
    }
  }

  function commitRename() {
    const title = renameValue.trim() || "Sans titre";
    if (title !== page.title) renamePage(page.id, title);
    setIsRenaming(false);
  }

  return (
    <div ref={setDropRef} className="relative">
      {/* Indicateur AVANT */}
      {showBefore && (
        <div className="absolute top-0 left-3 right-2 h-0.5 bg-[var(--accent)] rounded z-20 pointer-events-none" />
      )}
      {/* Indicateur APRÈS */}
      {showAfter && (
        <div className="absolute bottom-0 left-3 right-2 h-0.5 bg-[var(--accent)] rounded z-20 pointer-events-none" />
      )}
      <div
        className={[
          "group flex items-center gap-1 px-2 py-0.5 mx-1 rounded-md cursor-pointer text-base transition-colors",
          isBeingDragged ? "opacity-30" : "",
          isActive ? "bg-[var(--surface-3)] text-[var(--text)]" : "",
          !isActive && isFolder ? "text-[var(--text)] hover:bg-[var(--surface-2)]" : "",
          !isActive && !isFolder ? "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]" : "",
          showInto ? "outline outline-1 outline-[var(--accent)] bg-[var(--surface-2)]" : "",
        ].filter(Boolean).join(" ")}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
        onClick={handleRowClick}
      >
        {/* Drag handle */}
        <span
          ref={setDragRef}
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 flex items-center justify-center text-[var(--text-faint)] opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0 cursor-grab active:cursor-grabbing transition-opacity"
          title="Déplacer"
        >
          ⠿
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="w-4 h-4 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] shrink-0 text-xs"
        >
          {children.length > 0 ? (expanded ? "▾" : "▸") : " "}
        </button>

        <span className="text-xs opacity-70 mr-0.5">
          {isFolder ? (expanded ? "📂" : "📁") : (page.icon ?? "▪")}
        </span>

        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent outline-none text-sm text-[var(--text)]"
          />
        ) : (
          <span className="flex-1 truncate leading-7">{page.title}</span>
        )}

        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <ActionBtn title="Renommer" onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(page.title); }}>✎</ActionBtn>
          <ActionBtn title={isFolder ? "Nouvelle page dans ce dossier" : "Sous-page"} onClick={(e) => { e.stopPropagation(); newPage("Nouvelle page", page.id); setExpanded(true); }}>+</ActionBtn>
          {isFolder && (
            <ActionBtn title="Sous-dossier" onClick={(e) => { e.stopPropagation(); newFolder("Nouveau dossier", page.id); setExpanded(true); }}>⊞</ActionBtn>
          )}
          <ActionBtn title="Supprimer" onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}>✕</ActionBtn>
        </div>
      </div>

      {expanded && children.map((child) => (
        <PageNode
          key={child.id}
          page={child}
          pages={pages}
          depth={depth + 1}
          activePageId={activePageId}
          dragId={dragId}
          dropPos={dropPos}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ── Sous-menu catégories (affiché inline sous le bouton Calendrier) ───────────

const CAT_COLORS = COLOR_PALETTE;

function CategoriesSubNav({
  activeCategoryId,
  onCategorySelect,
}: {
  activeCategoryId: string | null;
  onCategorySelect: (id: string | null) => void;
}) {
  const { categories, createCategory, updateCategory, deleteCategory } = useCategoriesStore();
  const { events } = useCalendarStore();

  const [creating,  setCreating]  = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newColor,  setNewColor]  = useState(CAT_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName,  setEditName]  = useState("");
  const [colorOpenId, setColorOpenId] = useState<string | null>(null);
  const colorRef = useRef<HTMLDivElement>(null);

  const countById = new Map<string, number>();
  for (const ev of events) {
    countById.set(ev.categoryId, (countById.get(ev.categoryId) ?? 0) + 1);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await createCategory(newName.trim(), newColor);
    setNewName(""); setNewColor(CAT_COLORS[0]); setCreating(false);
  }

  async function handleRename(id: string) {
    if (editName.trim()) await updateCategory(id, { name: editName.trim() });
    setEditingId(null);
  }

  return (
    <div className="ml-3 mt-0.5 mb-1 border-l border-[var(--border)] pl-2 flex flex-col gap-0.5">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-0.5">
        <span className="text-[9px] uppercase tracking-widest text-[var(--text-faint)]">Catégories</span>
        <button
          onClick={() => { setCreating((v) => !v); setNewName(""); }}
          className="text-[var(--accent)] hover:text-[var(--accent-hover)] text-sm leading-none"
          title="Nouvelle catégorie"
        >+</button>
      </div>

      {/* Formulaire création */}
      {creating && (
        <div className="mx-1 p-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex flex-col gap-1.5 mb-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Nom de la catégorie"
            className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap gap-1">
            {CAT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-4 h-4 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: newColor === c ? "var(--text)" : "transparent" }}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleCreate} className="flex-1 text-[11px] py-0.5 rounded bg-[var(--accent)] text-white hover:opacity-90 transition-opacity">
              Créer
            </button>
            <button onClick={() => setCreating(false)} className="text-[11px] px-2 text-[var(--text-faint)] hover:text-[var(--text-muted)]">✕</button>
          </div>
        </div>
      )}

      {/* Liste des catégories */}
      {categories.length === 0 && !creating && (
        <p className="px-2 py-1 text-[11px] text-[var(--text-faint)] italic">Aucune catégorie</p>
      )}

      {/* Entrée virtuelle "Sans catégorie" — 100% locale, pas de sync */}
      {(countById.get(UNCATEGORIZED_ID) ?? 0) > 0 && (
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
            activeCategoryId === UNCATEGORIZED_ID
              ? "bg-[var(--surface-3)] text-[var(--text)]"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          }`}
          onClick={() => onCategorySelect(activeCategoryId === UNCATEGORIZED_ID ? null : UNCATEGORIZED_ID)}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[var(--text-faint)] opacity-50" />
          <span className="flex-1 text-[13px] italic">Sans catégorie</span>
          <span className="text-[10px] text-[var(--text-faint)] shrink-0">{countById.get(UNCATEGORIZED_ID)}</span>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat.id} className="relative group">
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
              activeCategoryId === cat.id
                ? "bg-[var(--surface-3)] text-[var(--text)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            }`}
            onClick={() => {
              if (editingId !== cat.id) onCategorySelect(activeCategoryId === cat.id ? null : cat.id);
            }}
          >
            {/* Point couleur */}
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setColorOpenId(colorOpenId === cat.id ? null : cat.id); }}
                className="w-2.5 h-2.5 rounded-full ring-1 ring-transparent hover:ring-[var(--border-light)] transition-all"
                style={{ backgroundColor: cat.color }}
                title="Changer la couleur"
              />
              {colorOpenId === cat.id && (
                <div
                  ref={colorRef}
                  className="absolute top-full left-0 mt-1 z-40 bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-xl p-2 flex flex-wrap gap-1.5"
                  style={{ minWidth: 110 }}
                  onMouseLeave={() => setColorOpenId(null)}
                >
                  {CAT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={(e) => { e.stopPropagation(); updateCategory(cat.id, { color: c }); setColorOpenId(null); }}
                      className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
                      style={{ backgroundColor: c, borderColor: cat.color === c ? "var(--text)" : "transparent" }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Nom */}
            {editingId === cat.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRename(cat.id)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(cat.id); if (e.key === "Escape") setEditingId(null); }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent outline-none text-xs text-[var(--text)] border-b border-[var(--accent)]"
              />
            ) : (
              <span
                className="flex-1 text-[13px] truncate"
                onDoubleClick={(e) => { e.stopPropagation(); setEditingId(cat.id); setEditName(cat.name); }}
              >
                {cat.name}
              </span>
            )}

            {/* Compteur */}
            <span className="text-[10px] text-[var(--text-faint)] shrink-0">
              {countById.get(cat.id) ?? 0}
            </span>

            {/* Actions hover */}
            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setEditingId(cat.id); setEditName(cat.name); }}
                className="w-4 h-4 flex items-center justify-center text-[10px] text-[var(--text-faint)] hover:text-[var(--accent)] rounded"
                title="Renommer"
              >✎</button>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm(`Supprimer "${cat.name}" ?`)) deleteCategory(cat.id); }}
                className="w-4 h-4 flex items-center justify-center text-[10px] text-[var(--text-faint)] hover:text-[var(--danger)] rounded"
                title="Supprimer"
              >✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionBtn({ title, onClick, children }: {
  title: string;
  onClick: React.MouseEventHandler;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-5 h-5 flex items-center justify-center text-xs text-[var(--text-faint)] hover:text-[var(--accent)] rounded transition-colors"
    >
      {children}
    </button>
  );
}

// ── Icônes UI (toutes en currentColor → suivent le thème) ────────────────────

function LogoIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Arbre stylisé — symbole ROOT */}
      <path d="M12 3 L12 21" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 8 Q8 6 6 9" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M12 12 Q17 10 19 13" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M12 16 Q8 14 7 17" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function NotesIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  );
}

function KanbanIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="5" height="12" rx="1.5"/>
      <rect x="9.5" y="3" width="5" height="7" rx="1.5"/>
      <rect x="16" y="3" width="5" height="16" rx="1.5"/>
    </svg>
  );
}

function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function SettingsIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="4"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/>
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/>
      <line x1="2" y1="12" x2="4" y2="12"/>
      <line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/>
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function TagsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function TrashIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/>
      <path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}
