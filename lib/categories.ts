export const DEFAULT_CATEGORY_NAMES = [
  "Academic",
  "Research",
  "Teaching",
  "Administrative",
  "Personal",
  "Follow-up",
] as const;

export function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
