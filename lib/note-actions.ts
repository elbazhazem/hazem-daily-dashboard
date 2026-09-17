export type ActionConfidence = "high" | "medium" | "needs_clarification";
export type ActionSource = "explicit" | "inferred" | "missing";

export type NoteActionCandidate = {
  id: string;
  type: "meeting" | "task";
  sourceText: string;
  sourceNoteDate: string;
  title: string;
  taskTitle: string;
  person: string;
  date: string;
  time: string;
  durationMinutes: number;
  durationDefaulted: boolean;
  timezone: "Asia/Gaza";
  location: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
  confidence: ActionConfidence;
  reason: string;
  dateSource: ActionSource;
  timeSource: ActionSource;
  tentative: boolean;
  confirmed: boolean;
  missingFields: string[];
};

const arabicDigits: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

const arabicHours: Record<string, number> = {
  الواحدة: 1, واحد: 1, الأولى: 1, الاولى: 1,
  الثانية: 2, اثنتان: 2, اثنين: 2,
  الثالثة: 3, ثلاث: 3,
  الرابعة: 4, أربع: 4, اربعة: 4,
  الخامسة: 5, خمس: 5,
  السادسة: 6, ست: 6,
  السابعة: 7, سبع: 7,
  الثامنة: 8, ثمان: 8,
  التاسعة: 9, تسع: 9,
  العاشرة: 10, عشر: 10,
  الحادية: 11, أحدعشر: 11, احدى: 11,
  الثانيةعشرة: 12, اثناعشر: 12,
};

const weekdays: Array<{ day: number; patterns: RegExp[] }> = [
  { day: 0, patterns: [/الأحد/u, /الاحد/u, /\bsunday\b/i] },
  { day: 1, patterns: [/الإثنين/u, /الاثنين/u, /\bmonday\b/i] },
  { day: 2, patterns: [/الثلاثاء/u, /\btuesday\b/i] },
  { day: 3, patterns: [/الأربعاء/u, /الاربعاء/u, /\bwednesday\b/i] },
  { day: 4, patterns: [/الخميس/u, /\bthursday\b/i] },
  { day: 5, patterns: [/الجمعة/u, /\bfriday\b/i] },
  { day: 6, patterns: [/السبت/u, /\bsaturday\b/i] },
];

function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, (digit) => arabicDigits[digit]);
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `action-${(hash >>> 0).toString(36)}`;
}

