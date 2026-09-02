import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { tasks } from "../../../../db/schema";
import { apiError, requireUserId } from "../../_shared";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json() as { sourceDate?: unknown; targetDate?: unknown };
    const sourceDate = typeof body.sourceDate === "string" ? body.sourceDate : "";
    const targetDate = typeof body.targetDate === "string" ? body.targetDate : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return Response.json({ error: "Valid source and target dates required." }, { status: 400 });
    }

    const expectedTarget = new Date(`${sourceDate}T00:00:00.000Z`);
    expectedTarget.setUTCDate(expectedTarget.getUTCDate() + 1);
    if (expectedTarget.toISOString().slice(0, 10) !== targetDate) {
      return Response.json({ error: "Tasks can only roll into the following day." }, { status: 400 });
    }

    const moved = await getDb().update(tasks)
      .set({ taskDate: targetDate, updatedAt: new Date().toISOString() })
      .where(and(eq(tasks.userId, userId), eq(tasks.taskDate, sourceDate), ne(tasks.status, "completed")))
      .returning({ id: tasks.id });

    return Response.json({ moved: moved.length });
  } catch (error) {
    return apiError(error);
  }
}
