"use client";

import type { ReactNode } from "react";

export function Breadcrumb({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="breadcrumb">
      {children}
    </nav>
  );
}

export function BreadcrumbList({ children }: { children: ReactNode }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs text-[var(--text-faint)]">
      {children}
    </ol>
  );
}

export function BreadcrumbItem({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1">
      {children}
    </li>
  );
}

export function BreadcrumbLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:text-[var(--text)] transition-colors truncate max-w-[150px]"
    >
      {children}
    </button>
  );
}

export function BreadcrumbPage({ children }: { children: ReactNode }) {
  return (
    <span className="text-[var(--text-muted)] font-medium truncate max-w-[200px]">
      {children}
    </span>
  );
}

export function BreadcrumbSeparator() {
  return (
    <li role="presentation" aria-hidden="true" className="text-[var(--border-light)] text-xs">
      /
    </li>
  );
}
