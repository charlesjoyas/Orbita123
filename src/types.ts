export type Priority = "baja" | "media" | "alta" | "urgente";
export type Recurrence = "ninguna" | "diaria" | "semanal" | "mensual";
export interface Member {
  id: string;
  name: string;
  emoji: string;
  color: string;
  status: "disponible" | "en foco" | "fuera";
  active?: boolean;
}
export interface Column {
  id: string;
  name: string;
  emoji: string;
  color: string;
  wip?: number;
}
export interface Board {
  id: string;
  name: string;
  emoji: string;
  background: string;
  members: string[];
  columns: Column[];
}
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
export interface Comment {
  id: string;
  author: string;
  text: string;
  at: string;
  reactions: Record<string, string[]>;
}
export interface Attachment {
  id: string;
  name: string;
  url: string;
}
export interface Task {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  creator: string;
  assignee: string;
  priority: Priority;
  due: string;
  tags: string[];
  checklist: ChecklistItem[];
  effort: number;
  blocked: string;
  recurrence: Recurrence;
  attachments: Attachment[];
  comments: Comment[];
  reactions: Record<string, string[]>;
  createdAt: string;
  movedAt: string;
  completedAt?: string;
  focus: string[];
  cover?: "violet" | "peach" | "mint";
}
export interface Activity {
  id: string;
  actor: string;
  taskId?: string;
  text: string;
  at: string;
  unread: boolean;
}
export interface Data {
  version: 1;
  members: Member[];
  boards: Board[];
  tasks: Task[];
  activities: Activity[];
  currentUser: string;
  onboarded: boolean;
  focusDays: string[];
  focusDate?: string;
}
export type View =
  "board" | "day" | "team" | "activity" | "calendar" | "list" | "timeline";
