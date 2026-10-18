import { useQuery } from '@tanstack/react-query';
import { attemptApi, examApi, notificationApi, type PortalNotification } from './endpoints';
import type { Attempt, AttemptResult, Exam, ExamQuestionsResponse } from './types';

/** Central query keys (single source for cache identity/invalidation). */
export const queryKeys = {
  exams: (page: number, query: string, deptId?: number | null) =>
    ['exams', page, query, deptId ?? null] as const,
  exam: (id: string) => ['exam', id] as const,
  examQuestions: (id: string) => ['exam-questions', id] as const,
  attempt: (id: string) => ['attempt', id] as const,
  myAttempts: () => ['my-attempts'] as const,
  result: (id: string) => ['result', id] as const,
  notifications: () => ['notifications'] as const,
};

const MAX_ATTEMPT_PAGES = 10;

/** Fetch every page of the student's attempts (10 rows/page upstream). */
async function fetchAllMyAttempts(signal?: AbortSignal): Promise<Attempt[]> {
  const items: Attempt[] = [];
  for (let page = 1; page <= MAX_ATTEMPT_PAGES; page += 1) {
    const batch = await attemptApi.listMine(page, signal);
    items.push(...batch.items);
    if (!batch.hasMore) break;
  }
  return items;
}

export function useExams(page: number, search: string, deptId?: number | null) {
  return useQuery({
    queryKey: queryKeys.exams(page, search, deptId),
    queryFn: ({ signal }) => examApi.list({ page, query: search || undefined, deptId, signal }),
    placeholderData: (previous) => previous,
  });
}

export function useExam(examId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.exam(examId ?? ''),
    queryFn: ({ signal }) => examApi.get(examId as string, signal),
    enabled: Boolean(examId) && enabled,
    retry: false,
  });
}

export function useExamQuestions(examId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.examQuestions(examId ?? ''),
    queryFn: ({ signal }) => examApi.questions(examId as string, signal),
    enabled: Boolean(examId) && enabled,
    staleTime: 30_000,
  }) as ReturnType<typeof useQuery<ExamQuestionsResponse>>;
}

export function useMyAttempts() {
  return useQuery({
    queryKey: queryKeys.myAttempts(),
    queryFn: ({ signal }) => fetchAllMyAttempts(signal),
    staleTime: 15_000,
  });
}

export function useAttempt(attemptId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.attempt(attemptId ?? ''),
    queryFn: ({ signal }) => attemptApi.get(Number(attemptId), signal),
    enabled: Boolean(attemptId) && enabled,
    retry: false,
  });
}

export function useResult(attemptId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.result(attemptId ?? ''),
    queryFn: ({ signal }) => attemptApi.result(Number(attemptId), signal),
    enabled: Boolean(attemptId) && enabled,
    retry: false,
  }) as ReturnType<typeof useQuery<AttemptResult>>;
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: ({ signal }) => notificationApi.list(signal),
    staleTime: 60_000,
    retry: 1,
  });
}

export type { PortalNotification };
