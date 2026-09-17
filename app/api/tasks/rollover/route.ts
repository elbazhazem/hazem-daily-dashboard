import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "../../../../db";
import { tasks } from "../../../../db/schema";
import { addUtcDays, planTaskRollover } from "../../../../lib/task-rollover";
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

    if (addUtcDays(sourceDate, 1) !== targetDate) {
      return Response.json({ error: "Tasks can only roll into the following day." }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Move unfinished work instead of taking daily snapshots. Include every older
    // date so opening the dashboard after several days still catches up correctly.
    // createdAt is the lineage key used by the former copy-based implementation;
    // collapsing those historical copies also repairs the inflated analytics.
    const rolloverRows = await db.select({
      id: tasks.id,
      createdAt: tasks.createdAt,
      taskDate: tasks.taskDate,
      status: tasks.status,
    }).from(tasks)
      .where(and(eq(tasks.userId, userId), lte(tasks.taskDate, targetDate)))
      .orderBy(desc(tasks.taskDate), desc(tasks.id));

    const { duplicateIds, moveIds } = planTaskRollover(rolloverRows, targetDate);

    if (duplicateIds.length) {
      await db.delete(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, duplicateIds)));
    }
    if (moveIds.length) {
      await db.update(tasks).set({ taskDate: targetDate, updatedAt: now })
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, moveIds)));
    }

    return Response.json({ moved: moveIds.length, removedDuplicates: duplicateIds.length });
  } catch (error) {
    return apiError(error);
  }
}
