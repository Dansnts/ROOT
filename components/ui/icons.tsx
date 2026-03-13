/**
 * Centralized SVG icon library — all icons use currentColor and accept size + className props.
 * strokeWidth 1.75 matches the app's visual style.
 */

type IconProps = { size?: number; className?: string };

function icon(size: number, className: string, children: React.ReactNode) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ── Action icons ──────────────────────────────────────────────────────────────

export function XIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>);
}

export function PencilIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </>);
}

export function TrashIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </>);
}

export function RefreshIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.66" />
  </>);
}

export function CheckIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="20 6 9 17 4 12" />
  </>);
}

export function PlusIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>);
}

export function GripIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" />
  </>);
}

export function UndoIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 0 0 17-.49" />
  </>);
}

export function RedoIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-17-.49" />
  </>);
}

// ── Navigation icons ──────────────────────────────────────────────────────────

export function ChevronDownIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="6 9 12 15 18 9" />
  </>);
}

export function ChevronRightIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="9 18 15 12 9 6" />
  </>);
}

export function ChevronLeftIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="15 18 9 12 15 6" />
  </>);
}

export function ArrowLeftIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </>);
}

export function ArrowRightIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </>);
}

export function ArrowsUpDownIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="17 11 12 6 7 11" />
    <polyline points="7 13 12 18 17 13" />
  </>);
}

export function ArrowsRightLeftIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="17 8 21 12 17 16" />
    <polyline points="7 16 3 12 7 8" />
    <line x1="21" y1="12" x2="3" y2="12" />
  </>);
}

// ── File system icons ─────────────────────────────────────────────────────────

export function FolderIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </>);
}

export function FolderOpenIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <polyline points="6 14 8 16 12 12 16 16 20 10" strokeWidth={1.5} opacity="0.5" />
  </>);
}

export function FileIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </>);
}

export function FolderPlusIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </>);
}

// ── Calendar icon ─────────────────────────────────────────────────────────────

export function CalendarDaysIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="15" r="1" fill="currentColor" stroke="none" />
  </>);
}

// ── Weather / time icons ──────────────────────────────────────────────────────

export function SunIcon({ size = 16, className = "" }: IconProps) {
  return icon(size, className, <>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
    <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
    <line x1="2" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
    <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
  </>);
}

export function CloudSunIcon({ size = 16, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M12 2v1M16.95 5.05l-.71.71M21 12h-1M17.66 17.66l-.71-.71" strokeWidth={1.5} />
    <circle cx="10" cy="10" r="3" />
    <path d="M20 17a5 5 0 0 0-5-5H7a4 4 0 0 0 0 8h12a3 3 0 0 0 1-5.83" />
  </>);
}

export function MoonIcon({ size = 16, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </>);
}

export function StarsIcon({ size = 16, className = "" }: IconProps) {
  return icon(size, className, <>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </>);
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export function ImageIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </>);
}

export function TableIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </>);
}

export function CheckSquareIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </>);
}

export function SquareIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </>);
}

export function SyncIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <line x1="21" y1="8" x2="21" y2="3" />
    <line x1="3" y1="16" x2="3" y2="21" />
  </>);
}

export function WarningIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>);
}

export function GithubIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </>);
}

export function LinkIcon({ size = 14, className = "" }: IconProps) {
  return icon(size, className, <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>);
}
