/**
 * Answer synchronization engine.
 *
 * Handles batch synchronization of pending answers to the server with
 * configurable time-based and answer-count-based triggers.
 */

import { answerPersistence, type PendingAnswer } from './answerPersistence';
import { attemptApi, realExamApi } from './endpoints';
import { ApiError } from './api';
import type { AutosaveSettings } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export type AutosaveConfig = AutosaveSettings;

class AnswerSyncService {
  private config: AutosaveConfig | null = null;
  private syncInProgress = new Set<number>(); // attempt IDs with active sync
  private lastSyncTime = new Map<number, number>(); // attempt ID -> timestamp
  private timeBasedTimers = new Map<number, NodeJS.Timeout>();
  private statusCallbacks = new Map<number, (status: SyncStatus) => void>();

  /**
   * Load autosave configuration from the server.
   */
  async loadConfig(examId?: number): Promise<AutosaveConfig> {
    try {
      const response = await fetch(
        `/api/v1/autosave-settings/active?scope=${examId ? 'exam' : 'global'}${examId ? `&scope_id=${examId}` : ''}`
      );
      const data = await response.json();

      if (data.success && data.data) {
        this.config = data.data.setting;
        return this.config;
      }

      // Fallback to defaults
      this.config = {
        time_based_enabled: true,
        time_interval_seconds: 300,
        answer_count_enabled: true,
        answer_count_threshold: 5,
        max_batch_size: 50,
        max_concurrent_requests: 1,
        min_sync_interval_seconds: 30,
        retry_max_attempts: 5,
        retry_initial_delay_ms: 1000,
        retry_max_delay_ms: 30000,
        active: true,
      };
      return this.config;
    } catch (error) {
      console.error('Failed to load autosave config:', error);
      // Return safe defaults
      return {
        time_based_enabled: true,
        time_interval_seconds: 300,
        answer_count_enabled: true,
        answer_count_threshold: 5,
        max_batch_size: 50,
        max_concurrent_requests: 1,
        min_sync_interval_seconds: 30,
        retry_max_attempts: 5,
        retry_initial_delay_ms: 1000,
        retry_max_delay_ms: 30000,
        active: true,
      };
    }
  }

  /**
   * Register a status callback for an attempt.
   */
  onStatusChange(attemptId: number, callback: (status: SyncStatus) => void): void {
    this.statusCallbacks.set(attemptId, callback);
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
   */
  async queueAnswer(
    attemptId: number,
    questionId: number,
    optionId: number | null,
    answerText: string | null,
    isRealExam: boolean
  ): Promise<void> {
    // Get existing answer to determine version
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
    };

    // Save locally first
    await answerPersistence.saveAnswer(answer);

    // Check if we should trigger sync
    if (this.config?.answer_count_enabled) {
      const unsyncedCount = await answerPersistence.getUnsyncedCount(attemptId);
      if (unsyncedCount >= this.config.answer_count_threshold) {
        await this.sync(attemptId, isRealExam);
        return;
      }
    }

    // Reset time-based timer
    this.resetTimeBasedSync(attemptId, isRealExam);
  }

