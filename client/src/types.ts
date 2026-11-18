export type Status = "TODO" | "IN_PROGRESS" | "COMPLETED";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}
export type TaskInput = Pick<
  Task,
  "title" | "description" | "status" | "priority" | "dueDate"
>;
export interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}
export interface TaskPage {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
export const statusLabels: Record<Status, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};
export const priorityLabels: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};
