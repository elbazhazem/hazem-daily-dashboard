import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { tasks } from "../../../../db/schema";
import { addUtcDays, dateRangeInclusive } from "../../../../lib/task-rollover";
import { apiError, requireUserId } from "../../_shared";

const HISTORY_REPAIR_START = "2026-09-10";
const HISTORY_REPAIR_TARGET = "2026-09-14";

type TaskRow = typeof tasks.$inferSelect;

function copyValues(task: TaskRow, taskDate: string, updatedAt: string) {
  return {
    userId: task.userId,
    title: task.title,
    description: task.description,
    taskDate,
    dueTime: task.dueTime,
    priority: task.priority,
    status: task.status,
    category: task.category,
    sortOrder: task.sortOrder,
    completedAt: null,
    createdAt: task.createdAt,
    updatedAt,
  };
}

async function copyMissingTasks(
  sourceRows: TaskRow[],
  targetDate: string,
  userId: string,
  updatedAt: string,
) {
  const db = getDb();
  const targetRows = await db.select({ createdAt: tasks.createdAt }).from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.taskDate, targetDate)));
  const existing = new Set(targetRows.map((task) => task.createdAt));
  const missing = sourceRows.filter((task) => !existing.has(task.createdAt));
  if (missing.length) {
    await db.insert(tasks).values(missing.map((task) => copyValues(task, targetDate, updatedAt)));
  }
  return missing.length;
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json() as { sourceDate?: unknown; targetDate?: unknown };
    const sourceDate = typeof body.sourceDate === "string" ? body.sourceDate : "";
    const targetDate = typeof body.targetDate === "string" ? body.targetDate : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return Response.json({ error: "Valid source and target dates required." }, { status: 400 });
    }

    if (addUtcDays(sourceDate, 1) !== targetDate) {
      return Response.json({ error: "Tasks can only roll into the following day." }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    let repaired = 0;

    // Version 14 moved these rows into Sep 14. Recreate the missing daily history
    // once, without changing the current rows or duplicating an existing snapshot.
    if (targetDate === HISTORY_REPAIR_TARGET) {
      const currentOpenTasks = await db.select().from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.taskDate, targetDate), ne(tasks.status, "completed")));
      for (const repairDate of dateRangeInclusive(HISTORY_REPAIR_START, sourceDate)) {
        const eligible = currentOpenTasks.filter((task) => task.createdAt.slice(0, 10) <= repairDate);
        repaired += await copyMissingTasks(eligible, repairDate, userId, now);
      }
    }

    // Rollover is a daily snapshot: keep yesterday's record and copy only its
    // unfinished tasks into today. createdAt is retained as the stable lineage key
    // so repeated dashboard loads cannot create duplicate copies.
    const sourceOpenTasks = await db.select().from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.taskDate, sourceDate), ne(tasks.status, "completed")));
    const copied = await copyMissingTasks(sourceOpenTasks, targetDate, userId, now);

    return Response.json({ copied, repaired });
  } catch (error) {
    return apiError(error);
  }
}
