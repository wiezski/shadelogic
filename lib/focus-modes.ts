// Focus mode configuration — shared between nav-bar and dashboard
// Each mode defines which nav items and dashboard widgets are relevant.

import type { WidgetId } from "../app/dashboard-widgets";

export type TaskMode = "all" | "measuring" | "quoting" | "scheduling" | "warehouse";

export const MODE_LABELS: Record<TaskMode, string> = {
  all: "All",
  measuring: "Measuring",
  quoting: "Quoting",
  scheduling: "Scheduling",
  warehouse: "Warehouse",
};

export const MODE_ICONS: Record<TaskMode, string> = {
  all: "\u26A1",
  measuring: "\uD83D\uDCD0",
  quoting: "\uD83D\uDCB0",
  scheduling: "\uD83D\uDCC5",
  warehouse: "\uD83D\uDCE6",
};

// Which nav hrefs are visible in each mode (null = show all)
export const MODE_NAV_FILTER: Record<TaskMode, string[] | null> = {
  all: null,
  measuring: ["/schedule", "/warehouse"],
  quoting: ["/calculator", "/products", "/manufacturers", "/payments"],
  scheduling: ["/schedule", "/warehouse", "/payroll"],
  warehouse: ["/warehouse"],
};

// Default dashboard widgets for each focus mode
export const MODE_WIDGETS: Record<TaskMode, WidgetId[]> = {
  all: [], // empty = show all (use normal user layout)
  measuring: ["todays_appointments", "work_queue", "ready_to_install", "quick_actions"],
  quoting: ["quick_actions", "sales_pipeline", "kpi_strip", "work_queue", "revenue_chart"],
  scheduling: ["todays_appointments", "operations", "tasks_due", "work_queue"],
  warehouse: ["ready_to_install", "shipments", "operations"],
};

// LocalStorage key for custom mode widget overrides
const MODE_WIDGETS_STORAGE_KEY = "zr-mode-widgets";

/** Get the widget list for a mode, respecting user overrides */
export function getModeWidgets(mode: TaskMode): WidgetId[] {
  // Check for user customization
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(MODE_WIDGETS_STORAGE_KEY);
      if (stored) {
        const overrides = JSON.parse(stored) as Record<string, WidgetId[]>;
        if (overrides[mode] && overrides[mode].length > 0) {
          return overrides[mode];
        }
      }
    } catch { /* ignore */ }
  }
  return MODE_WIDGETS[mode];
}

/** Save custom widget list for a specific mode */
export function saveModeWidgets(mode: TaskMode, widgets: WidgetId[]) {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(MODE_WIDGETS_STORAGE_KEY);
    const overrides = stored ? JSON.parse(stored) : {};
    overrides[mode] = widgets;
    localStorage.setItem(MODE_WIDGETS_STORAGE_KEY, JSON.stringify(overrides));
  } catch { /* ignore */ }
}

/** Get all custom mode overrides */
export function getAllModeWidgetOverrides(): Record<string, WidgetId[]> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(MODE_WIDGETS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

/** Reset a mode's widgets to defaults */
export function resetModeWidgets(mode: TaskMode) {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(MODE_WIDGETS_STORAGE_KEY);
    const overrides = stored ? JSON.parse(stored) : {};
    delete overrides[mode];
    localStorage.setItem(MODE_WIDGETS_STORAGE_KEY, JSON.stringify(overrides));
  } catch { /* ignore */ }
}

/** Get the current task mode from localStorage */
export function getCurrentMode(): TaskMode {
  if (typeof window === "undefined") return "all";
  const saved = localStorage.getItem("zr-task-mode") as TaskMode | null;
  return saved && MODE_LABELS[saved] ? saved : "all";
}
