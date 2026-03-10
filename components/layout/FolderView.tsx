"use client";

import { type DecryptedPage } from "@/lib/BlockService";
import { usePagesStore } from "@/stores/pagesStore";
import { ArrowLeftIcon, FolderIcon, FolderOpenIcon, FileIcon } from "@/components/ui/icons";

interface Props {
  folder: DecryptedPage;
  pages: DecryptedPage[];
  onNavigate: (id: string) => void;
}

export default function FolderView({ folder, pages, onNavigate }: Props) {
  const { renamePage } = usePagesStore();

  // Chemin complet : ancestors du plus vieux au plus récent
  function buildBreadcrumb(page: DecryptedPage): DecryptedPage[] {
    const path: DecryptedPage[] = [];
    let cur: DecryptedPage | undefined = page;
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? pages.find((p) => p.id === cur!.parentId) : undefined;
    }
    return path;
  }

  const breadcrumb = buildBreadcrumb(folder);
  const parent     = folder.parentId ? pages.find((p) => p.id === folder.parentId) : null;

  // Enfants directs
  const children = pages
    .filter((p) => p.parentId === folder.id && !p.isDeleted)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="px-16 pt-16 pb-16 max-w-3xl min-h-full">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-[var(--text-faint)] font-mono mb-8 flex-wrap">
        {parent && (
          <button
            onClick={() => onNavigate(parent.id)}
            className="flex items-center gap-1 text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors"
            title="Remonter"
          >
            <ArrowLeftIcon size={14} /> <span className="flex items-center gap-1">{parent.isFolder ? <FolderIcon size={13} /> : <FileIcon size={13} />} {parent.title}</span>
          </button>
        )}
        {!parent && (
          <span className="text-[var(--text-faint)]">Racine</span>
        )}
        {breadcrumb.slice(0, -1).map((p) => (
          <span key={p.id} className="flex items-center gap-1">
            <span className="mx-1 opacity-40">/</span>
            <button
              onClick={() => onNavigate(p.id)}
              className="hover:text-[var(--accent)] transition-colors"
            >
              {p.title}
            </button>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="mx-1 opacity-40">/</span>
          <span className="text-[var(--text-muted)]">{folder.title}</span>
        </span>
      </div>

      {/* Titre du dossier */}
      <div className="mb-2">
        <input
          key={folder.id}
          defaultValue={folder.title}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== folder.title) renamePage(folder.id, v);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="bg-transparent outline-none text-4xl font-bold text-[var(--text)] placeholder:text-[var(--text-faint)] w-full tracking-tight"
          placeholder="Sans titre"
        />
      </div>

      <p className="text-sm text-[var(--text-faint)] font-mono mb-10">
        {children.length === 0 ? "Dossier vide" : `${children.length} élément${children.length > 1 ? "s" : ""}`}
      </p>

      {/* Arborescence style terminal */}
      {children.length > 0 && (
        <div className="font-mono text-sm leading-7">
          <TerminalTree
            parentId={folder.id}
            pages={pages}
            prefix=""
            onNavigate={onNavigate}
          />
        </div>
      )}

      {children.length === 0 && (
        <div className="font-mono text-[var(--text-faint)] text-sm">
          <span className="text-[var(--accent)]">$</span> ls -la<br />
          <span className="opacity-50">total 0</span><br />
          <span className="opacity-50 italic">Ce dossier est vide.</span>
        </div>
      )}
    </div>
  );
}

// ── Arborescence récursive ─────────────────────────────────────────────────────

function TerminalTree({
  parentId,
  pages,
  prefix,
  onNavigate,
}: {
  parentId: string;
  pages: DecryptedPage[];
  prefix: string;
  onNavigate: (id: string) => void;
}) {
  const children = pages
    .filter((p) => p.parentId === parentId && !p.isDeleted)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      {children.map((child, i) => {
        const isLast       = i === children.length - 1;
        const connector    = isLast ? "└── " : "├── ";
        const childPrefix  = prefix + (isLast ? "    " : "│   ");
        const hasChildren  = pages.some((p) => p.parentId === child.id && !p.isDeleted);
        const icon         = child.isFolder ? (hasChildren ? <FolderOpenIcon size={13} /> : <FolderIcon size={13} />) : <FileIcon size={13} />;

        return (
          <div key={child.id}>
            {/* Ligne principale */}
            <div className="flex items-center">
              <span className="text-[var(--text-faint)] select-none whitespace-pre">{prefix}</span>
              <span className="text-[var(--border-light)] select-none">{connector}</span>
              <button
                onClick={() => onNavigate(child.id)}
                className={`flex items-center gap-1.5 group transition-colors ${
                  child.isFolder
                    ? "text-[var(--text)] hover:text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                <span className="text-[var(--text-faint)] flex items-center">{icon}</span>
                <span className={child.isFolder ? "font-semibold" : ""}>
                  {child.title}
                </span>
                {child.isFolder && hasChildren && (
                  <span className="text-[var(--text-faint)] text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    /
                  </span>
                )}
              </button>
            </div>

            {/* Enfants récursifs */}
            {hasChildren && (
              <TerminalTree
                parentId={child.id}
                pages={pages}
                prefix={childPrefix}
                onNavigate={onNavigate}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
