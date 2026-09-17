export function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type RolloverTask = {
  id: number;
  createdAt: string;
  taskDate: string;
  status: "not_started" | "in_progress" | "completed";
};

export function planTaskRollover(rows: RolloverTask[], targetDate: string) {
  const byLineage = new Map<string, RolloverTask[]>();

  for (const row of rows) {
    const lineage = byLineage.get(row.createdAt) ?? [];
    lineage.push(row);
    byLineage.set(row.createdAt, lineage);
  }

  const duplicateIds: number[] = [];
  const moveIds: number[] = [];

  for (const lineage of byLineage.values()) {
    const newestFirst = [...lineage].sort((a, b) =>
      b.taskDate.localeCompare(a.taskDate) || b.id - a.id,
    );
    const completed = newestFirst.find((task) => task.status === "completed");
    const canonical = completed ?? newestFirst[0];

    duplicateIds.push(...newestFirst.filter((task) => task.id !== canonical.id).map((task) => task.id));
    if (canonical.status !== "completed" && canonical.taskDate < targetDate) {
      moveIds.push(canonical.id);
    }
  }

  return { duplicateIds, moveIds };
}
