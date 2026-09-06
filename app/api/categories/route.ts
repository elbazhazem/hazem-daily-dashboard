import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { categories, tasks } from "../../../db/schema";
import { DEFAULT_CATEGORY_NAMES, normalizeCategoryName } from "../../../lib/categories";
import { apiError, requireUserId } from "../_shared";

const nameSchema = z.string().trim().min(1, "Category name is required.").max(50, "Category names can contain up to 50 characters.");

function parseCategoryName(value: unknown) {
  const result = nameSchema.safeParse(value);
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Valid category name required." } as const;
  return { name: result.data } as const;
}

async function seedDefaultCategories(userId: string) {
  const db = getDb();
  const [{ value }] = await db.select({ value: count() }).from(categories).where(eq(categories.userId, userId));
  if (value > 0) return;
  const now = new Date().toISOString();
  await db.insert(categories).values(DEFAULT_CATEGORY_NAMES.map((name, index) => ({
    userId,
    name,
    normalizedName: normalizeCategoryName(name),
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }))).onConflictDoNothing();
}

async function listCategories(userId: string) {
  return getDb().select({ id: categories.id, name: categories.name }).from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await seedDefaultCategories(userId);
    return Response.json({ categories: await listCategories(userId) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await seedDefaultCategories(userId);
    const parsed = parseCategoryName((await request.json() as { name?: unknown }).name);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const name = parsed.name;
    const normalizedName = normalizeCategoryName(name);
    const duplicate = await getDb().query.categories.findFirst({ where: and(eq(categories.userId, userId), eq(categories.normalizedName, normalizedName)) });
    if (duplicate) return Response.json({ error: "A category with this name already exists." }, { status: 409 });
    const now = new Date().toISOString();
    const [category] = await getDb().insert(categories).values({ userId, name, normalizedName, sortOrder: Date.now(), createdAt: now, updatedAt: now }).returning({ id: categories.id, name: categories.name });
    return Response.json({ category, categories: await listCategories(userId) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json() as { id?: unknown; name?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "Valid category id required." }, { status: 400 });
    const parsed = parseCategoryName(body.name);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const name = parsed.name;
    const db = getDb();
    const existing = await db.query.categories.findFirst({ where: and(eq(categories.id, id), eq(categories.userId, userId)) });
    if (!existing) return Response.json({ error: "Category not found." }, { status: 404 });
    const normalizedName = normalizeCategoryName(name);
    const duplicate = await db.query.categories.findFirst({ where: and(eq(categories.userId, userId), eq(categories.normalizedName, normalizedName)) });
    if (duplicate && duplicate.id !== id) return Response.json({ error: "A category with this name already exists." }, { status: 409 });
    const now = new Date().toISOString();
    await db.batch([
      db.update(categories).set({ name, normalizedName, updatedAt: now }).where(and(eq(categories.id, id), eq(categories.userId, userId))),
      db.update(tasks).set({ category: name, updatedAt: now }).where(and(eq(tasks.userId, userId), eq(tasks.category, existing.name))),
    ]);
    return Response.json({ category: { id, name }, previousName: existing.name });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "Valid category id required." }, { status: 400 });
    const db = getDb();
    const existing = await db.query.categories.findFirst({ where: and(eq(categories.id, id), eq(categories.userId, userId)) });
    if (!existing) return Response.json({ error: "Category not found." }, { status: 404 });
    const [{ value: categoryCount }] = await db.select({ value: count() }).from(categories).where(eq(categories.userId, userId));
    if (categoryCount <= 1) return Response.json({ error: "Keep at least one category available for new tasks." }, { status: 409 });
    const [{ value: preservedTaskCount }] = await db.select({ value: count() }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.category, existing.name)));
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
    return Response.json({ ok: true, preservedTaskCount });
  } catch (error) { return apiError(error); }
}
