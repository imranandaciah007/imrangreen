import type { CaseTask } from "./evidence/types";

export const NOTIFICATION_PERMISSION_EVENT = "gc:notification-permission";

export function defaultReminderAt(dueDate?: string) {
  const reminder = dueDate ? new Date(`${dueDate}T09:00:00`) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (!dueDate) reminder.setMinutes(0, 0, 0);
  return reminder.toISOString();
}

export function reminderInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function reminderFromInput(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export function isOpenTask(task: CaseTask) {
  return !task.done && task.status !== "Complete";
}

export async function requestReminderPermission() {
  if (!("Notification" in window)) return "unsupported" as const;
  const permission = await Notification.requestPermission();
  window.dispatchEvent(new Event(NOTIFICATION_PERMISSION_EVENT));
  return permission;
}

export function notificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported" as const;
  return Notification.permission;
}