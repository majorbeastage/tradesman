export const OPEN_DASHBOARD_TODO_EVENT = "tradesman-open-dashboard-todo"

export function requestOpenDashboardTodoModal(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(OPEN_DASHBOARD_TODO_EVENT))
}
