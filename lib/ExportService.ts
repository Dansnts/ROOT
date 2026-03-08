/**
 * ExportService.ts
 *
 * Conversion TipTap JSON ↔ Markdown.
 * Export : chaque page déchiffrée → différents formats.
 * Import : fichier .md → page + blocs chiffrés dans IndexedDB.
 */

import { zipSync, strToU8 } from "fflate";
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

function nodeToMarkdown(node: Record<string, unknown>): string {
  const type = node.type as string;
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;

  switch (type) {
    case "heading": {
      const level = (attrs.level as number) ?? 1;
      return `${"#".repeat(level)} ${contentToInline(node)}`;
    }
    case "paragraph":
      return contentToInline(node) || "";
    case "bulletList": {
      const items = (node.content as Record<string, unknown>[]) ?? [];
      return items.map((li) => listItemToMarkdown(li, "- ")).join("\n");
    }
    case "orderedList": {
      const items = (node.content as Record<string, unknown>[]) ?? [];
      return items.map((li, i) => listItemToMarkdown(li, `${i + 1}. `)).join("\n");
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
      return children.map((n) => `> ${contentToInline(n)}`).join("\n");
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
}

function documentToMarkdown(title: string, nodes: Record<string, unknown>[]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const node of nodes) {
    const md = nodeToMarkdown(node);
    if (md) lines.push(md, "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function safeFilename(title: string): string {
  return title.replace(/[^a-z0-9\-_()[\] ]/gi, "_").trim() || "page";
}

// ── Collect all pages as markdown strings ─────────────────────────────────────

async function collectAllPages(): Promise<{ title: string; filename: string; md: string }[]> {
  const pages = (await loadAllPages()).sort((a, b) => a.createdAt - b.createdAt);
  const result = [];
  for (const page of pages) {
    const blocks = await loadPageBlocks(page.id);
    const nodes = blocks.map((b) => b.content);
    const md = documentToMarkdown(page.title, nodes);
    result.push({ title: page.title, filename: safeFilename(page.title) + ".md", md });
  }
  return result;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Export formats ────────────────────────────────────────────────────────────

/** ZIP : un .md par page dans une archive. */
export async function exportAllPagesZip(): Promise<void> {
  const pages = await collectAllPages();
  if (pages.length === 0) return;

  const files: Record<string, Uint8Array> = {};
  // Dédoublonner les noms de fichiers
  const seen = new Map<string, number>();
  for (const { filename, md } of pages) {
    const count = seen.get(filename) ?? 0;
    seen.set(filename, count + 1);
    const finalName = count === 0 ? filename : filename.replace(/\.md$/, `_${count}.md`);
    files[finalName] = strToU8(md);
  }

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `root_export_${date}.zip`);
}

/** Fichier unique : toutes les pages concaténées en un seul .md. */
export async function exportAllPagesSingleFile(): Promise<void> {
  const pages = await collectAllPages();
  if (pages.length === 0) return;
  if (pages.length === 1) {
    triggerDownload(new Blob([pages[0].md], { type: "text/markdown; charset=utf-8" }), pages[0].filename);
    return;
  }
  const combined = pages.map((p) => p.md).join("\n---\n\n");
  triggerDownload(
    new Blob([combined], { type: "text/markdown; charset=utf-8" }),
    `root_export_${new Date().toISOString().slice(0, 10)}.md`
  );
}

/** Fichiers séparés : un téléchargement par page. */
export async function exportAllPagesMultiple(): Promise<void> {
  const pages = await collectAllPages();
  if (pages.length === 0) return;
  const seen = new Map<string, number>();
  for (const { filename, md } of pages) {
    const count = seen.get(filename) ?? 0;
    seen.set(filename, count + 1);
    const finalName = count === 0 ? filename : filename.replace(/\.md$/, `_${count}.md`);
    triggerDownload(new Blob([md], { type: "text/markdown; charset=utf-8" }), finalName);
    // Petit délai pour que le navigateur ne bloque pas les téléchargements multiples
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Dossier : File System Access API (Chrome/Edge uniquement). */
export async function exportAllPagesFolder(): Promise<void> {
  if (!("showDirectoryPicker" in window)) {
    throw new Error("Votre navigateur ne supporte pas la sélection de dossier (utilisez Chrome ou Edge).");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
  const pages = await collectAllPages();
  const seen = new Map<string, number>();

  for (const { filename, md } of pages) {
    const count = seen.get(filename) ?? 0;
    seen.set(filename, count + 1);
    const finalName = count === 0 ? filename : filename.replace(/\.md$/, `_${count}.md`);
    const fileHandle = await dirHandle.getFileHandle(finalName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(md);
    await writable.close();
  }
}

// ── Compat alias ──────────────────────────────────────────────────────────────

/** @deprecated — utilisé en interne ou pour export page unique */
export async function exportPageAsMarkdown(pageId: string, title: string): Promise<void> {
  const blocks = await loadPageBlocks(pageId);
  const nodes = blocks.map((b) => b.content);
  const md = documentToMarkdown(title, nodes);
  triggerDownload(
    new Blob([md], { type: "text/markdown; charset=utf-8" }),
    safeFilename(title) + ".md"
  );
}

/** @deprecated — remplacé par les 4 formats ci-dessus */
export async function exportAllPagesAsMarkdown(): Promise<void> {
  await exportAllPagesSingleFile();
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

    // Task list (avant bullet list pour matcher "- [x]" avant "- ")
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

    // Bullet list
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

  let title = file.name.replace(/\.md$/i, "").replace(/_/g, " ");
  const firstLine = text.split("\n")[0];
  if (firstLine.startsWith("# ")) title = firstLine.slice(2).trim();

  const page = await createPage(title);
  const doc = markdownToTipTapDoc(text);
  await savePageDocument(page.id, doc);
}
