import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  taskDate: text("task_date").notNull(),
  dueTime: text("due_time"),
  priority: text("priority", { enum: ["high", "medium", "low"] }).notNull().default("medium"),
  status: text("status", { enum: ["not_started", "in_progress", "completed"] }).notNull().default("not_started"),
  category: text("category").notNull().default("Academic"),
  sortOrder: integer("sort_order").notNull().default(0),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_tasks_user_date_id").on(table.userId, table.taskDate, table.id),
]);

export const dailyNotes = sqliteTable("daily_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  noteDate: text("note_date").notNull(),
  title: text("title").notNull().default("Daily notes"),
  content: text("content").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_notes_user_date").on(table.userId, table.noteDate),
]);

export const calendarConnections = sqliteTable("calendar_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  accountEmail: text("account_email"),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  tokenExpiry: integer("token_expiry").notNull(),
  scope: text("scope").notNull().default("https://www.googleapis.com/auth/calendar.readonly"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_calendar_user").on(table.userId),
]);
