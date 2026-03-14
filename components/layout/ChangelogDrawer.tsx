"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerClose } from "@/components/ui/drawer";
import { RELEASES, APP_VERSION, type ReleaseType } from "@/lib/changelog";
import { XIcon, GithubIcon } from "@/components/ui/icons";

const TYPE_STYLES: Record<ReleaseType, { label: string; cls: string }> = {
  feat:  { label: "feat",  cls: "bg-[var(--accent)]/15 text-[var(--accent)]" },
  fix:   { label: "fix",   cls: "bg-orange-500/15 text-orange-400" },
  perf:  { label: "perf",  cls: "bg-purple-500/15 text-purple-400" },
  chore: { label: "chore", cls: "bg-[var(--surface-3)] text-[var(--text-faint)]" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

interface Props { onClose: () => void }

export default function ChangelogDrawer({ onClose }: Props) {
  const [open, setOpen] = useState(true);
  function handleClose() { setOpen(false); setTimeout(onClose, 300); }
  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DrawerContent>
        <div className="flex flex-col h-full">

          {/* Header */}
          <div className="view-header flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em] font-mono">
                Changelog
              </h3>
              <span
                className="text-xs font-mono text-[var(--accent)] bg-[var(--surface-3)] px-2.5 py-0.5 rounded-full border border-[var(--accent)]/25"
                style={{ boxShadow: "0 0 8px rgba(var(--accent-rgb) / 0.2)" }}
              >
                v{APP_VERSION}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/Dansnts/ROOT"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors px-2 py-1 rounded hover:bg-[var(--surface-3)]"
                title="Voir sur GitHub"
              >
                <GithubIcon size={14} />
                GitHub
              </a>
              <DrawerClose
                onClick={handleClose}
                className="text-[var(--text-faint)] hover:text-[var(--text-muted)] w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--surface-3)] transition-colors"
              >
                <XIcon size={14} />
              </DrawerClose>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-8">
            {RELEASES.map((release, i) => (
              <div key={release.version} className="flex flex-col gap-3">
                {/* Release header */}
                <div className="flex items-baseline gap-3">
                  <span className={`text-sm font-bold font-mono ${i === 0 ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                    v{release.version}
                  </span>
                  {i === 0 && (
                    <span className="text-[10px] uppercase tracking-wider bg-[var(--accent)]/20 text-[var(--accent)] px-1.5 py-0.5 rounded font-semibold">
                      Actuel
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-faint)] ml-auto font-mono">
                    {formatDate(release.date)}
                  </span>
                </div>

                {/* Changes */}
                <div className="flex flex-col gap-2">
                  {release.changes.map((change, j) => {
                    const { label, cls } = TYPE_STYLES[change.type];
                    return (
                      <div key={j} className="flex items-start gap-2.5">
                        <span className={`shrink-0 mt-0.5 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${cls}`}>
                          {label}
                        </span>
                        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                          {change.text}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {i < RELEASES.length - 1 && (
                  <div className="border-b border-[var(--border)] mt-1" />
                )}
              </div>
            ))}

            {/* Footer lien GitHub */}
            <div className="mt-2 pt-4 border-t border-[var(--border)] flex items-center justify-center">
              <a
                href="https://github.com/Dansnts/ROOT"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors"
              >
                <GithubIcon size={15} />
                github.com/Dansnts/ROOT
              </a>
            </div>
          </div>

        </div>
      </DrawerContent>
    </Drawer>
  );
}
