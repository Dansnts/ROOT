import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { type Editor, ReactRenderer } from "@tiptap/react";
import React, { type ReactNode } from "react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import SlashMenu from "./SlashMenu";
import { CheckSquareIcon, ImageIcon, TableIcon } from "@/components/ui/icons";

export interface SlashCommandItem {
  title: string;
  icon: ReactNode;
  description: string;
  command: (editor: Editor) => void;
}

export const SLASH_ITEMS: SlashCommandItem[] = [
  {
    title: "Texte",
    icon: "¶",
    description: "Paragraphe simple",
    command: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    title: "Gras",
    icon: "B",
    description: "Texte en gras",
    command: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    title: "Italique",
    icon: "I",
    description: "Texte en italique",
    command: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    title: "Titre 1",
    icon: "H1",
    description: "Grande section",
    command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Titre 2",
    icon: "H2",
    description: "Section",
    command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Titre 3",
    icon: "H3",
    description: "Sous-section",
    command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Liste à puces",
    icon: "•",
    description: "Liste non ordonnée",
    command: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Liste numérotée",
    icon: "1.",
    description: "Liste ordonnée",
    command: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "Cases à cocher",
    icon: React.createElement(CheckSquareIcon, { size: 14 }),
    description: "Liste de tâches",
    command: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Citation",
    icon: "❝",
    description: "Bloc de citation",
    command: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Code",
    icon: "</>",
    description: "Bloc de code",
    command: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Séparateur",
    icon: "—",
    description: "Ligne horizontale",
    command: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    title: "Tableau",
    icon: React.createElement(TableIcon, { size: 14 }),
    description: "Tableau taille personnalisée",
    command: (e) => {
      document.dispatchEvent(new CustomEvent("tiptap-open-table-picker", { detail: { editor: e } }));
    },
  },
  {
    title: "Image",
    icon: React.createElement(ImageIcon, { size: 14 }),
    description: "Image depuis une URL",
    command: (e) => {
      document.dispatchEvent(new CustomEvent("tiptap-open-image-picker", { detail: { editor: e } }));
    },
  },
];

const suggestionConfig: Omit<SuggestionOptions, "editor"> = {
  char: "/",
  startOfLine: false,
  command({ editor, range, props }) {
    props.command(editor);
    editor.chain().focus().deleteRange(range).run();
  },
  items({ query }) {
    return SLASH_ITEMS.filter(
      (item) =>
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.description.toLowerCase().includes(query.toLowerCase())
    );
  },
  render() {
    let component: ReactRenderer;
    let popup: TippyInstance[];

    return {
      onStart(props) {
        component = new ReactRenderer(SlashMenu, { props, editor: props.editor });
        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
          theme: "none",
          arrow: false,
        });
      },
      onUpdate(props) {
        component.updateProps(props);
        popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
      },
      onKeyDown(props) {
        if (props.event.key === "Escape") { popup[0].hide(); return true; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (component.ref as any)?.onKeyDown?.(props) ?? false;
      },
      onExit() {
        popup[0].destroy();
        component.destroy();
      },
    };
  },
};

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",
  addOptions() {
    return { suggestion: suggestionConfig };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({ editor: this.editor, ...this.options.suggestion }),
    ];
  },
});
