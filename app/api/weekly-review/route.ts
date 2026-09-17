import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyNotes, tasks } from "../../../db/schema";
import { buildWeeklyReview } from "../../../lib/weekly-review";
import { apiError, requireUserId } from "../_shared";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function palestineToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Gaza", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const start = new URL(request.url).searchParams.get("start") ?? "";
    if (!validDate(start)) return Response.json({ error: "A valid week start is required." }, { status: 400 });
    const end = addDays(start, 6);
    const previousStart = addDays(start, -7);
    const previousEnd = addDays(start, -1);
    const db = getDb();
    const [taskRows, noteRows, previousRows] = await Promise.all([
      db.select().from(tasks).where(and(eq(tasks.userId, userId), gte(tasks.taskDate, start), lte(tasks.taskDate, end))).orderBy(asc(tasks.taskDate), asc(tasks.sortOrder), asc(tasks.id)),
      db.select().from(dailyNotes).where(and(eq(dailyNotes.userId, userId), gte(dailyNotes.noteDate, start), lte(dailyNotes.noteDate, end))).orderBy(asc(dailyNotes.noteDate)),
      db.select({ priority: tasks.priority, status: tasks.status }).from(tasks).where(and(eq(tasks.userId, userId), gte(tasks.taskDate, previousStart), lte(tasks.taskDate, previousEnd))),
    ]);
    return Response.json(buildWeeklyReview(taskRows, noteRows, previousRows, start, end, palestineToday()));
  } catch (error) {
    return apiError(error);
  }
}