function parseDate(text: string, noteDate: string): { value: string; source: ActionSource } {
  const normalized = normalizeDigits(text);
  const explicit = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicit) return { value: explicit[1], source: "explicit" };
  if (/(بعد غد|بعد بكرة|day after tomorrow)/iu.test(text)) return { value: addDays(noteDate, 2), source: "inferred" };
  if (/(غد(?:اً|ا)?|بكرة|tomorrow)/iu.test(text)) return { value: addDays(noteDate, 1), source: "inferred" };
  const weekday = weekdays.find((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  if (weekday) {
    const current = new Date(`${noteDate}T00:00:00Z`).getUTCDay();
    let difference = (weekday.day - current + 7) % 7;
    if (difference === 0) difference = 7;
    return { value: addDays(noteDate, difference), source: "inferred" };
  }
  if (/(الأسبوع القادم|الاسبوع القادم|next week)/iu.test(text)) return { value: addDays(noteDate, 7), source: "inferred" };
  return { value: "", source: "missing" };
}

function toTime(hour: number, minute: number, period: string) {
  const marker = period.toLocaleLowerCase();
  const isPm = /(pm|مساء|عصر|ظهر)/u.test(marker);
  const isAm = /(am|صباح)/u.test(marker);
  let value = hour;
  if (isPm && value < 12) value += 12;
  if (isAm && value === 12) value = 0;
  if (value > 23 || minute > 59) return "";
  return `${String(value).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTime(text: string): { value: string; source: ActionSource } {
  const normalized = normalizeDigits(text);
  const numeric = normalized.match(/(?:الساعة|عند الساعة|عند|at)\s*(\d{1,2})(?::(\d{2}))?\s*(صباح(?:اً|ا)?|مساء(?:ً|ا)?|عصر(?:اً|ا)?|ظهر(?:اً|ا)?|am|pm)?/iu)
    ?? normalized.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/iu);
  if (numeric) {
    const value = toTime(Number(numeric[1]), Number(numeric[2] ?? 0), numeric[3] ?? "");
    return value ? { value, source: "explicit" } : { value: "", source: "missing" };
  }
  const words = text.match(/(?:الساعة|عند الساعة|عند)\s+([\p{L}]+(?:\s+عشرة)?)\s*(صباح(?:اً|ا)?|مساء(?:ً|ا)?|عصر(?:اً|ا)?|ظهر(?:اً|ا)?)?/u);
  if (words) {
    const compact = words[1].replace(/\s+/g, "");
    const hour = arabicHours[words[1]] ?? arabicHours[compact];
    if (hour) return { value: toTime(hour, 0, words[2] ?? ""), source: "explicit" };
  }
  return { value: "", source: "missing" };
}

function parseDuration(text: string) {
  const normalized = normalizeDigits(text);
  const match = normalized.match(/(\d{1,3})\s*(دقيقة|دقائق|minutes?|mins?|ساعة|ساعات|hours?|hrs?|h|m)(?=\s|$|[،,.])/iu);
  if (!match) return { value: 60, defaulted: true };
  const amount = Number(match[1]);
  const unit = match[2].toLocaleLowerCase();
  return { value: /(ساعة|ساعات|hour|hr|^h$)/u.test(unit) ? amount * 60 : amount, defaulted: false };
}

function findPerson(text: string) {
  const arabic = text.match(/مع\s+([\p{Script=Arabic}\s.'-]{2,60}?)(?=\s+(?:على|يوم|غد|بعد|الساعة|عند|لمناقشة|لمتابعة|بخصوص|حول|عبر|أونلاين|اونلاين)|[،,.!?؟]|$)/u);
  if (arabic) return arabic[1].trim();
  const english = text.match(/\bwith\s+([A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){0,3})(?=\s+(?:on|at|to|about|for|online)|[,.!?]|$)/u);
  return english?.[1]?.trim() ?? "";
}

function findDescription(text: string) {
  const match = text.match(/(?:لمناقشة|لمتابعة|بخصوص|حول)\s+(.+?)(?=[.!؟]|$)/u)
    ?? text.match(/(?:to discuss|about)\s+(.+?)(?=[.!?]|$)/iu);
  return match?.[1]?.trim() ?? text.trim().slice(0, 400);
}

function chooseCategory(type: "meeting" | "task", categoryNames: string[]) {
  const wanted = type === "meeting" ? ["meetings", "meeting", "اجتماعات", "لقاءات"] : ["follow-up", "tasks", "متابعة"];
  return categoryNames.find((name) => wanted.includes(name.toLocaleLowerCase())) ?? (type === "meeting" ? "Meetings" : categoryNames.find((name) => name.toLocaleLowerCase() === "follow-up") ?? "Follow-up");
}

function parsePriority(text: string): "high" | "medium" | "low" {
  if (/(عاجل|هام جداً|high priority|urgent)/iu.test(text)) return "high";
  if (/(منخفض|غير عاجل|low priority)/iu.test(text)) return "low";
  return "medium";
}

function buildCandidate(input: {
  type: "meeting" | "task";
  sourceText: string;
  noteDate: string;
  title?: string;
  taskTitle?: string;
  date?: string;
  time?: string;
  durationMinutes?: number;
  durationDefaulted?: boolean;
  location?: string;
  description?: string;
  priority?: "high" | "medium" | "low";
  category?: string;
  dateSource?: ActionSource;
  timeSource?: ActionSource;
  structured?: boolean;
  categoryNames: string[];
}) {
  const text = input.sourceText.trim();
  const arabic = /[\p{Script=Arabic}]/u.test(text);
  const person = findPerson(text);
  const parsedDate = input.date ? { value: input.date, source: input.dateSource ?? "explicit" as ActionSource } : parseDate(text, input.noteDate);
  const parsedTime = input.time ? { value: input.time, source: input.timeSource ?? "explicit" as ActionSource } : parseTime(text);
  const duration = input.durationMinutes
    ? { value: input.durationMinutes, defaulted: Boolean(input.durationDefaulted) }
    : parseDuration(text);
  const tentative = /(ربما|قد |محتمل|يمكن أن|maybe|might|possibly|tentative)/iu.test(text);
  const location = input.location ?? (/(أونلاين|اونلاين|عن بعد|online|zoom|teams)/iu.test(text) ? "Online" : "");
  const generatedMeetingTitle = person
    ? (arabic ? `لقاء${location === "Online" ? " أونلاين" : ""} مع ${person}` : `${location === "Online" ? "Online " : ""}meeting with ${person}`)
    : (arabic ? "لقاء قادم" : "Upcoming meeting");
  const title = input.title?.trim() || (input.type === "meeting" ? generatedMeetingTitle : text.replace(/^(@task|@مهمة|يجب أن|أحتاج أن|احتاج أن|تذكير(?:\s+ب)?|I need to|Remember to)\s*/iu, "").slice(0, 180));
  const taskTitle = input.taskTitle?.trim() || (input.type === "meeting" ? (arabic ? `حضور ${generatedMeetingTitle}` : `Attend ${generatedMeetingTitle}`) : title);
  const missingFields = [
    !title ? "title" : "",
    !parsedDate.value ? "date" : "",
    input.type === "meeting" && !parsedTime.value ? "time" : "",
    tentative ? "confirmation" : "",
  ].filter(Boolean);
  const confidence: ActionConfidence = missingFields.length
    ? "needs_clarification"
    : input.structured || (parsedDate.value && (input.type === "task" || parsedTime.value))
      ? "high"
      : "medium";
  const reason = input.structured
    ? "Structured command with explicit fields."
    : input.type === "meeting"
      ? `Meeting language detected${person ? ` with ${person}` : ""}; date and time were parsed from the note.`
      : "Action language detected and converted into a task suggestion.";
  const candidate: NoteActionCandidate = {
    id: stableId(`${input.noteDate}|${input.type}|${text}`),
    type: input.type,
    sourceText: text,
    sourceNoteDate: input.noteDate,
    title,
    taskTitle,
    person,
    date: parsedDate.value,
    time: parsedTime.value,
    durationMinutes: duration.value,
    durationDefaulted: duration.defaulted,
    timezone: "Asia/Gaza",
    location,
    description: input.description?.trim() || findDescription(text),
    priority: input.priority ?? parsePriority(text),
    category: input.category?.trim() || chooseCategory(input.type, input.categoryNames),
    confidence,
    reason,
    dateSource: parsedDate.source,
    timeSource: parsedTime.source,
    tentative,
    confirmed: !tentative,
    missingFields,
  };
  return candidate;
}

function parseDurationField(value: string) {
  return parseDuration(value).value;
}

function parseStructuredLine(line: string, noteDate: string, categoryNames: string[]) {
  const meeting = line.match(/^@(schedule|موعد)\s+(.+)$/iu);
  if (meeting) {
    const fields = meeting[2].split("|").map((value) => value.trim());
    return buildCandidate({
      type: "meeting",
      sourceText: line,
      noteDate,
      title: fields[0],
      taskTitle: /[\p{Script=Arabic}]/u.test(fields[0]) ? `حضور ${fields[0]}` : `Attend ${fields[0]}`,
      date: fields[1] ?? "",
      time: fields[2] ?? "",
      durationMinutes: fields[3] ? parseDurationField(fields[3]) : 60,
      durationDefaulted: !fields[3],
      location: fields[4] ?? "Online",
      structured: true,
      categoryNames,
    });
  }
  const task = line.match(/^@(task|مهمة)\s+(.+)$/iu);
  if (task) {
    const fields = task[2].split("|").map((value) => value.trim());
    const priority = /^(high|عالية|مرتفع)/iu.test(fields[3] ?? "") ? "high" : /^(low|منخفضة|منخفض)/iu.test(fields[3] ?? "") ? "low" : "medium";
    return buildCandidate({
      type: "task",
      sourceText: line,
      noteDate,
      title: fields[0],
      taskTitle: fields[0],
      date: fields[1] ?? "",
      time: fields[2] ?? "",
      priority,
      category: fields[4],
      structured: true,
      categoryNames,
    });
  }
  return null;
}

export function extractNoteActions(noteDate: string, content: string, categoryNames: string[] = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(noteDate) || !content.trim()) return [];
  const lines = content.split(/\n+/).map((value) => value.trim()).filter(Boolean);
  const results: NoteActionCandidate[] = [];
  for (const line of lines) {
    const structured = parseStructuredLine(line, noteDate, categoryNames);
    if (structured) {
      results.push(structured);
      continue;
    }
    const sentences = line.split(/(?<=[.!?؟])\s+/u).map((value) => value.trim()).filter(Boolean);
    for (const sentence of sentences) {
      const meeting = /(لقاء|اجتماع|مكالمة|موعد|meeting|call|appointment)/iu.test(sentence);
      const task = /(يجب أن|أحتاج أن|احتاج أن|تذكير|إرسال|ارسال|أتواصل|اتواصل|I need to|Remember to|follow up|send |prepare )/iu.test(sentence);
      if (meeting) results.push(buildCandidate({ type: "meeting", sourceText: sentence, noteDate, categoryNames }));
      else if (task) results.push(buildCandidate({ type: "task", sourceText: sentence, noteDate, categoryNames }));
    }
  }
  return [...new Map(results.map((candidate) => [candidate.id, candidate])).values()];
}

export function canCreateTask(candidate: NoteActionCandidate) {
  return Boolean(candidate.taskTitle.trim() && candidate.date && (!candidate.tentative || candidate.confirmed));
}

export function canCreateCalendarEvent(candidate: NoteActionCandidate) {
  return Boolean(candidate.type === "meeting" && candidate.title.trim() && candidate.date && candidate.time && (!candidate.tentative || candidate.confirmed));
}
