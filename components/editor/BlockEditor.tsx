"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import type { Editor } from "@tiptap/core";
import { SlashCommandExtension, SLASH_ITEMS } from "./SlashCommandExtension";
import { loadPageAsDocument, savePageDocument } from "@/lib/BlockService";
import { useVaultStore } from "@/stores/vaultStore";
import { LinkIcon, UndoIcon, RedoIcon, TrashIcon, TableIcon } from "@/components/ui/icons";

interface Props {
  pageId: string;
}

const SAVE_DEBOUNCE_MS = 600;
const TABLE_GRID = 6;

// ── Image helpers (defined outside component to avoid stale closures) ─────────

function insertImageFromFile(file: File, ed: Editor): boolean {
  if (!file.type.startsWith("image/")) return false;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const src = ev.target?.result as string;
    if (src) ed.chain().focus().setImage({ src }).run();
  };
  reader.readAsDataURL(file);
  return true;
}

// ── BlockEditor ───────────────────────────────────────────────────────────────

export default function BlockEditor({ pageId }: Props) {
  const { isUnlocked } = useVaultStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageId = useRef(pageId);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // TablePicker state
  const [tablePicker, setTablePicker] = useState<{
    open: boolean; x: number; y: number; editor: Editor | null;
  }>({ open: false, x: 0, y: 0, editor: null });

  // Unified right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; inTable: boolean } | null>(null);

  // ImageUrlPicker state
  const [imagePicker, setImagePicker] = useState<{
    open: boolean; x: number; y: number; editor: Editor | null;
  }>({ open: false, x: 0, y: 0, editor: null });

  // Hub visibility + dynamic centering
  const [editorHovered, setEditorHovered] = useState(false);
  const [hubBounds, setHubBounds] = useState<{ left: number; right: number }>({ left: 360, right: 0 });

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setHubBounds({ left: rect.left, right: window.innerWidth - rect.right });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "tiptap-link" } }),
      Highlight.configure({ multicolor: false }),
      Underline,
      SlashCommandExtension,
    ],
    editorProps: {
      attributes: { class: "tiptap" },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((i) => i.type.startsWith("image/"));
        if (!imageItem) return false;
        const file = imageItem.getAsFile();
        if (!file) return false;
        const ed = (view as unknown as { editor: Editor }).editor;
        return insertImageFromFile(file, ed);
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []);
        const imageFile = files.find((f) => f.type.startsWith("image/"));
        if (!imageFile) return false;
        event.preventDefault();
        const ed = (view as unknown as { editor: Editor }).editor;
        return insertImageFromFile(imageFile, ed);
      },
    },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        savePageDocument(currentPageId.current, editor.getJSON()).catch(console.error);
      }, SAVE_DEBOUNCE_MS);
    },
    immediatelyRender: false,
  });

  // Listen for CustomEvent from SlashCommandExtension to open TablePicker
  useEffect(() => {
    function onOpenTablePicker(e: Event) {
      const { editor: ed } = (e as CustomEvent).detail as { editor: Editor };
      const from = ed.state.selection.from;
      const coords = ed.view.coordsAtPos(from);
      // position: fixed → viewport coords, no scrollY; clamp so picker stays on screen
      const PICKER_H = TABLE_GRID * 24 + 48;
      const y = coords.bottom + 6 + PICKER_H > window.innerHeight
        ? coords.top - PICKER_H - 4
        : coords.bottom + 6;
      setTablePicker({ open: true, x: coords.left, y, editor: ed });
    }
    document.addEventListener("tiptap-open-table-picker", onOpenTablePicker);
    return () => document.removeEventListener("tiptap-open-table-picker", onOpenTablePicker);
  }, []);

  useEffect(() => {
    function onOpenImagePicker(e: Event) {
      const { editor: ed } = (e as CustomEvent).detail as { editor: Editor };
      const from = ed.state.selection.from;
      const coords = ed.view.coordsAtPos(from);
      const PICKER_H = 110;
      const y = coords.bottom + 6 + PICKER_H > window.innerHeight
        ? coords.top - PICKER_H - 4
        : coords.bottom + 6;
      setImagePicker({ open: true, x: coords.left, y, editor: ed });
    }
    document.addEventListener("tiptap-open-image-picker", onOpenImagePicker);
    return () => document.removeEventListener("tiptap-open-image-picker", onOpenImagePicker);
  }, []);

  useEffect(() => {
    if (!editor || !isUnlocked) return;
    currentPageId.current = pageId;

    loadPageAsDocument(pageId)
      .then((doc) => {
        const hasContent = ((doc.content as unknown[]) ?? []).length > 0;
        editor.commands.setContent(hasContent ? doc : { type: "doc", content: [{ type: "paragraph" }] });
      })
      .catch(console.error);

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        savePageDocument(currentPageId.current, editor.getJSON()).catch(console.error);
      }
    };
  }, [pageId, editor, isUnlocked]);

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) editor?.commands.focus("end");
  }, [editor]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!editor) return;
    e.preventDefault();
    // Move cursor to click position
    const result = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (result) editor.chain().setTextSelection(result.pos).run();
    setCtxMenu({ x: e.clientX, y: e.clientY, inTable: editor.isActive("table") });
  }, [editor]);

  if (!isUnlocked) return null;

  return (
    <>
      <div
        ref={wrapperRef}
        className="flex-1 px-16 py-12 cursor-text min-h-screen"
        onClick={handleContainerClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setEditorHovered(true)}
        onMouseLeave={() => setEditorHovered(false)}
      >
        {editor && <BubbleToolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>

      {/* Floating editor hub */}
      {editor && createPortal(
        <FloatingHub editor={editor} visible={editorHovered} hubBounds={hubBounds} />,
        document.body,
      )}

      {/* Right-click context menu */}
      {ctxMenu && editor && createPortal(
        <EditorContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          inTable={ctxMenu.inTable}
          editor={editor}
          onClose={() => setCtxMenu(null)}
        />,
        document.body,
      )}

      {tablePicker.open && tablePicker.editor && createPortal(
        <TablePicker
          x={tablePicker.x}
          y={tablePicker.y}
          editor={tablePicker.editor}
          onClose={() => setTablePicker((s) => ({ ...s, open: false }))}
        />,
        document.body,
      )}

      {imagePicker.open && imagePicker.editor && createPortal(
        <ImageUrlPicker
          x={imagePicker.x}
          y={imagePicker.y}
          editor={imagePicker.editor}
          onClose={() => setImagePicker((s) => ({ ...s, open: false }))}
        />,
        document.body,
      )}
    </>
  );
}

