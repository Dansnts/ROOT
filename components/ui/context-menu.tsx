"use client";

import * as CM from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";

export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;

export function ContextMenuContent({
  children,
  ...props
}: CM.ContextMenuContentProps) {
  return (
    <CM.Portal>
      <CM.Content
        className="z-50 min-w-[170px] bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-xl p-1.5 flex flex-col gap-0.5"
        {...props}
      >
        {children}
      </CM.Content>
    </CM.Portal>
  );
}

export function ContextMenuItem({
  children,
  className = "",
  danger = false,
  ...props
}: CM.ContextMenuItemProps & { danger?: boolean }) {
  return (
    <CM.Item
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm cursor-default outline-none transition-colors
        ${danger
          ? "text-[var(--danger)] data-[highlighted]:bg-red-900/20 data-[highlighted]:text-[var(--danger)]"
          : "text-[var(--text-muted)] data-[highlighted]:bg-[var(--surface-3)] data-[highlighted]:text-[var(--text)]"
        } ${className}`}
      {...props}
    >
      {children}
    </CM.Item>
  );
}

export function ContextMenuSeparator() {
  return (
    <CM.Separator className="my-1 border-b border-[var(--border)]" />
  );
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return (
    <CM.Label className="px-2.5 py-1 text-[10px] text-[var(--text-faint)] uppercase tracking-widest">
      {children}
    </CM.Label>
  );
}
