"use client";

import { useEffect, useMemo, useState } from "react";
import { useKanbanStore } from "@/stores/kanbanStore";
import { useTagsStore } from "@/stores/tagsStore";
import type { KanbanTask } from "@/lib/KanbanService";
import type { TagDefinition, TaskPriority } from "@/lib/database";

// ── Constantes priorités ───────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 5, high: 4, medium: 3, low: 1, none: 0,
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgente", high: "Haute", medium: "Moyenne", low: "Basse", none: "Aucune",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: "#ef4444", high: "#f97316", medium: "#f59e0b",
  low: "#22c55e", none: "#6b7280",
};

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-red-400", high: "bg-orange-400", medium: "bg-amber-400",
  low: "bg-green-400", none: "opacity-40 bg-[var(--text-faint)]",
};

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low", "none"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function StatsView() {
  const { tasks, loadTasks } = useKanbanStore();
  const { tags, loadTags }   = useTagsStore();
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  useEffect(() => { loadTasks(); loadTags(); }, [loadTasks, loadTags]);

  const { monday, sunday } = useMemo(getWeekRange, []);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  // Tâches avec dueDate dans la semaine courante
  const weekTasks = useMemo(() =>
    tasks.filter((t) => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate + "T00:00:00");
      return d >= monday && d <= sunday;
    }),
  [tasks, monday, sunday]);

  // Score d'urgence par tag (pour Spider Chart) — limité aux 8 plus urgents
  const tagScores = useMemo(() => {
    const all = tags.map((tag) => {
      const tagTasks = tasks.filter((t) => (t.tags ?? []).includes(tag.id));
      const score    = tagTasks.reduce((s, t) => s + PRIORITY_WEIGHT[t.priority], 0);
      return { tag, score, count: tagTasks.length };
    }).filter((d) => d.count > 0);
    return all.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [tags, tasks]);

  // Tâches filtrées par tag sélectionné (ou toutes)
  const filteredTasks = useMemo(() =>
    selectedTagId ? tasks.filter((t) => (t.tags ?? []).includes(selectedTagId)) : tasks,
  [tasks, selectedTagId]);

  const countByPriority = useMemo(() =>
    PRIORITIES.reduce((acc, p) => {
      acc[p] = filteredTasks.filter((t) => t.priority === p).length;
      return acc;
    }, {} as Record<TaskPriority, number>),
  [filteredTasks]);

  const selectedTag = selectedTagId ? tagById.get(selectedTagId) : null;

  const weekLabel = `${monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — ${sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em] font-mono flex items-center gap-2">
          <span className="text-[var(--accent)]">◆</span> Statistiques
        </h2>
        <span className="text-xs text-[var(--text-faint)] font-mono">
          {tasks.length}t · {tags.length}k
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* ── Spider Chart ─────────────────────────────────────────────────── */}
        <Card title="Urgence par tag" subtitle="Score pondéré : urgent×5, haute×4, moyenne×3, basse×1">
          {tagScores.length < 3 ? (
            <Empty>Au moins 3 tags avec des tâches pour afficher le radar.</Empty>
          ) : (
            <SpiderChart data={tagScores} />
          )}
        </Card>

        {/* ── Table semaine ────────────────────────────────────────────────── */}
        <Card title="Rendus cette semaine" subtitle={weekLabel}>
          <WeekTable tasks={weekTasks} tagById={tagById} />
        </Card>

        {/* ── Priorités (filtrables par tag) ───────────────────────────────── */}
        <Card
          className="xl:col-span-2"
          title={
            selectedTag
              ? <span>Priorités — <span style={{ color: selectedTag.color }}>{selectedTag.name}</span></span>
              : "Priorités globales"
          }
          subtitle={`${filteredTasks.length} tâche${filteredTasks.length !== 1 ? "s" : ""} concernée${filteredTasks.length !== 1 ? "s" : ""}`}
          action={
            <TagFilter
              tags={tags}
              selectedTagId={selectedTagId}
              onChange={setSelectedTagId}
            />
          }
        >
          <PriorityStats countByPriority={countByPriority} total={filteredTasks.length} />
        </Card>

      </div>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({
  title, subtitle, action, children, className = "",
}: {
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
          {subtitle && <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[var(--text-faint)] italic py-10 text-center">{children}</p>
  );
}

// ── Spider / Radar Chart ──────────────────────────────────────────────────────

function SpiderChart({ data }: { data: { tag: TagDefinition; score: number; count: number }[] }) {
  const SIZE  = 280;
  const CX    = SIZE / 2;
  const CY    = SIZE / 2;
  const R     = 95;   // rayon max du graphique
  const LABEL = R + 26;
  const n     = data.length;
  const maxScore = Math.max(...data.map((d) => d.score), 1);

  function angle(i: number) { return (i / n) * 2 * Math.PI - Math.PI / 2; }

  function pt(i: number, value: number) {
    const a = angle(i);
    const r = (value / maxScore) * R;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  }

  function ringPts(f: number) {
    return data.map((_, i) => { const p = pt(i, maxScore * f); return `${p.x},${p.y}`; }).join(" ");
  }

  const dataPts  = data.map((d, i) => pt(i, d.score));
  const polyLine = dataPts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex justify-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label="Radar chart d'urgence par tag">

        {/* Anneaux de grille */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={ringPts(f)} fill="none"
            stroke="var(--border)" strokeWidth={f === 1 ? 1.5 : 0.8} />
        ))}

        {/* Rayons */}
        {data.map((_, i) => {
          const end = pt(i, maxScore);
          return <line key={i} x1={CX} y1={CY} x2={end.x} y2={end.y}
            stroke="var(--border)" strokeWidth={0.8} />;
        })}

        {/* Polygone de données */}
        <polygon points={polyLine}
          fill="var(--accent)" fillOpacity={0.18}
          stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />

        {/* Points de données */}
        {dataPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4}
            fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        ))}

        {/* Labels (nom du tag + score) */}
        {data.map((d, i) => {
          const a  = angle(i);
          const lx = CX + LABEL * Math.cos(a);
          const ly = CY + LABEL * Math.sin(a);
          const name = d.tag.name.length > 9 ? d.tag.name.slice(0, 8) + "…" : d.tag.name;
          return (
            <g key={i}>
              <circle cx={CX + (R + 8) * Math.cos(a)} cy={CY + (R + 8) * Math.sin(a)}
                r={4} fill={d.tag.color} />
              <text x={lx} y={ly}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={10} fill="var(--text-muted)" fontFamily="sans-serif">
                {name}
              </text>
              <text x={lx} y={ly + 12}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill="var(--text-faint)" fontFamily="sans-serif">
                {d.score}pt
              </text>
            </g>
          );
        })}

        {/* Légende max */}
        <text x={CX + 3} y={CY - R - 4}
          textAnchor="middle" fontSize={8} fill="var(--text-faint)" fontFamily="sans-serif">
          {maxScore}
        </text>
      </svg>
    </div>
  );
}

// ── Table des tâches de la semaine ────────────────────────────────────────────

function WeekTable({
  tasks, tagById,
}: {
  tasks: KanbanTask[];
  tagById: Map<string, TagDefinition>;
}) {
  if (tasks.length === 0) {
    return <Empty>Aucune échéance cette semaine.</Empty>;
  }

  // Grouper par jour
  const byDay = new Map<string, KanbanTask[]>();
  for (const t of [...tasks].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))) {
    if (!t.dueDate) continue;
    const arr = byDay.get(t.dueDate) ?? [];
    arr.push(t);
    byDay.set(t.dueDate, arr);
  }

  return (
    <div className="flex flex-col gap-3">
      {[...byDay.entries()].map(([day, dayTasks]) => {
        const d     = new Date(day + "T00:00:00");
        const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
        const isToday = d.toDateString() === new Date().toDateString();
        return (
          <div key={day} className="flex flex-col gap-1.5">
            <p className={`text-[10px] uppercase tracking-widest font-semibold ${isToday ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}`}>
              {label}{isToday ? " · Aujourd'hui" : ""}
            </p>
            {dayTasks.map((task) => {
              const taskTags = (task.tags ?? []).map((id) => tagById.get(id)).filter(Boolean) as TagDefinition[];
              return (
                <div key={task.blockId}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                  <span className="flex-1 text-xs text-[var(--text)] truncate">{task.title}</span>
                  <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-[120px]">
                    {taskTags.map((tag) => (
                      <span key={tag.id}
                        className="px-1.5 py-0.5 rounded-full text-[10px] text-white font-medium leading-tight"
                        style={{ backgroundColor: tag.color }}>
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Sélecteur de tag ─────────────────────────────────────────────────────────

function TagFilter({
  tags, selectedTagId, onChange,
}: {
  tags: TagDefinition[];
  selectedTagId: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onChange(null)}
        className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
          !selectedTagId
            ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-2)]"
            : "border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text-muted)]"
        }`}
      >
        Tous
      </button>
      {tags.map((tag) => {
        const active = selectedTagId === tag.id;
        return (
          <button
            key={tag.id}
            onClick={() => onChange(active ? null : tag.id)}
            className="px-2.5 py-1 rounded-lg text-xs border transition-colors flex items-center gap-1.5"
            style={active
              ? { borderColor: tag.color, color: tag.color, backgroundColor: tag.color + "18" }
              : { borderColor: "var(--border)", color: "var(--text-faint)" }
            }
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Compteurs par priorité ───────────────────────────────────────────────────

function PriorityStats({
  countByPriority, total,
}: {
  countByPriority: Record<TaskPriority, number>;
  total: number;
}) {
  const maxCount = Math.max(...Object.values(countByPriority), 1);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {PRIORITIES.map((p) => {
        const count  = countByPriority[p];
        const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
        const barPct = Math.round((count / maxCount) * 100);
        return (
          <div key={p}
            className="flex flex-col gap-2.5 p-4 bg-[var(--surface-2)] rounded-xl border border-[var(--border)]">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold" style={{ color: PRIORITY_COLOR[p] }}>
                {PRIORITY_LABEL[p]}
              </span>
              <span className="text-[10px] text-[var(--text-faint)] font-mono">{pct}%</span>
            </div>
            <p className="text-3xl font-bold text-[var(--text)] font-mono leading-none">{count}</p>
            <div className="h-1 rounded-full bg-[var(--surface-3)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${barPct}%`, backgroundColor: PRIORITY_COLOR[p] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
