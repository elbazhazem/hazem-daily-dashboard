import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("autosaves notes only to the day whose note is loaded", async () => {
  const { shouldAutosaveDailyNote } = await vite.ssrLoadModule(
    "/lib/daily-notes.ts",
  );

  assert.equal(shouldAutosaveDailyNote("2026-09-06", "2026-09-06"), true);
  assert.equal(shouldAutosaveDailyNote("2026-09-06", "2026-09-07"), false);
  assert.equal(shouldAutosaveDailyNote(null, "2026-09-07"), false);
});

test("keeps dashboard controls responsive on narrow screens", async () => {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(css, /html,body\{max-width:100%;overflow-x:hidden\}/);
  assert.match(css, /grid-template-columns:44px minmax\(0,1fr\) 44px/);
  assert.match(css, /max-height:calc\(100dvh - 1rem\)/);
  assert.match(css, /\.analytics-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.category-create\{grid-template-columns:1fr\}/);
});

test("normalizes category names before duplicate checks", async () => {
  const { normalizeCategoryName } = await vite.ssrLoadModule(
    "/lib/categories.ts",
  );

  assert.equal(normalizeCategoryName("  Research   Work  "), "research work");
  assert.equal(normalizeCategoryName("FOLLOW-UP"), "follow-up");
});

test("rollover moves unfinished tasks and removes legacy copies", async () => {
  const source = await readFile(
    path.join(root, "app/api/tasks/rollover/route.ts"),
    "utf8",
  );

  assert.match(source, /update\(tasks\)/);
  assert.match(source, /delete\(tasks\)/);
  assert.match(source, /lte\(tasks\.taskDate, targetDate\)/);
  assert.doesNotMatch(source, /insert\(tasks\)/);
});

test("plans catch-up rollover without duplicating completed work", async () => {
  const { planTaskRollover } = await vite.ssrLoadModule(
    "/lib/task-rollover.ts",
  );

  const plan = planTaskRollover([
    { id: 1, createdAt: "lineage-a", taskDate: "2026-09-10", status: "in_progress" },
    { id: 2, createdAt: "lineage-a", taskDate: "2026-09-16", status: "in_progress" },
    { id: 3, createdAt: "lineage-b", taskDate: "2026-09-15", status: "not_started" },
    { id: 4, createdAt: "lineage-c", taskDate: "2026-09-14", status: "not_started" },
    { id: 5, createdAt: "lineage-c", taskDate: "2026-09-15", status: "completed" },
  ], "2026-09-17");

  assert.deepEqual(plan.moveIds, [2, 3]);
  assert.deepEqual(plan.duplicateIds, [1, 4]);
});

test("calculates explainable weekly review metrics and advice", async () => {
  const { buildWeeklyReview } = await vite.ssrLoadModule("/lib/weekly-review.ts");
  const tasks = [
    { id: 1, title: "Research draft", taskDate: "2026-09-14", priority: "high", status: "completed", category: "Research", createdAt: "2026-09-14T08:00:00Z", completedAt: "2026-09-14T12:00:00Z" },
    { id: 2, title: "Admin approval", taskDate: "2026-09-15", priority: "medium", status: "in_progress", category: "Administration", createdAt: "2026-09-10T08:00:00Z", completedAt: null },
  ];
  const notes = [{ noteDate: "2026-09-14", content: "Completed the research draft. Waiting for administrative approval." }];
  const review = buildWeeklyReview(tasks, notes, [], "2026-09-14", "2026-09-20", "2026-09-17");

  assert.equal(review.metrics.completionRate, 50);
  assert.equal(review.metrics.strategicProgress, 60);
  assert.equal(review.metrics.rolloverRate, 50);
  assert.match(review.insights.blocker, /Waiting/i);
  assert.match(review.actionPlan.improve, /carry-over/i);
  assert.equal(review.methodology.length, 5);
});

test("extracts the Arabic Ibrahim meeting relative to the note date", async () => {
  const { extractNoteActions, canCreateCalendarEvent, canCreateTask } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions(
    "2026-09-17",
    "اتفقت أمس مع إبراهيم شبايطة على لقاء أونلاين يوم الجمعة الساعة 3 عصراً لمناقشة المشروع.",
    ["Academic", "Meetings"],
  );
  assert.equal(candidate.type, "meeting");
  assert.equal(candidate.person, "إبراهيم شبايطة");
  assert.equal(candidate.date, "2026-09-18");
  assert.equal(candidate.time, "15:00");
  assert.equal(candidate.durationMinutes, 60);
  assert.equal(candidate.durationDefaulted, true);
  assert.equal(candidate.location, "Online");
  assert.equal(candidate.category, "Meetings");
  assert.equal(candidate.confidence, "high");
  assert.equal(canCreateTask(candidate), true);
  assert.equal(canCreateCalendarEvent(candidate), true);
});

