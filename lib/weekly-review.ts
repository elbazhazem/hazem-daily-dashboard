export type WeeklyTask = {
  id: number;
  title: string;
  taskDate: string;
  priority: "high" | "medium" | "low";
  status: "not_started" | "in_progress" | "completed";
  category: string;
  createdAt: string;
  completedAt: string | null;
};

export type WeeklyNote = { noteDate: string; content: string };

const priorityWeight = { high: 3, medium: 2, low: 1 } as const;

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function sentences(notes: WeeklyNote[]) {
  return notes.flatMap((note) => note.content.split(/(?<=[.!?؟\n])\s+/u).map((value) => value.trim()).filter(Boolean));
}

function firstMatching(items: string[], patterns: RegExp[]) {
  return items.find((item) => patterns.some((pattern) => pattern.test(item)))?.slice(0, 180) ?? "";
}

export function buildWeeklyReview(
  tasks: WeeklyTask[],
  notes: WeeklyNote[],
  previousTasks: Pick<WeeklyTask, "priority" | "status">[],
  start: string,
  end: string,
  today: string,
) {
  const completed = tasks.filter((task) => task.status === "completed");
  const open = tasks.filter((task) => task.status !== "completed");
  const rolledOver = tasks.filter((task) => task.createdAt.slice(0, 10) < task.taskDate);
  const completionRate = percent(completed.length, tasks.length);
  const completedWeight = completed.reduce((sum, task) => sum + priorityWeight[task.priority], 0);
  const totalWeight = tasks.reduce((sum, task) => sum + priorityWeight[task.priority], 0);
  const strategicProgress = percent(completedWeight, totalWeight);
  const rolloverRate = percent(rolledOver.length, tasks.length);
  const previousCompleted = previousTasks.filter((task) => task.status === "completed");
  const previousRate = percent(previousCompleted.length, previousTasks.length);
  const highPriorityBacklog = open.filter((task) => task.priority === "high").length;

  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const daily = dates.map((date) => ({
    date,
    planned: tasks.filter((task) => task.taskDate === date).length,
    completed: tasks.filter((task) => task.completedAt?.slice(0, 10) === date).length,
    rolledOver: rolledOver.filter((task) => task.taskDate === date).length,
  }));
  const productiveDays = daily.filter((day) => day.completed > 0).length;
  const mostProductive = [...daily].sort((a, b) => b.completed - a.completed)[0];
  const elapsedDays = today >= start && today <= end ? Math.max(1, dates.filter((date) => date <= today).length) : 7;
  const consistency = percent(productiveDays, elapsedDays);

  const categories = [...new Set(tasks.map((task) => task.category))].map((category) => {
    const categoryTasks = tasks.filter((task) => task.category === category);
    const categoryCompleted = categoryTasks.filter((task) => task.status === "completed").length;
    return { name: category, total: categoryTasks.length, completed: categoryCompleted, rate: percent(categoryCompleted, categoryTasks.length) };
  }).sort((a, b) => b.total - a.total);
  const categoryCoverage = percent(categories.filter((category) => category.completed > 0).length, categories.length);
  const noteCoverage = percent(notes.filter((note) => note.content.trim()).length, elapsedDays);
  const momentumScore = clamp(
    strategicProgress * 0.30 + completionRate * 0.20 + consistency * 0.20 +
    (100 - rolloverRate) * 0.15 + categoryCoverage * 0.10 + noteCoverage * 0.05,
  );

  const noteSentences = sentences(notes);
  const achievement = firstMatching(noteSentences, [/(completed|finished|achieved|progress|done)/i, /(أنجز|أكمل|اكتمل|تقدم|نجح)/u])
    || (completed[0] ? `Completed: ${completed[0].title}` : "No completed task or achievement statement was recorded.");
  const blocker = firstMatching(noteSentences, [/(blocked|delay|waiting|approval|interrupt|problem|issue|unable)/i, /(تأخير|انتظار|موافقة|مقاطعة|مشكلة|تعذر|لم أتمكن)/u])
    || (highPriorityBacklog ? `${highPriorityBacklog} high-priority task${highPriorityBacklog === 1 ? " remains" : "s remain"} open.` : "No recurring blocker was detected in the notes.");
  const lesson = firstMatching(noteSentences, [/(learned|lesson|next time|should|worked well)/i, /(تعلمت|درس|المرة القادمة|ينبغي|يجب|نجح معي)/u])
    || "Add one lesson or next-step sentence to a daily note to strengthen this insight.";

  const strongestCategory = categories.find((category) => category.completed > 0);
  const continueText = strategicProgress >= 70
    ? `Continue protecting time for high-priority work; strategic progress reached ${strategicProgress}%.`
    : productiveDays >= 4
      ? `Continue the rhythm that produced progress on ${productiveDays} days.`
      : "Continue recording one meaningful outcome each day.";
  const improveText = rolloverRate >= 30
    ? `Reduce carry-over: ${rolledOver.length} task${rolledOver.length === 1 ? " was" : "s were"} scheduled after their creation date. Split large tasks and limit daily commitments.`
    : highPriorityBacklog > 0
      ? `Start with the ${highPriorityBacklog} open high-priority task${highPriorityBacklog === 1 ? "" : "s"} before lower-value work.`
      : completionRate < 60
        ? "Plan three essential weekly outcomes and treat the remaining tasks as optional."
        : "Keep the plan realistic and review unfinished work before adding new commitments.";
  const focusText = strongestCategory
    ? `Preserve momentum in ${strongestCategory.name}, then schedule one concrete outcome for the weakest active category.`
    : "Choose one strategic category and define a small, observable outcome for next week.";

  const summary = tasks.length
    ? `You completed ${completed.length} of ${tasks.length} scheduled tasks (${completionRate}%). Strategic progress was ${strategicProgress}%, with ${productiveDays} productive day${productiveDays === 1 ? "" : "s"}. ${rolloverRate >= 30 ? "Carry-over is the clearest constraint to address next week." : "The weekly plan remained reasonably controlled."}`
    : "No tasks are currently assigned to this week. Use the action plan to define three realistic outcomes.";

  return {
    start,
    end,
    metrics: {
      completionRate,
      strategicProgress,
      rolloverRate,
      momentumScore,
      completionDelta: completionRate - previousRate,
      completed: completed.length,
      total: tasks.length,
      open: open.length,
      productiveDays,
      noteDays: notes.filter((note) => note.content.trim()).length,
      highPriorityBacklog,
    },
    daily,
    categories,
    insights: {
      achievement,
      blocker,
      lesson,
      mostProductiveDate: mostProductive?.completed ? mostProductive.date : null,
      mostProductiveCount: mostProductive?.completed ?? 0,
    },
    summary,
    actionPlan: { continue: continueText, improve: improveText, focus: focusText },
    methodology: [
      "Completion rate = completed tasks ÷ tasks scheduled in the selected week.",
      "Strategic progress weights high, medium, and low priorities as 3, 2, and 1.",
      "Rollover is inferred when a task's creation date is earlier than its scheduled date.",
      "Momentum combines strategic progress (30%), completion (20%), consistency (20%), low rollover (15%), category coverage (10%), and note coverage (5%).",
      "Note insights use visible keyword rules in Arabic and English; no external AI service reads the notes in v1.",
    ],
  };
}
