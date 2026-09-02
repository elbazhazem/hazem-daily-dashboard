import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { tasks } from "../../../db/schema";
import { apiError, requireUserId } from "../_shared";

const payloadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(2000).optional().default(""),
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
  category: z.string().trim().min(1).max(50).default("Academic"),
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Valid date required." }, { status: 400 });
    const rows = await getDb().select().from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.taskDate, date)))
      .orderBy(
        sql`CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END`,
        sql`CASE ${tasks.priority} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
        asc(tasks.sortOrder),
        asc(tasks.id),
      );
    return Response.json({ tasks: rows });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = payloadSchema.parse(await request.json());
    const now = new Date().toISOString();
    const [task] = await getDb().insert(tasks).values({ ...payload, userId, createdAt: now, updatedAt: now }).returning();
    return Response.json({ task }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "Valid task id required." }, { status: 400 });
    const values = payloadSchema.partial().parse(body);
    const completedAt = values.status === "completed" ? new Date().toISOString() : values.status ? null : undefined;
    const [task] = await getDb().update(tasks).set({ ...values, completedAt, updatedAt: new Date().toISOString() }).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).returning();
    return task ? Response.json({ task }) : Response.json({ error: "Task not found." }, { status: 404 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "Valid task id required." }, { status: 400 });
    await getDb().delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
