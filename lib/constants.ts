/**
 * Shared application constants.
 */

/** Color palette used across tag pickers, category pickers, etc. */
export const COLOR_PALETTE: string[] = [
  "#ef4444","#f97316","#f59e0b","#84cc16",
  "#22c55e","#14b8a6","#06b6d4","#3b82f6",
  "#8b5cf6","#ec4899","#6b7280","#a16207",
];

/** Virtual pageId for all Kanban tasks — never a real page. */
export const KANBAN_PAGE_ID = "__kanban__";

/** Virtual categoryId for CalDAV events with no matching category. */
export const UNCATEGORIZED_ID = "__uncategorized__";

/** LocalStorage and IndexedDB setting keys. */
export const LS_KEYS = {
  theme: "root-theme",
  username: "root-username",
} as const;

export const DB_KEYS = {
  caldavConfig: "caldav_config",
  calendarCategories: "calendar_categories",
  userName: "user_name",
} as const;
