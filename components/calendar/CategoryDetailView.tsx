"use client";

import { useEffect, useState } from "react";
import { useCalendarStore, type StoreEvent, UNCATEGORIZED_ID } from "@/stores/calendarStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { KANBAN_PAGE_ID } from "@/lib/constants";

interface Props {
  categoryId: string;
  onBack: () => void;
}

export default function CategoryDetailView({ categoryId, onBack }: Props) {
  const { events, loadEvents, moveEventToCategory, deleteEvent, deleteEventLocal } = useCalendarStore();
  const { categories } = useCategoriesStore();
  const [reassignId, setReassignId] = useState<string | null>(null);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const isUncategorized = categoryId === UNCATEGORIZED_ID;
  const isKanban        = categoryId === KANBAN_PAGE_ID;
  const category =
    isUncategorized ? { id: UNCATEGORIZED_ID, name: "Sans catégorie", color: "#6b7280" } :
    isKanban        ? { id: KANBAN_PAGE_ID,    name: "Kanban",          color: "#5b6a7a" } :
    categories.find((c) => c.id === categoryId);
  const catEvents = events
    .filter((e) => e.categoryId === categoryId)
    .sort((a, b) => a.start.localeCompare(b.start));

  const today = new Date().toISOString().split("T")[0];
  const now   = new Date();
  const dow   = now.getDay(); // 0=dim
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((dow + 6) % 7)); // lundi
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const startOfWeekStr = startOfWeek.toISOString().split("T")[0];
  const endOfWeekStr   = endOfWeek.toISOString().split("T")[0];
  const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const endOfMonth     = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const stats = {
    total:     catEvents.length,
    past:      catEvents.filter((e) => e.start < today).length,
    upcoming:  catEvents.filter((e) => e.start >= today).length,
    thisWeek:  catEvents.filter((e) => e.start >= startOfWeekStr && e.start <= endOfWeekStr).length,
    thisMonth: catEvents.filter((e) => e.start >= startOfMonth && e.start <= endOfMonth).length,
    synced:    catEvents.filter((e) => e.synced).length,
  };

  // Grouper par mois
  const grouped = new Map<string, StoreEvent[]>();
  for (const ev of catEvents) {
    const [y, m] = ev.start.split("-");
    const key = `${y}-${m}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ev);
  }
  const monthKeys = Array.from(grouped.keys()).sort();

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  };

  const dayLabel = (dateStr: string) =>
    new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <span>←</span> Retour
        </button>
        <div className="w-px h-4 bg-[var(--border)]" />
        {category && (
          <div className="flex items-center gap-2 flex-1">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
            <h1 className="text-lg font-semibold text-[var(--text)]">{category.name}</h1>
          </div>
        )}

        {/* Bouton vider — suppression locale uniquement */}
        {catEvents.length > 0 && (
          <button
            onClick={async () => {
              if (!confirm(`Supprimer les ${catEvents.length} événements localement ?`)) return;
              for (const ev of catEvents) {
                await deleteEventLocal(ev.id);
              }
            }}
            className="text-xs px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--danger)] hover:border-[var(--danger)] transition-colors shrink-0"
          >
            🗑 Tout supprimer
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-[var(--border)] shrink-0">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="À venir" value={stats.upcoming} accent />
        <StatCard label="Passés" value={stats.past} />
        <StatCard label="Cette semaine" value={stats.thisWeek} />
        <StatCard label="Ce mois" value={stats.thisMonth} />
        <StatCard label="Synchronisés" value={stats.synced} />
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {catEvents.length === 0 && (
          <p className="text-sm text-[var(--text-faint)] text-center py-12">
            Aucun événement dans cette catégorie.
          </p>
        )}

        {monthKeys.map((key) => (
          <div key={key} className="mb-6">
            <h2 className="text-xs uppercase tracking-widest text-[var(--text-faint)] mb-2 capitalize">
              {monthLabel(key)}
            </h2>
            <div className="flex flex-col gap-1">
              {grouped.get(key)!.map((ev) => {
                const isPast = ev.start < today;
                const isToday = ev.start === today;
                return (
                  <div key={ev.id} className="relative">
                    <div
                      className={`flex items-start gap-3 px-3 py-2 rounded-lg border transition-colors ${
                        isToday
                          ? "border-[var(--accent)] bg-[var(--surface-2)]"
                          : "border-transparent hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <div
                        className="w-1 rounded-full shrink-0 mt-0.5"
                        style={{ backgroundColor: ev.color, height: 36 }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isPast && !isToday ? "text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
                          {ev.title}
                        </p>
                        <p className="text-xs text-[var(--text-faint)]">
                          {dayLabel(ev.start)}
                          {ev.end && ev.end !== ev.start && ` → ${dayLabel(ev.end)}`}
                          {ev.location && ` · ${ev.location}`}
                        </p>
                      </div>
                      {isToday && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-white shrink-0">
                          Auj.
                        </span>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Réassigner (Sans catégorie uniquement) */}
                        {isUncategorized && categories.length > 0 && (
                          <button
                            onClick={() => setReassignId(reassignId === ev.id ? null : ev.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                            title="Assigner à une catégorie"
                          >
                            ⇄
                          </button>
                        )}
                        {/* Supprimer */}
                        <button
                          onClick={async () => {
                            if (isUncategorized || isKanban) {
                              await deleteEventLocal(ev.id);
                            } else {
                              if (confirm(`Supprimer "${ev.title}" ?`)) await deleteEvent(ev.id);
                            }
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--danger)] hover:border-[var(--danger)] transition-colors"
                          title="Supprimer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Popup réassignation */}
                    {reassignId === ev.id && (
                      <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--surface-2)] border border-[var(--border-light)] rounded-xl shadow-xl p-2 flex flex-col gap-1 min-w-[180px]">
                        <p className="text-[10px] text-[var(--text-faint)] px-1 pb-1 border-b border-[var(--border)]">
                          Assigner à…
                        </p>
                        {categories.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={async () => {
                              await moveEventToCategory(ev.id, cat.id);
                              setReassignId(null);
                            }}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left hover:bg-[var(--surface-3)] transition-colors"
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-[var(--text)] truncate">{cat.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
      <span className={`text-2xl font-bold ${accent ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
        {value}
      </span>
      <span className="text-[11px] text-[var(--text-faint)]">{label}</span>
    </div>
  );
}