test("extracts an English meeting and explicit duration", async () => {
  const { extractNoteActions } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions("2026-09-17", "Meeting with Sarah Ahmed on Friday at 3 PM for 90 minutes online to discuss the proposal.");
  assert.equal(candidate.person, "Sarah Ahmed");
  assert.equal(candidate.date, "2026-09-18");
  assert.equal(candidate.time, "15:00");
  assert.equal(candidate.durationMinutes, 90);
  assert.match(candidate.description, /proposal/i);
});

test("resolves Arabic tomorrow from note_date", async () => {
  const { extractNoteActions } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions("2026-09-17", "لدي لقاء غداً الساعة 10 صباحاً.");
  assert.equal(candidate.date, "2026-09-18");
  assert.equal(candidate.time, "10:00");
  assert.equal(candidate.dateSource, "inferred");
});

test("resolves day after tomorrow and Arabic word hours", async () => {
  const { extractNoteActions } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions("2026-09-17", "لدي اجتماع بعد غد الساعة الثالثة عصراً.");
  assert.equal(candidate.date, "2026-09-19");
  assert.equal(candidate.time, "15:00");
});

test("uses the following week when a weekday matches note_date", async () => {
  const { extractNoteActions } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions("2026-09-18", "لدي لقاء يوم الجمعة الساعة 15:00.");
  assert.equal(candidate.date, "2026-09-25");
});

test("extracts a standalone task without creating a meeting", async () => {
  const { extractNoteActions, canCreateCalendarEvent, canCreateTask } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions("2026-09-17", "تذكير بإرسال تقرير المشروع غداً.");
  assert.equal(candidate.type, "task");
  assert.equal(candidate.date, "2026-09-18");
  assert.equal(canCreateTask(candidate), true);
  assert.equal(canCreateCalendarEvent(candidate), false);
});

test("blocks tentative plans until they are confirmed", async () => {
  const { extractNoteActions, canCreateCalendarEvent } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions("2026-09-17", "ربما لدي لقاء مع إبراهيم يوم الجمعة الساعة 3 عصراً.");
  assert.equal(candidate.tentative, true);
  assert.equal(candidate.confidence, "needs_clarification");
  assert.equal(canCreateCalendarEvent(candidate), false);
  assert.equal(canCreateCalendarEvent({ ...candidate, confirmed: true }), true);
});

test("reports missing meeting date and time", async () => {
  const { extractNoteActions, canCreateCalendarEvent } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions("2026-09-17", "لدي لقاء مع إبراهيم لمناقشة المشروع.");
  assert.deepEqual(candidate.missingFields.sort(), ["date", "time"]);
  assert.equal(canCreateCalendarEvent(candidate), false);
});

test("supports explicit English and Arabic commands", async () => {
  const { extractNoteActions } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const candidates = extractNoteActions("2026-09-17", [
    "@schedule Online meeting with Ibrahim Shubaita | 2026-09-18 | 15:00 | 60m | Online",
    "@مهمة إرسال التقرير | 2026-09-19 | 09:30 | عالية | Research",
  ].join("\n"));
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].confidence, "high");
  assert.equal(candidates[0].durationMinutes, 60);
  assert.equal(candidates[1].type, "task");
  assert.equal(candidates[1].priority, "high");
  assert.equal(candidates[1].category, "Research");
});

test("parses Arabic duration explicitly", async () => {
  const { extractNoteActions } = await vite.ssrLoadModule("/lib/note-actions.ts");
  const [candidate] = extractNoteActions("2026-09-17", "اجتماع يوم الجمعة الساعة 3 عصراً لمدة 45 دقيقة.");
  assert.equal(candidate.durationMinutes, 45);
  assert.equal(candidate.durationDefaulted, false);
});

test("keeps action creation idempotent in tasks and Google Calendar", async () => {
  const source = await readFile(path.join(root, "app/api/actions/route.ts"), "utf8");
  assert.match(source, /findFirst/);
  assert.match(source, /eq\(tasks\.title, title\)/);
  assert.match(source, /privateExtendedProperty/);
  assert.match(source, /hazemDashboardId/);
});

test("requests Calendar event access and reports reauthorization", async () => {
  const connect = await readFile(path.join(root, "app/api/google/connect/route.ts"), "utf8");
  const status = await readFile(path.join(root, "app/api/google/status/route.ts"), "utf8");
  assert.match(connect, /calendar\.events/);
  assert.match(status, /reconnectRequired/);
  assert.doesNotMatch(connect, /calendar\.readonly/);
});

test("renders responsive detected-action controls", async () => {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  assert.match(css, /\.detected-actions/);
  assert.match(css, /\.detected-fields\{grid-template-columns:1fr\}/);
  assert.match(css, /\.detected-action-buttons\{display:grid;grid-template-columns:1fr\}/);
});
