/**
 * Answer synchronization engine.
 *
 * Handles batch synchronization of pending answers to the server with
 * dynamically configurable time-based, answer-count-based, and submission triggers.
 */

import { answerPersistence, type PendingAnswer } from './answerPersistence';
import { attemptApi, autosaveApi, DEFAULT_AUTOSAVE_SETTINGS, realExamApi } from './endpoints';
import { ApiError } from './api';
import type { AutosaveSettings } from './types';

export type SyncStatus =
  | 'idle'
  | 'saving_local'
  | 'saved_local'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'retry'
  | 'submitting'
  | 'submitted'
  | 'error';

export type AutosaveConfig = AutosaveSettings;

class AnswerSyncService {
  private config: AutosaveConfig = { ...DEFAULT_AUTOSAVE_SETTINGS };
  private syncInProgress = new Set<number>(); // attempt IDs with active sync
  private lastSyncTime = new Map<number, number>(); // attempt ID -> timestamp
  private timeBasedTimers = new Map<number, NodeJS.Timeout>();
  private statusCallbacks = new Map<number, (status: SyncStatus) => void>();
  private onlineListenerAttached = false;
  private activeAttempts = new Set<{ attemptId: number; isRealExam: boolean }>();

  constructor() {
    this.attachOnlineListener();
  }

  private attachOnlineListener(): void {
    if (typeof window === 'undefined' || this.onlineListenerAttached) return;
    window.addEventListener('online', () => {
      console.log('[AnswerSync] Network reconnected, resuming pending synchronizations');
      this.activeAttempts.forEach(({ attemptId, isRealExam }) => {
        void this.sync(attemptId, isRealExam);
      });
    });
    this.onlineListenerAttached = true;
  }

  /**
   * Load autosave configuration from the backend or local cache with fallback.
   */
  async loadConfig(examId?: number): Promise<AutosaveConfig> {
    try {
      const setting = await autosaveApi.getActive(examId);
      this.config = { ...DEFAULT_AUTOSAVE_SETTINGS, ...setting };
      return this.config;
    } catch (error) {
      console.warn('[AnswerSync] Failed to load server config, using defaults:', error);
      this.config = { ...DEFAULT_AUTOSAVE_SETTINGS };
      return this.config;
    }
  }

  /**
   * Get the currently active configuration.
   */
  getConfig(): AutosaveConfig {
    return this.config;
  }

  /**
   * Get essay debounce delay in milliseconds (configured setting).
   */
  getEssayDebounceMs(): number {
    const seconds = this.config.local_essay_debounce_seconds ?? 3;
    return Math.max(500, Math.min(seconds * 1000, 10000));
  }

  /**
   * Check if offline answer recovery from IndexedDB is enabled.
   */
  isOfflineRecoveryEnabled(): boolean {
    return this.config.offline_recovery_enabled ?? true;
  }

  /**
   * Register a status callback for an attempt.
   */
  onStatusChange(attemptId: number, callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.set(attemptId, callback);
    return () => this.statusCallbacks.delete(attemptId);
  }

  /**
   * Update status for an attempt.
   */
  private updateStatus(attemptId: number, status: SyncStatus): void {
    const callback = this.statusCallbacks.get(attemptId);
    if (callback) callback(status);
  }

  /**
   * Queue an answer for synchronization.
   * Immediately saves locally to IndexedDB before scheduling sync.
   */
  async queueAnswer(
    attemptId: number,
    questionId: number,
    optionId: number | null,
    answerText: string | null,
    isRealExam: boolean,
    studentId?: number | null,
  ): Promise<void> {
    this.activeAttempts.add({ attemptId, isRealExam });
    this.updateStatus(attemptId, 'saving_local');

    // Get existing answer to increment version for conflict detection
    const existing = await answerPersistence.getAnswer(attemptId, questionId);
    const version = existing ? existing.version + 1 : 1;

    const answer: PendingAnswer = {
      attemptId,
      questionId,
      optionId,
      answerText,
      version,
      timestamp: Date.now(),
      synced: false,
      studentId: studentId ?? null,
    };

    // 1. Save locally immediately
    await answerPersistence.saveAnswer(answer);
    this.updateStatus(attemptId, 'saved_local');

    // If automatic sync is disabled, answers remain safely in local storage until explicit submit
    if (this.config.active === false) {
      return;
    }

    // 2. Check if answer count threshold trigger reached
    if (this.config.answer_count_enabled) {
      const unsyncedCount = await answerPersistence.getUnsyncedCount(attemptId, studentId);
      const threshold = this.config.answer_count_threshold || 5;
      if (unsyncedCount >= threshold) {
        await this.sync(attemptId, isRealExam);
        return;
      }
    }

    // 3. Reset time-based sync timer
    this.resetTimeBasedSync(attemptId, isRealExam);
  }

