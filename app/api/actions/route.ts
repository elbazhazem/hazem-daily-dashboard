import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { tasks } from "../../../db/schema";
import { apiError, getValidGoogleToken, hasCalendarWriteScope, requireUserId } from "../_shared";

const candidateSchema = z.object({
  id: z.string().max(100),
  type: z.enum(["meeting", "task"]),
  sourceText: z.string().max(2000),
  sourceNoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().max(180),
  taskTitle: z.string().trim().max(180),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")),
  durationMinutes: z.number().int().min(1).max(1440),
  timezone: z.literal("Asia/Gaza"),
  location: z.string().max(300),
  description: z.string().max(2000),
  priority: z.enum(["high", "medium", "low"]),
  category: z.string().trim().min(1).max(50),
  tentative: z.boolean(),
  confirmed: z.boolean(),
});

const requestSchema = z.object({
  action: z.enum(["task", "calendar", "both"]),
  candidate: candidateSchema,
});

class ActionError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function createTask(userId: string, candidate: z.infer<typeof candidateSchema>) {
  const title = candidate.taskTitle || candidate.title;
  if (!title || !candidate.date) throw new ActionError("TASK_FIELDS_REQUIRED", "Task title and date are required.", 400);
  const duePredicate = candidate.time ? eq(tasks.dueTime, candidate.time) : isNull(tasks.dueTime);
  const existing = await getDb().query.tasks.findFirst({
    where: and(eq(tasks.userId, userId), eq(tasks.title, title), eq(tasks.taskDate, candidate.date), duePredicate),
  });
  if (existing) return { ok: true, created: false, duplicate: true, task: existing };
  const now = new Date().toISOString();
  const [task] = await getDb().insert(tasks).values({
    userId,
    title,
    description: candidate.description,
    taskDate: candidate.date,
    dueTime: candidate.time || null,
    priority: candidate.priority,
    status: "not_started",
    category: candidate.category,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return { ok: true, created: true, duplicate: false, task };
}

async function fingerprint(candidate: z.infer<typeof candidateSchema>) {
  const content = `${candidate.sourceNoteDate}|${candidate.title.toLocaleLowerCase()}|${candidate.date}|${candidate.time}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function addMinutes(date: string, time: string, minutes: number) {
  const value = new Date(`${date}T${time}:00Z`);
  value.setUTCMinutes(value.getUTCMinutes() + minutes);
  return { date: value.toISOString().slice(0, 10), time: value.toISOString().slice(11, 16) };
}

async function createCalendarEvent(userId: string, candidate: z.infer<typeof candidateSchema>) {
  if (candidate.type !== "meeting" || !candidate.title || !candidate.date || !candidate.time) {
    throw new ActionError("EVENT_FIELDS_REQUIRED", "Meeting title, date, and time are required.", 400);
  }
  const connection = await getValidGoogleToken(userId);
  if (!connection) throw new ActionError("CALENDAR_CONNECTION_REQUIRED", "Connect Google Calendar before creating an event.", 409);
  if (!hasCalendarWriteScope(connection.scope)) {
    throw new ActionError("CALENDAR_REAUTHORIZE_REQUIRED", "Reconnect Google Calendar to grant event creation access.", 403);
  }
  const actionId = await fingerprint(candidate);
  const query = new URLSearchParams({
    timeMin: new Date(`${candidate.date}T00:00:00+03:00`).toISOString(),
    timeMax: new Date(`${candidate.date}T23:59:59+03:00`).toISOString(),
    singleEvents: "true",
    privateExtendedProperty: `hazemDashboardId=${actionId}`,
    maxResults: "10",
  });
  const headers = { authorization: `Bearer ${connection.token}` };
  const duplicateResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`, { headers });
  if (!duplicateResponse.ok) throw new ActionError("CALENDAR_LOOKUP_FAILED", "Google Calendar could not be checked for duplicates.", 502);
  const duplicateData = await duplicateResponse.json() as { items?: Array<{ id: string; htmlLink?: string; summary?: string }> };
  const duplicate = duplicateData.items?.[0];
  if (duplicate) return { ok: true, created: false, duplicate: true, event: { id: duplicate.id, title: duplicate.summary ?? candidate.title, url: duplicate.htmlLink ?? null } };

  const end = addMinutes(candidate.date, candidate.time, candidate.durationMinutes);
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      summary: candidate.title,
      description: candidate.description,
      location: candidate.location || undefined,
      start: { dateTime: `${candidate.date}T${candidate.time}:00`, timeZone: candidate.timezone },
      end: { dateTime: `${end.date}T${end.time}:00`, timeZone: candidate.timezone },
      extendedProperties: { private: { hazemDashboardId: actionId, sourceNoteDate: candidate.sourceNoteDate } },
    }),
  });
  if (!response.ok) throw new ActionError("CALENDAR_CREATE_FAILED", "Google Calendar could not create the event.", 502);
  const event = await response.json() as { id: string; htmlLink?: string; summary?: string };
  return { ok: true, created: true, duplicate: false, event: { id: event.id, title: event.summary ?? candidate.title, url: event.htmlLink ?? null } };
}

function failure(error: unknown) {
  if (error instanceof ActionError) return { ok: false, code: error.code, error: error.message, status: error.status };
  return { ok: false, code: "ACTION_FAILED", error: "The action could not be completed.", status: 500 };
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const { action, candidate } = requestSchema.parse(await request.json());
    if (candidate.tentative && !candidate.confirmed) {
      return Response.json({ error: "Confirm the tentative plan before creating it.", code: "CONFIRMATION_REQUIRED" }, { status: 409 });
    }
    if (action === "task") {
      try { return Response.json({ task: await createTask(userId, candidate) }); }
      catch (error) { const result = failure(error); return Response.json(result, { status: result.status }); }
    }
    if (action === "calendar") {
      try { return Response.json({ calendar: await createCalendarEvent(userId, candidate) }); }
      catch (error) { const result = failure(error); return Response.json(result, { status: result.status }); }
    }
    const calendar = await createCalendarEvent(userId, candidate).catch(failure);
    const task = await createTask(userId, candidate).catch(failure);
    const ok = calendar.ok && task.ok;
    return Response.json({ calendar, task, partial: !ok && (calendar.ok || task.ok) }, { status: ok ? 200 : 207 });
  } catch (error) {
    return apiError(error);
  }
}
