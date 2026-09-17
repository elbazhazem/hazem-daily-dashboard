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