  /**
   * Reset the time-based sync timer.
   */
  private resetTimeBasedSync(attemptId: number, isRealExam: boolean): void {
    const existingTimer = this.timeBasedTimers.get(attemptId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (!this.config.time_based_enabled || this.config.active === false) return;

    const intervalSeconds = this.config.time_interval_seconds || 30;
    const timer = setTimeout(() => {
      void this.sync(attemptId, isRealExam);
    }, intervalSeconds * 1000);

    this.timeBasedTimers.set(attemptId, timer);
  }

  /**
   * Synchronize pending answers for an attempt.
   */
  async sync(attemptId: number, isRealExam: boolean): Promise<void> {
    // Prevent overlapping sync requests for the same attempt
    if (this.syncInProgress.has(attemptId)) return;

    // Check minimum sync interval (throttle)
    const lastSync = this.lastSyncTime.get(attemptId) || 0;
    const elapsed = Date.now() - lastSync;
    const minInterval = (this.config.min_sync_interval_seconds || 10) * 1000;
    if (elapsed < minInterval && elapsed > 0) {
      return;
    }

    // Get unsynced answers
    const unsyncedAnswers = await answerPersistence.getUnsyncedAnswers(attemptId);
    if (unsyncedAnswers.length === 0) {
      this.updateStatus(attemptId, 'synced');
      return;
    }

    // Mark as syncing
    this.syncInProgress.add(attemptId);
    this.updateStatus(attemptId, 'syncing');

    try {
      // Chunk answers into batches respecting configured max_batch_size
      const batchSize = Math.max(1, Math.min(this.config.max_batch_size || 25, 200));
      const batches: PendingAnswer[][] = [];

      for (let i = 0; i < unsyncedAnswers.length; i += batchSize) {
        batches.push(unsyncedAnswers.slice(i, i + batchSize));
      }

      // Sync each batch sequentially
      for (const batch of batches) {
        await this.syncBatch(attemptId, batch, isRealExam);
      }

      this.lastSyncTime.set(attemptId, Date.now());
      this.updateStatus(attemptId, 'synced');
    } catch (error) {
      console.warn('[AnswerSync] Sync failed, keeping local answers:', error);

      // Check if browser is offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.updateStatus(attemptId, 'offline');
      } else {
        this.updateStatus(attemptId, 'retry');
      }

      // Retry with exponential backoff if not a permanent rejection
      if (!(error instanceof ApiError) || !this.isPermanentError(error)) {
        await this.retrySync(attemptId, isRealExam);
      } else {
        this.updateStatus(attemptId, 'error');
      }
    } finally {
      this.syncInProgress.delete(attemptId);
    }
  }

  /**
   * Sync a single batch of answers with server acknowledgment.
   */
  private async syncBatch(
    attemptId: number,
    answers: PendingAnswer[],
    isRealExam: boolean,
  ): Promise<void> {
    const payload = answers.map((a) => ({
      question_id: a.questionId,
      option_id: a.optionId,
      answer_text: a.answerText,
      version: a.version,
    }));

    if (isRealExam) {
      await realExamApi.batchSaveAnswers(attemptId, { answers: payload });
    } else {
      await attemptApi.batchSaveAnswers(attemptId, { answers: payload });
    }

    // Mark successfully acknowledged answers as synced in IndexedDB
    const questionIds = answers.map((a) => a.questionId);
    await answerPersistence.markAsSynced(attemptId, questionIds);
  }

  /**
   * Retry sync with exponential backoff and randomized jitter.
   */
  private async retrySync(attemptId: number, isRealExam: boolean): Promise<void> {
    const maxAttempts = this.config.retry_max_attempts || 5;
    const initialDelay = this.config.retry_initial_delay_ms || 5000;
    const maxDelay = this.config.retry_max_delay_ms || 30000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * 0.25 * delay; // 25% randomized jitter

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));

      try {
        await this.sync(attemptId, isRealExam);
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          this.updateStatus(attemptId, 'error');
        }
      }
    }
  }

  /**
   * Check if an error is permanent (e.g. attempt locked, completed, expired, or forbidden).
   */
  private isPermanentError(error: ApiError): boolean {
    return error.status === 403 || error.status === 404 || error.status === 423;
  }

  /**
   * Flush all pending answers before final submission.
   */
  async flush(attemptId: number, isRealExam: boolean): Promise<void> {
    this.updateStatus(attemptId, 'submitting');

    // Cancel time-based timer
    const timer = this.timeBasedTimers.get(attemptId);
    if (timer) {
      clearTimeout(timer);
      this.timeBasedTimers.delete(attemptId);
    }

    // Sync all pending answers immediately
    const unsyncedAnswers = await answerPersistence.getUnsyncedAnswers(attemptId);
    if (unsyncedAnswers.length > 0) {
      await this.sync(attemptId, isRealExam);
    }
  }

  /**
   * Clean up after final submission confirmed by server.
   */
  async cleanup(attemptId: number): Promise<void> {
    const timer = this.timeBasedTimers.get(attemptId);
    if (timer) {
      clearTimeout(timer);
      this.timeBasedTimers.delete(attemptId);
    }

    this.syncInProgress.delete(attemptId);
    this.lastSyncTime.delete(attemptId);
    this.statusCallbacks.delete(attemptId);
    this.activeAttempts.forEach((item) => {
      if (item.attemptId === attemptId) this.activeAttempts.delete(item);
    });

    // Delete local answers only after confirmed final submission
    await answerPersistence.deleteAnswersForAttempt(attemptId);
  }

  /**
   * Recover answers for an attempt (e.g. after refresh or browser restart).
   */
  async recover(attemptId: number, studentId?: number | null) {
    return await answerPersistence.recoverAnswersForAttempt(attemptId, studentId);
  }
}

export const answerSync = new AnswerSyncService();