// ── Floating hub ──────────────────────────────────────────────────────────────

function FloatingHub({ editor, visible, hubBounds }: {
  editor: Editor;
  visible: boolean;
  hubBounds: { left: number; right: number };
}) {
  // Re-render on each editor transaction so disabled states stay accurate
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1);
    editor.on("transaction", handler);
    return () => { editor.off("transaction", handler); };
  }, [editor]);

  const inTable = editor.isActive("table");
  const hasSel  = !editor.state.selection.empty;

  return (
    <div
      className="fixed bottom-5 z-[150] flex justify-center"
      style={{ left: hubBounds.left, right: hubBounds.right }}
    >
      <div
        className={[
          "flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-[var(--surface-2)]/90 border border-[var(--border-light)] shadow-2xl backdrop-blur-md",
          "transition-all duration-200 ease-out",
          visible
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-y-3 scale-95 pointer-events-none",
        ].join(" ")}
      >

        {/* Historique */}
        <HubBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Annuler (Ctrl+Z)"
        >
          <UndoIcon size={15} />
        </HubBtn>
        <HubBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Rétablir (Ctrl+Y)"
        >
          <RedoIcon size={15} />
        </HubBtn>

        <HubDivider />

        {/* Formatage texte */}
        <HubBtn active={editor.isActive("bold")}      onClick={() => editor.chain().focus().toggleBold().run()}      title="Gras (Ctrl+B)"><span className="font-bold text-xs">B</span></HubBtn>
        <HubBtn active={editor.isActive("italic")}    onClick={() => editor.chain().focus().toggleItalic().run()}    title="Italique (Ctrl+I)"><em className="text-xs">I</em></HubBtn>
        <HubBtn active={editor.isActive("strike")}    onClick={() => editor.chain().focus().toggleStrike().run()}    title="Barré"><s className="text-xs">S</s></HubBtn>
        <HubBtn active={editor.isActive("code")}      onClick={() => editor.chain().focus().toggleCode().run()}      title="Code"><span className="text-[11px] font-mono">{"`"}</span></HubBtn>

        <HubDivider />

        {/* Blocs */}
        <HubBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Titre 1"><span className="text-[11px] font-bold">H1</span></HubBtn>
        <HubBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Titre 2"><span className="text-[11px] font-bold">H2</span></HubBtn>
        <HubBtn active={editor.isActive("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()}  title="Liste">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>
        </HubBtn>
        <HubBtn active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Liste de tâches">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><polyline points="5 8 6.5 9.5 9 6.5" /><line x1="13" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="13" y1="17" x2="21" y2="17"/></svg>
        </HubBtn>

        <HubDivider />

        {/* Actions contextuelles */}
        {inTable && (
          <HubBtn
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="Supprimer le tableau"
            danger
          >
            <TableIcon size={14} />
          </HubBtn>
        )}
        <HubBtn
          onClick={() => {
            if (hasSel) editor.chain().focus().deleteSelection().run();
            else editor.chain().focus().clearNodes().run();
          }}
          title={hasSel ? "Supprimer la sélection" : "Vider le bloc courant"}
          danger
        >
          <TrashIcon size={14} />
        </HubBtn>
      </div>
    </div>
  );
}

function HubBtn({
  children, onClick, disabled, active, title, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "w-8 h-8 flex items-center justify-center rounded-xl text-sm transition-colors",
        disabled ? "opacity-25 cursor-not-allowed" : "cursor-pointer",
        active
          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
          : danger
          ? "text-[var(--text-faint)] hover:bg-red-500/15 hover:text-[var(--danger)]"
          : "text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text-muted)]",
      ].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}

function HubDivider() {
  return <div className="w-px h-4 bg-[var(--border-light)] mx-0.5 shrink-0" />;
}

// ── Editor right-click context menu ───────────────────────────────────────────

function EditorContextMenu({ x, y, inTable, editor, onClose }: {
  x: number; y: number; inTable: boolean; editor: Editor; onClose: () => void;
}) {
  const MENU_H = inTable ? 440 : 300;
  const top  = Math.min(y, window.innerHeight - MENU_H - 8);
  const left = Math.min(x, window.innerWidth - 224 - 8);

  const ctxBtnClass = "flex items-center gap-2.5 px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] w-full text-left transition-colors rounded-lg";

  return (
    <>
      <div className="fixed inset-0 z-[399]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-[400] bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-2xl py-1.5 min-w-[220px] max-h-[80vh] overflow-y-auto"
        style={{ left, top }}
      >
        {/* Slash command items */}
        <p className="px-3 pt-0.5 pb-1.5 text-[10px] text-[var(--text-faint)] uppercase tracking-widest">
          Insérer
        </p>
        <div className="px-1.5 flex flex-col gap-0.5">
          {SLASH_ITEMS.map((item) => (
            <button
              key={item.title}
              onClick={() => { item.command(editor); onClose(); }}
              className={ctxBtnClass}
            >
              <span className="w-5 h-5 flex items-center justify-center text-xs text-[var(--text-faint)] font-mono shrink-0">
                {item.icon}
              </span>
              <span className="flex flex-col items-start">
                <span className="text-[var(--text)] text-xs font-medium leading-tight">{item.title}</span>
                <span className="text-[var(--text-faint)] text-[10px] leading-tight">{item.description}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Table section — only when cursor is inside a table */}
        {inTable && (
          <>
            <div className="border-t border-[var(--border)] my-1.5 mx-3" />
            <p className="px-3 pb-1.5 text-[10px] text-[var(--text-faint)] uppercase tracking-widest">
              Tableau
            </p>
            <div className="px-1.5 flex flex-col gap-0.5">
              <button onClick={() => { editor.chain().focus().addRowAfter().run(); onClose(); }} className={ctxBtnClass}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="15" x2="12" y2="21"/></svg>
                Ajouter une ligne
              </button>
              <button onClick={() => { editor.chain().focus().addColumnAfter().run(); onClose(); }} className={ctxBtnClass}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="15" y1="12" x2="21" y2="12"/></svg>
                Ajouter une colonne
              </button>
              <button onClick={() => { editor.chain().focus().deleteRow().run(); onClose(); }} className={`${ctxBtnClass} hover:text-[var(--danger)]`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                Supprimer la ligne
              </button>
              <button onClick={() => { editor.chain().focus().deleteColumn().run(); onClose(); }} className={`${ctxBtnClass} hover:text-[var(--danger)]`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
                Supprimer la colonne
              </button>
              <button
                onClick={() => { editor.chain().focus().deleteTable().run(); onClose(); }}
                className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-red-900/20 w-full text-left transition-colors rounded-lg"
              >
                <TrashIcon size={13} /> Supprimer le tableau
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── TablePicker — 6×6 hover grid ──────────────────────────────────────────────

function TablePicker({ x, y, editor, onClose }: {
  x: number; y: number; editor: Editor; onClose: () => void;
}) {
  const [hover, setHover] = useState({ rows: 1, cols: 1 });

  function handleSelect(rows: number, cols: number) {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    onClose();
  }

  return (
    <div
      className="fixed z-[300] bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-2xl p-3 flex flex-col gap-2"
      style={{ top: y, left: x }}
      onMouseLeave={() => setHover({ rows: 1, cols: 1 })}
    >
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: TABLE_GRID }, (_, r) => (
          <div key={r} className="flex gap-0.5">
            {Array.from({ length: TABLE_GRID }, (_, c) => (
              <div
                key={c}
                className={`w-5 h-5 rounded-sm border cursor-pointer transition-colors ${
                  r < hover.rows && c < hover.cols
                    ? "bg-[var(--accent)] border-[var(--accent)]"
                    : "bg-[var(--surface-3)] border-[var(--border)]"
                }`}
                onMouseEnter={() => setHover({ rows: r + 1, cols: c + 1 })}
                onClick={() => handleSelect(hover.rows, hover.cols)}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-center text-[var(--text-faint)]">
        {hover.rows} × {hover.cols}
      </p>
    </div>
  );
}

// ── ImageUrlPicker ────────────────────────────────────────────────────────────

function ImageUrlPicker({ x, y, editor, onClose }: {
  x: number; y: number; editor: Editor; onClose: () => void;
}) {
  const [url, setUrl] = useState("");

  function handleInsert() {
    const trimmed = url.trim();
    if (trimmed) editor.chain().focus().setImage({ src: trimmed }).run();
    onClose();
  }

  return (
    <div
      className="fixed z-[300] bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-2xl p-3 flex flex-col gap-2 w-80"
      style={{ top: y, left: x }}
    >
      <p className="text-xs text-[var(--text-faint)]">URL de l&apos;image</p>
      <input
        autoFocus
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleInsert();
          if (e.key === "Escape") onClose();
        }}
        placeholder="https://..."
        className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent-hover)]"
      />
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] px-2 py-1">Annuler</button>
        <button
          onClick={handleInsert}
          className="text-xs px-3 py-1 rounded-lg bg-[var(--surface-3)] border border-[var(--border-light)] text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
        >
          Insérer
        </button>
      </div>
    </div>
  );
}

// ── Floating bubble toolbar ───────────────────────────────────────────────────

function BubbleToolbar({ editor }: { editor: Editor }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function update() {
      const { from, to, empty } = editor.state.selection;
      if (empty) { setPos(null); return; }

      // Don't show on image selections
      const node = editor.state.doc.nodeAt(from);
      if (node?.type.name === "image") { setPos(null); return; }

      const view = editor.view;
      const start = view.coordsAtPos(from);
      const end   = view.coordsAtPos(to);
      const midX  = (start.left + end.left) / 2;
      const top   = start.top + window.scrollY - 44;
      setPos({ top, left: midX });
    }

    editor.on("selectionUpdate", update);
    editor.on("blur", () => setPos(null));
    return () => {
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  const handleSetLink = useCallback(() => {
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("URL du lien", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!pos) return null;

  return createPortal(
    <div
      className="bubble-menu"
      style={{ position: "absolute", top: pos.top, left: pos.left, transform: "translateX(-50%)", zIndex: 200 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <BubbleBtn active={editor.isActive("bold")}      onClick={() => editor.chain().focus().toggleBold().run()}      title="Gras">B</BubbleBtn>
      <BubbleBtn active={editor.isActive("italic")}    onClick={() => editor.chain().focus().toggleItalic().run()}    title="Italique"><em>I</em></BubbleBtn>
      <BubbleBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Souligné"><u>U</u></BubbleBtn>
      <BubbleBtn active={editor.isActive("strike")}    onClick={() => editor.chain().focus().toggleStrike().run()}    title="Barré"><s>S</s></BubbleBtn>
      <BubbleBtn active={editor.isActive("code")}      onClick={() => editor.chain().focus().toggleCode().run()}      title="Code">{"`"}</BubbleBtn>
      <BubbleBtn active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Surligner">▮</BubbleBtn>
      <div className="bubble-divider" />
      <BubbleBtn active={editor.isActive("link")} onClick={handleSetLink} title="Lien"><LinkIcon size={13} /></BubbleBtn>
    </div>,
    document.body,
  );
}

function BubbleBtn({
  children, active, onClick, title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button className={`bubble-btn${active ? " is-active" : ""}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}