  /**
   * Reset the time-based sync timer.
   */
  private resetTimeBasedSync(attemptId: number, isRealExam: boolean): void {
    // Clear existing timer
    const existingTimer = this.timeBasedTimers.get(attemptId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (!this.config?.time_based_enabled) return;

    // Set new timer
    const timer = setTimeout(() => {
      this.sync(attemptId, isRealExam);
    }, this.config.time_interval_seconds * 1000);

    this.timeBasedTimers.set(attemptId, timer);
  }

  /**
   * Synchronize pending answers for an attempt.
   */
  async sync(attemptId: number, isRealExam: boolean): Promise<void> {
    // Prevent concurrent syncs for the same attempt
    if (this.syncInProgress.has(attemptId)) return;

    // Check minimum sync interval
    const lastSync = this.lastSyncTime.get(attemptId) || 0;
    const elapsed = Date.now() - lastSync;
    if (elapsed < (this.config?.min_sync_interval_seconds || 30) * 1000) {
      return;
    }

    // Get unsynced answers
    const unsyncedAnswers = await answerPersistence.getUnsyncedAnswers(attemptId);
    if (unsyncedAnswers.length === 0) return;

    // Mark as syncing
    this.syncInProgress.add(attemptId);
    this.updateStatus(attemptId, 'syncing');

    try {
      // Batch answers (respect max_batch_size)
      const batchSize = this.config?.max_batch_size || 50;
      const batches: PendingAnswer[][] = [];

      for (let i = 0; i < unsyncedAnswers.length; i += batchSize) {
        batches.push(unsyncedAnswers.slice(i, i + batchSize));
      }

      // Sync each batch
      for (const batch of batches) {
        await this.syncBatch(attemptId, batch, isRealExam);
      }

      this.lastSyncTime.set(attemptId, Date.now());
      this.updateStatus(attemptId, 'synced');
    } catch (error) {
      console.error('Sync failed:', error);
      this.updateStatus(attemptId, 'offline');

      // Retry with exponential backoff
      if (error instanceof ApiError && !this.isPermanentError(error)) {
        await this.retrySync(attemptId, isRealExam);
      } else {
        this.updateStatus(attemptId, 'error');
      }
    } finally {
      this.syncInProgress.delete(attemptId);
    }
  }

  /**
   * Sync a single batch of answers.
   */
  private async syncBatch(
    attemptId: number,
    answers: PendingAnswer[],
    isRealExam: boolean
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

    // Mark as synced
    const questionIds = answers.map((a) => a.questionId);
    await answerPersistence.markAsSynced(attemptId, questionIds);
  }

  /**
   * Retry sync with exponential backoff.
   */
  private async retrySync(attemptId: number, isRealExam: boolean): Promise<void> {
    const maxAttempts = this.config?.retry_max_attempts || 5;
    const initialDelay = this.config?.retry_initial_delay_ms || 1000;
    const maxDelay = this.config?.retry_max_delay_ms || 30000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * 0.2 * delay; // 20% jitter

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));

      try {
        await this.sync(attemptId, isRealExam);
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          this.updateStatus(attemptId, 'error');
          throw error;
        }
      }
    }
  }

  /**
   * Check if an error is permanent (should not retry).
   */
  private isPermanentError(error: ApiError): boolean {
    return error.status === 403 || error.status === 404 || error.status === 423;
  }

  /**
   * Flush all pending answers (for final submission).
   */
  async flush(attemptId: number, isRealExam: boolean): Promise<void> {
    // Cancel time-based timer
    const timer = this.timeBasedTimers.get(attemptId);
    if (timer) {
      clearTimeout(timer);
      this.timeBasedTimers.delete(attemptId);
    }

    // Sync all pending answers
    const unsyncedAnswers = await answerPersistence.getUnsyncedAnswers(attemptId);
    if (unsyncedAnswers.length > 0) {
      await this.sync(attemptId, isRealExam);
    }
  }

  /**
   * Clean up after final submission.
   */
  async cleanup(attemptId: number): Promise<void> {
    // Cancel timer
    const timer = this.timeBasedTimers.get(attemptId);
    if (timer) {
      clearTimeout(timer);
      this.timeBasedTimers.delete(attemptId);
    }

    // Clear sync state
    this.syncInProgress.delete(attemptId);
    this.lastSyncTime.delete(attemptId);
    this.statusCallbacks.delete(attemptId);

    // Delete local answers
    await answerPersistence.deleteAnswersForAttempt(attemptId);
  }

  /**
   * Recover answers for an attempt (for shared computer scenario).
   */
  async recover(attemptId: number): Promise<PendingAnswer[]> {
    return await answerPersistence.getAnswersForAttempt(attemptId);
  }
}

// Singleton instance
export const answerSync = new AnswerSyncService();
