/** Pure helpers for Settings › Questions (the website's questions-settings.tsx rules). */
import type { FormQuestion } from "@shared/api/types";
import { KIND_LABEL } from "@shared/settings/question-form";

/** The filter: every question, the ones asked for all services, or one service's (its id). */
export type QuestionFilter = "all" | "global" | (string & {});

export const sortQuestions = (questions: readonly FormQuestion[]): FormQuestion[] =>
  [...questions].sort((a, b) => a.sortOrder - b.sortOrder);

export function filterQuestions(sorted: readonly FormQuestion[], filter: QuestionFilter): FormQuestion[] {
  if (filter === "all") return [...sorted];
  if (filter === "global") return sorted.filter((q) => q.serviceId === null);
  return sorted.filter((q) => q.serviceId === filter);
}

/**
 * The two sort-order updates that swap a question with its neighbour (`dir` -1 up, 1 down), or null at an end. Equal
 * sort orders (older data) fall back to the list positions, as the website does.
 */
export function moveUpdates(
  sorted: readonly FormQuestion[],
  id: string,
  dir: -1 | 1,
): [{ id: string; sortOrder: number }, { id: string; sortOrder: number }] | null {
  const i = sorted.findIndex((q) => q.id === id);
  const q = sorted[i];
  const other = sorted[i + dir];
  if (!q || !other) return null;
  const tie = other.sortOrder === q.sortOrder;
  return [
    { id: q.id, sortOrder: tie ? i + dir : other.sortOrder },
    { id: other.id, sortOrder: tie ? i : q.sortOrder },
  ];
}

/** "Choice: Left, Right, Both · Initial assessment". */
export function questionSummary(q: FormQuestion, serviceName: (id: string | null) => string): string {
  const kind = KIND_LABEL[q.kind] + (q.kind === "select" ? `: ${q.options.join(", ")}` : "");
  return `${kind} · ${serviceName(q.serviceId)}`;
}
