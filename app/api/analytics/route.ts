import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyNotes, tasks } from "../../../db/schema";
import { apiError, getValidGoogleToken, requireUserId } from "../_shared";

type GoogleEvent = {
  status?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};

function parseDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const search = new URL(request.url).searchParams;
    const start = parseDate(search.get("start") ?? "");
    const end = parseDate(search.get("end") ?? "");
    if (!start || !end || start > end) return Response.json({ error: "Valid date range required." }, { status: 400 });
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > 366) return Response.json({ error: "Date range cannot exceed 366 days." }, { status: 400 });

    const startDate = dateOnly(start);
    const endDate = dateOnly(end);
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -(days - 1));
    const db = getDb();
    const [taskRows, noteRows, previousTasks] = await Promise.all([
      db.select().from(tasks).where(and(eq(tasks.userId, userId), gte(tasks.taskDate, startDate), lte(tasks.taskDate, endDate))).orderBy(asc(tasks.taskDate), asc(tasks.id)),
      db.select().from(dailyNotes).where(and(eq(dailyNotes.userId, userId), gte(dailyNotes.noteDate, startDate), lte(dailyNotes.noteDate, endDate))).orderBy(asc(dailyNotes.noteDate)),
      db.select({ status: tasks.status }).from(tasks).where(and(eq(tasks.userId, userId), gte(tasks.taskDate, dateOnly(previousStart)), lte(tasks.taskDate, dateOnly(previousEnd)))),
    ]);

    const calendar: Array<{ date: string; eventCount: number; meetingMinutes: number }> = [];
    const connection = await getValidGoogleToken(userId);
    if (connection) {
      const params = new URLSearchParams({
        timeMin: new Date(`${startDate}T00:00:00+03:00`).toISOString(),
        timeMax: new Date(`${endDate}T23:59:59+03:00`).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        timeZone: "Asia/Gaza",
        maxResults: "2500",
      });
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { authorization: `Bearer ${connection.token}` } });
      if (response.ok) {
        const data = await response.json() as { items?: GoogleEvent[] };
        const byDate = new Map<string, { eventCount: number; meetingMinutes: number }>();
        for (const event of data.items ?? []) {
          if (event.status === "cancelled") continue;
          const eventDate = (event.start.dateTime ?? event.start.date ?? "").slice(0, 10);
          if (!eventDate) continue;
          const current = byDate.get(eventDate) ?? { eventCount: 0, meetingMinutes: 0 };
          current.eventCount += 1;
          if (event.start.dateTime && event.end.dateTime) {
            current.meetingMinutes += Math.max(0, Math.round((new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) / 60_000));
          }
          byDate.set(eventDate, current);
        }
        for (const [date, values] of byDate) calendar.push({ date, ...values });
      }
    }

    const previousCompleted = previousTasks.filter((task) => task.status === "completed").length;
    return Response.json({
      start: startDate,
      end: endDate,
      tasks: taskRows,
      notes: noteRows,
      calendar,
      calendarConnected: Boolean(connection),
      previous: {
        totalTasks: previousTasks.length,
        completedTasks: previousCompleted,
        completionRate: previousTasks.length ? Math.round((previousCompleted / previousTasks.length) * 100) : 0,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
