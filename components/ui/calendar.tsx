"use client";

import { DayPicker } from "react-day-picker";
import { fr } from "date-fns/locale";
import type { ComponentProps } from "react";

export type CalendarProps = ComponentProps<typeof DayPicker>;

export function Calendar({ className = "", ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={fr}
      weekStartsOn={1}
      showOutsideDays
      fixedWeeks
      className={`p-3 select-none relative w-fit mx-auto ${className}`}
      classNames={{
        months: "flex flex-col",
        month: "space-y-2",
        month_caption: "flex justify-center items-center h-8 mb-1",
        caption_label: "text-sm font-medium text-[var(--text)] capitalize",
        nav: "absolute top-0 left-0 right-0 flex items-center justify-between h-8 pointer-events-none",
        button_previous:
          "pointer-events-auto p-1 w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors",
        button_next:
          "pointer-events-auto p-1 w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors",
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday:
          "text-[var(--text-faint)] text-[11px] w-9 font-normal text-center py-1",
        week: "flex mt-0.5",
        day: "h-9 w-9 text-center p-0",
        day_button:
          "h-9 w-9 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
        selected:
          "[&>button]:bg-[var(--accent)] [&>button]:text-white [&>button]:hover:bg-[var(--accent)] [&>button]:hover:text-white",
        today:
          "[&>button]:border [&>button]:border-[var(--accent)] [&>button]:text-[var(--accent)] [&>button]:font-semibold",
        outside: "opacity-30",
        disabled: "opacity-20 pointer-events-none",
      }}
      components={{
        Chevron: ({ orientation }) => (
          <span className="text-sm leading-none font-bold">
            {orientation === "left" ? "‹" : "›"}
          </span>
        ),
      }}
      {...props}
    />
  );
}

// Utility: YYYY-MM-DD string ↔ Date (local timezone)
export function dateFromStr(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function strFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
