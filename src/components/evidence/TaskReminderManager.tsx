import { useEffect } from "react";
import { toast } from "sonner";

import { useEvidence } from "@/lib/evidence/store";
import { defaultReminderAt, isOpenTask } from "@/lib/task-reminders";

async function showReminder(title: string, taskId: string) {
  const options: NotificationOptions = {
    body: "Open GC to review this case task.",
    icon: "/app-icon-192.png",
    badge: "/app-icon-192.png",
    tag: `gc-task-${taskId}`,
  };
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
    return;
  }
  new Notification(title, options);
}

export function TaskReminderManager() {
  const { tasks, updateTask } = useEvidence();

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);

  useEffect(() => {
    for (const task of tasks) {
      if (isOpenTask(task) && !task.reminderAt) {
        updateTask(task.id, { reminderAt: defaultReminderAt(task.dueDate) });
      }
    }
  }, [tasks, updateTask]);

  useEffect(() => {
    const check = async () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const now = Date.now();
      for (const task of tasks) {
        if (!isOpenTask(task) || !task.reminderAt || task.reminderNotifiedAt) continue;
        if (new Date(task.reminderAt).getTime() > now) continue;
        try {
          await showReminder(task.title, task.id);
          updateTask(task.id, { reminderNotifiedAt: new Date().toISOString() });
        } catch {
          toast.error("Could not show a task reminder");
        }
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tasks, updateTask]);

  return null;
}