"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { SlashCommandExtension } from "./SlashCommandExtension";
import { loadPageAsDocument, savePageDocument } from "@/lib/BlockService";
import { useVaultStore } from "@/stores/vaultStore";

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

  // TablePicker state
  const [tablePicker, setTablePicker] = useState<{
    open: boolean; x: number; y: number; editor: Editor | null;
  }>({ open: false, x: 0, y: 0, editor: null });

  // ImageUrlPicker state
  const [imagePicker, setImagePicker] = useState<{
    open: boolean; x: number; y: number; editor: Editor | null;
  }>({ open: false, x: 0, y: 0, editor: null });

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
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [pageId, editor, isUnlocked]);

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only focus at end when clicking the padding area, not the editor content itself
    if (e.target === e.currentTarget) {
      editor?.commands.focus("end");
    }
  }, [editor]);

  if (!isUnlocked) return null;

  return (
    <div
      className="flex-1 px-16 py-12 cursor-text min-h-screen"
      onClick={handleContainerClick}
    >
      {editor && <BubbleToolbar editor={editor} />}
      <EditorContent editor={editor} />

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
    </div>
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
      <BubbleBtn active={editor.isActive("link")} onClick={handleSetLink} title="Lien">🔗</BubbleBtn>
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
