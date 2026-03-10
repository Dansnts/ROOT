"use client";

import { Toaster as Sonner } from "sonner";
import type { ComponentProps } from "react";

export function Toaster(props: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--surface-2)",
          border: "1px solid var(--border-light)",
          color: "var(--text)",
          fontSize: "13px",
          fontFamily: "var(--font-geist-mono, monospace)",
        },
        classNames: {
          toast: "rounded-xl shadow-xl",
          title: "font-medium",
          description: "text-[var(--text-muted)] text-xs",
          actionButton: "bg-[var(--accent)] text-white text-xs px-2 py-1 rounded",
          cancelButton: "text-[var(--text-faint)] text-xs",
        },
      }}
      {...props}
    />
  );
}

export { toast } from "sonner";
