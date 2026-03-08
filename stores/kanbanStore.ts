"use client";

import { create } from "zustand";
import {
  loadAllTasks,
  createTask,
  updateTaskStatus,
  updateTaskPriority,
  deleteTask,
  type KanbanTask,
} from "@/lib/KanbanService";
import type { TaskStatus, TaskPriority } from "@/lib/database";

interface KanbanState {
  tasks: KanbanTask[];
  isLoading: boolean;

  loadTasks: () => Promise<void>;
  addTask: (title: string, status: TaskStatus) => Promise<void>;
  moveTask: (blockId: string, newStatus: TaskStatus) => Promise<void>;
  setPriority: (blockId: string, priority: TaskPriority) => Promise<void>;
  removeTask: (blockId: string) => Promise<void>;
}

export const useKanbanStore = create<KanbanState>()((set, get) => ({
  tasks: [],
  isLoading: false,

  loadTasks: async () => {
    set({ isLoading: true });
    const tasks = await loadAllTasks();
    set({ tasks, isLoading: false });
  },

  addTask: async (title, status) => {
    const task = await createTask(title, status);
    set((s) => ({ tasks: [...s.tasks, task] }));
  },

  moveTask: async (blockId, newStatus) => {
    await updateTaskStatus(blockId, newStatus);
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.blockId === blockId ? { ...t, status: newStatus } : t
      ),
    }));
  },

  setPriority: async (blockId, priority) => {
    await updateTaskPriority(blockId, priority);
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.blockId === blockId ? { ...t, priority } : t
      ),
    }));
  },

  removeTask: async (blockId) => {
    await deleteTask(blockId);
    set((s) => ({ tasks: s.tasks.filter((t) => t.blockId !== blockId) }));
  },
}));
