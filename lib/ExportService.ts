/**
 * ExportService.ts
 *
 * Conversion TipTap JSON ↔ Markdown.
 * Export : chaque page déchiffrée → fichier .md téléchargeable.
 * Import : fichier .md → page + blocs chiffrés dans IndexedDB.
 */

import { loadAllPages, loadPageBlocks, createPage, savePageDocument } from "./BlockService";

// ── TipTap JSON → Markdown ────────────────────────────────────────────────────

function marksToMarkdown(text: string, marks: { type: string }[] = []): string {
  let result = text;
  for (const mark of marks) {
    if (mark.type === "bold")   result = `**${result}**`;
    if (mark.type === "italic") result = `_${result}_`;
    if (mark.type === "code")   result = `\`${result}\``;
    if (mark.type === "strike") result = `~~${result}~~`;
  }
  return result;
}

function inlineToMarkdown(node: Record<string, unknown>): string {
  if (node.type === "text") {
    return marksToMarkdown(
      (node.text as string) ?? "",
      (node.marks as { type: string }[]) ?? []
    );
  }
  if (node.type === "hardBreak") return "  \n";
  return "";
}

function contentToInline(node: Record<string, unknown>): string {
  const children = (node.content as Record<string, unknown>[]) ?? [];
  return children.map(inlineToMarkdown).join("");
}

function listItemToMarkdown(node: Record<string, unknown>, prefix: string): string {
  const children = (node.content as Record<string, unknown>[]) ?? [];
  const firstPara = children[0];
  const text = firstPara ? contentToInline(firstPara) : "";
  return `${prefix}${text}`;
}

function nodeToMarkdown(node: Record<string, unknown>, listIndex?: number): string {
  const type = node.type as string;
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;

  switch (type) {
    case "heading": {
      const level = (attrs.level as number) ?? 1;
      return `${"#".repeat(level)} ${contentToInline(node)}`;
    }
    case "paragraph": {
      const text = contentToInline(node);
      return text || "";
    }
    case "bulletList": {
      const items = (node.content as Record<string, unknown>[]) ?? [];
      return items.map((li) => listItemToMarkdown(li, "- ")).join("\n");
    }
    case "orderedList": {
      const items = (node.content as Record<string, unknown>[]) ?? [];
      return items
        .map((li, i) => listItemToMarkdown(li, `${i + 1}. `))
        .join("\n");
    }
    case "taskList": {
      const items = (node.content as Record<string, unknown>[]) ?? [];
      return items
        .map((li) => {
          const checked = ((li.attrs as Record<string, unknown>)?.checked as boolean) ?? false;
          return listItemToMarkdown(li, checked ? "- [x] " : "- [ ] ");
        })
        .join("\n");
    }
    case "blockquote": {
      const children = (node.content as Record<string, unknown>[]) ?? [];
      return children
        .map((n) => `> ${contentToInline(n)}`)
        .join("\n");
    }
    case "codeBlock": {
      const lang = (attrs.language as string) ?? "";
      return `\`\`\`${lang}\n${contentToInline(node)}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    default:
      return contentToInline(node);
  }

  void listIndex;
}

function documentToMarkdown(title: string, nodes: Record<string, unknown>[]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const node of nodes) {
    const md = nodeToMarkdown(node);
    if (md) lines.push(md, "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportPageAsMarkdown(pageId: string, title: string): Promise<void> {
  const blocks = await loadPageBlocks(pageId);
  const nodes = blocks.map((b) => b.content);
  const md = documentToMarkdown(title, nodes);

  const blob = new Blob([md], { type: "text/markdown; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAllPagesAsMarkdown(): Promise<void> {
  const pages = await loadAllPages();
  if (pages.length === 0) return;

  // Si une seule page, téléchargement direct
  if (pages.length === 1) {
    await exportPageAsMarkdown(pages[0].id, pages[0].title);
    return;
  }

  // Plusieurs pages → concaténation en un seul fichier
  const sections: string[] = [];
  for (const page of pages.sort((a, b) => a.createdAt - b.createdAt)) {
    const blocks = await loadPageBlocks(page.id);
    const nodes = blocks.map((b) => b.content);
    sections.push(documentToMarkdown(page.title, nodes));
  }

  const blob = new Blob([sections.join("\n---\n\n")], {
    type: "text/markdown; charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "root_export.md";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import Markdown → Page ────────────────────────────────────────────────────

function markdownToTipTapDoc(md: string): Record<string, unknown> {
  const lines = md.split("\n");
  const nodes: Record<string, unknown>[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      nodes.push({
        type: "heading",
        attrs: { level },
        content: [{ type: "text", text: headingMatch[2] }],
      });
      i++;
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push({
        type: "codeBlock",
        attrs: { language: lang || null },
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push({
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: line.slice(2) }] }],
      });
      i++;
      continue;
    }

    // Bullet list item
    if (/^[-*+]\s/.test(line)) {
      const items: Record<string, unknown>[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: lines[i].slice(2) }] }],
        });
        i++;
      }
      nodes.push({ type: "bulletList", content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: Record<string, unknown>[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const text = lines[i].replace(/^\d+\.\s/, "");
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        });
        i++;
      }
      nodes.push({ type: "orderedList", content: items });
      continue;
    }

    // Task list
    if (/^- \[(x| )\]\s/.test(line)) {
      const items: Record<string, unknown>[] = [];
      while (i < lines.length && /^- \[(x| )\]\s/.test(lines[i])) {
        const checked = lines[i][3] === "x";
        const text = lines[i].slice(6);
        items.push({
          type: "taskItem",
          attrs: { checked },
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        });
        i++;
      }
      nodes.push({ type: "taskList", content: items });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    nodes.push({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    });
    i++;
  }

  return { type: "doc", content: nodes.length ? nodes : [{ type: "paragraph" }] };
}

export async function importMarkdownFile(file: File): Promise<void> {
  const text = await file.text();

  // Titre = nom du fichier sans extension (ou première ligne H1 si présente)
  let title = file.name.replace(/\.md$/i, "").replace(/_/g, " ");
  const firstLine = text.split("\n")[0];
  if (firstLine.startsWith("# ")) title = firstLine.slice(2).trim();

  const page = await createPage(title);
  const doc = markdownToTipTapDoc(text);
  await savePageDocument(page.id, doc);
}
