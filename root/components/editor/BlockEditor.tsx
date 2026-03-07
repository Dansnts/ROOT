"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
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

  // Charger le contenu depuis IndexedDB quand la page change
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
      <EditorContent editor={editor} />
    </div>
  );
}
