import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { dailyNotes } from "../../../db/schema";
import { apiError, requireUserId } from "../_shared";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const date = new URL(request.url).searchParams.get("date") ?? "";
    const note = await getDb().query.dailyNotes.findFirst({ where: and(eq(dailyNotes.userId, userId), eq(dailyNotes.noteDate, date)) });
    return Response.json({ note: note ?? null });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = z.object({ noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: z.string().max(120), content: z.string().max(30000) }).parse(await request.json());
    const now = new Date().toISOString();
    const existing = await getDb().query.dailyNotes.findFirst({ where: and(eq(dailyNotes.userId, userId), eq(dailyNotes.noteDate, payload.noteDate)) });
    if (existing) {
      const [note] = await getDb().update(dailyNotes).set({ title: payload.title, content: payload.content, updatedAt: now }).where(eq(dailyNotes.id, existing.id)).returning();
      return Response.json({ note });
    }
    const [note] = await getDb().insert(dailyNotes).values({ ...payload, userId, createdAt: now, updatedAt: now }).returning();
    return Response.json({ note }, { status: 201 });
  } catch (error) { return apiError(error); }
}
