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

export default function BlockEditor({ pageId }: Props) {
  const { isUnlocked } = useVaultStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageId = useRef(pageId);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "Écrivez quelque chose, ou tapez '/' pour les commandes…" }),
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
    },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        savePageDocument(currentPageId.current, editor.getJSON()).catch(console.error);
      }, SAVE_DEBOUNCE_MS);
    },
    immediatelyRender: false,
  });

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

  const handleContainerClick = useCallback(() => {
    editor?.commands.focus("end");
  }, [editor]);

  if (!isUnlocked) return null;

  return (
    <div
      className="flex-1 px-16 py-12 cursor-text min-h-screen"
      onClick={handleContainerClick}
    >
      {editor && <BubbleToolbar editor={editor} />}
      <EditorContent editor={editor} />
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
