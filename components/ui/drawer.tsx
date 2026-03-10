"use client";

import { Drawer as DrawerPrimitive } from "vaul";
import type { ReactNode } from "react";

interface DrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function Drawer({ open, onOpenChange, children }: DrawerProps) {
  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      direction="right"
    >
      {children}
    </DrawerPrimitive.Root>
  );
}

export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;

export function DrawerContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]" />
      <DrawerPrimitive.Content
        className={`fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-[var(--surface-2)] border-l border-[var(--border-light)] shadow-2xl outline-none w-[520px] max-w-[calc(100vw-2rem)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${className}`}
      >
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}
