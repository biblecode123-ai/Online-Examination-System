/**
 * Local-first answer persistence using IndexedDB with resilient storage fallback.
 *
 * This service provides a reliable local storage layer for exam answers,
 * designed to survive browser refreshes, network disconnections, and power loss.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface PendingAnswer {
  attemptId: number;
  questionId: number;
  optionId: number | null;
  answerText: string | null;
  version: number;
  timestamp: number;
  synced: boolean;
  studentId?: number | null;
}

interface AnswerDBSchema extends DBSchema {
  answers: {
    key: [number, number]; // [attemptId, questionId]
    value: PendingAnswer;
    indexes: {
      'by-attempt': number;
      'by-timestamp': number;
    };
  };
}

const DB_NAME = 'ofijan-exam-answers';
const DB_VERSION = 2;
const FALLBACK_STORAGE_PREFIX = 'ofijan.answers.fallback.';

class AnswerPersistenceService {
  private db: IDBPDatabase<AnswerDBSchema> | null = null;
  private initPromise: Promise<IDBPDatabase<AnswerDBSchema> | null> | null = null;
  private isIndexedDBAvailable = true;
  private fallbackStore = new Map<string, PendingAnswer>();
  private warningListeners = new Set<(warning: string) => void>();

  /**
   * Subscribe to local storage warnings (e.g. quota exceeded or IndexedDB failure).
   */
  onWarning(callback: (warning: string) => void): () => void {
    this.warningListeners.add(callback);
    return () => this.warningListeners.delete(callback);
  }

  private emitWarning(message: string): void {
    console.warn(`[AnswerPersistence] ${message}`);
    this.warningListeners.forEach((listener) => {
      try {
        listener(message);
      } catch (err) {
        console.error('Error in warning listener:', err);
      }
    });
  }

  /**
   * Initialize the IndexedDB database with graceful fallback.
   */
  private async init(): Promise<IDBPDatabase<AnswerDBSchema> | null> {
    if (!this.isIndexedDBAvailable) return null;
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (typeof window === 'undefined' || !window.indexedDB) {
          throw new Error('IndexedDB not available in current environment');
        }

        const db = await openDB<AnswerDBSchema>(DB_NAME, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains('answers')) {
              const store = db.createObjectStore('answers', {
                keyPath: ['attemptId', 'questionId'],
              });
              store.createIndex('by-attempt', 'attemptId');
              store.createIndex('by-timestamp', 'timestamp');
            }
          },
        });

        this.db = db;
        this.isIndexedDBAvailable = true;
        return db;
      } catch (error) {
        console.warn('IndexedDB unavailable, engaging local storage fallback:', error);
        this.isIndexedDBAvailable = false;
        this.emitWarning('Browser storage is restricted. Operating in memory fallback mode.');
        return null;
      }
    })();

    return this.initPromise;
  }

  private fallbackKey(attemptId: number, questionId: number): string {
    return `${attemptId}_${questionId}`;
  }

  /**
   * Save an answer to IndexedDB (with instant fallback).
   */
  async saveAnswer(answer: PendingAnswer): Promise<void> {
    const key = this.fallbackKey(answer.attemptId, answer.questionId);
    this.fallbackStore.set(key, answer);

    // Also persist to localStorage as second-layer fallback
    try {
      localStorage.setItem(`${FALLBACK_STORAGE_PREFIX}${key}`, JSON.stringify(answer));
    } catch {
      /* ignore quota errors on best-effort localStorage */
    }

    try {
      const db = await this.init();
      if (db) {
        await db.put('answers', answer);
      }
    } catch (error) {
      console.warn('IndexedDB put failed, kept in fallback cache:', error);
      this.emitWarning('Saving locally using backup storage.');
    }
  }

  /**
   * Get a specific answer.
   */
  async getAnswer(attemptId: number, questionId: number): Promise<PendingAnswer | undefined> {
    const key = this.fallbackKey(attemptId, questionId);
    if (this.fallbackStore.has(key)) {
      return this.fallbackStore.get(key);
    }

    try {
      const db = await this.init();
      if (db) {
        const item = await db.get('answers', [attemptId, questionId]);
        if (item) {
          this.fallbackStore.set(key, item);
          return item;
        }
      }
    } catch (error) {
      console.warn('IndexedDB get failed:', error);
    }

    // Check localStorage fallback
    try {
      const raw = localStorage.getItem(`${FALLBACK_STORAGE_PREFIX}${key}`);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }

    return undefined;
  }

  /**
   * Get all answers for an attempt.
   */
  async getAnswersForAttempt(attemptId: number, studentId?: number | null): Promise<PendingAnswer[]> {
    const answersMap = new Map<number, PendingAnswer>();

    // 1. Read from IndexedDB if available
    try {
      const db = await this.init();
      if (db) {
        const dbAnswers = await db.getAllFromIndex('answers', 'by-attempt', attemptId);
        for (const ans of dbAnswers) {
          // If studentId is supplied, ensure ownership matches to protect shared lab computers
          if (studentId != null && ans.studentId != null && ans.studentId !== studentId) {
            continue;
          }
          answersMap.set(ans.questionId, ans);
        }
      }
    } catch (error) {
      console.warn('Failed to get answers from IndexedDB:', error);
    }

    // 2. Overlay fallback store
    for (const [key, ans] of this.fallbackStore.entries()) {
      if (ans.attemptId === attemptId) {
        if (studentId != null && ans.studentId != null && ans.studentId !== studentId) {
          continue;
        }
        answersMap.set(ans.questionId, ans);
      }
    }

    // 3. Overlay localStorage fallback keys
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`${FALLBACK_STORAGE_PREFIX}${attemptId}_`)) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const ans: PendingAnswer = JSON.parse(raw);
            if (studentId != null && ans.studentId != null && ans.studentId !== studentId) {
              continue;
            }
            if (!answersMap.has(ans.questionId) || ans.timestamp > (answersMap.get(ans.questionId)?.timestamp || 0)) {
              answersMap.set(ans.questionId, ans);
            }
          }
        }
      }
    } catch {
      /* ignore */
    }

    return Array.from(answersMap.values());
  }

  /**
   * Get unsynced answers for an attempt.
   */
  async getUnsyncedAnswers(attemptId: number, studentId?: number | null): Promise<PendingAnswer[]> {
    const all = await this.getAnswersForAttempt(attemptId, studentId);
    return all.filter((answer) => !answer.synced);
  }

  /**
   * Mark answers as synced.
   */
  async markAsSynced(attemptId: number, questionIds: number[]): Promise<void> {
    for (const questionId of questionIds) {
      const key = this.fallbackKey(attemptId, questionId);
      const existing = this.fallbackStore.get(key);
      if (existing) {
        existing.synced = true;
      }
      try {
        const raw = localStorage.getItem(`${FALLBACK_STORAGE_PREFIX}${key}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.synced = true;
          localStorage.setItem(`${FALLBACK_STORAGE_PREFIX}${key}`, JSON.stringify(parsed));
        }
      } catch {
        /* ignore */
      }
    }

    try {
      const db = await this.init();
      if (db) {
        const tx = db.transaction('answers', 'readwrite');
        for (const questionId of questionIds) {
          const answer = await tx.store.get([attemptId, questionId]);
          if (answer) {
            await tx.store.put({ ...answer, synced: true });
          }
        }
        await tx.done;
      }
    } catch (error) {
      console.warn('Failed to mark answers as synced in IndexedDB:', error);
    }
  }

  /**
   * Delete all answers for an attempt (after final submission confirmed by server).
   */
  async deleteAnswersForAttempt(attemptId: number): Promise<void> {
    // Clear from in-memory fallback
    for (const key of Array.from(this.fallbackStore.keys())) {
      if (key.startsWith(`${attemptId}_`)) {
        this.fallbackStore.delete(key);
      }
    }

    // Clear from localStorage fallback
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`${FALLBACK_STORAGE_PREFIX}${attemptId}_`)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }

    // Clear from IndexedDB
    try {
      const db = await this.init();
      if (db) {
        const answers = await db.getAllFromIndex('answers', 'by-attempt', attemptId);
        const tx = db.transaction('answers', 'readwrite');
        for (const answer of answers) {
          await tx.store.delete([answer.attemptId, answer.questionId]);
        }
        await tx.done;
      }
    } catch (error) {
      console.warn('Failed to clean up IndexedDB for attempt:', error);
    }
  }

  /**
   * Get count of unsynced answers for an attempt.
   */
  async getUnsyncedCount(attemptId: number, studentId?: number | null): Promise<number> {
    const unsynced = await this.getUnsyncedAnswers(attemptId, studentId);
    return unsynced.length;
  }

  /**
   * Recover answers formatted for attempt state hydration.
   */
  async recoverAnswersForAttempt(
    attemptId: number,
    studentId?: number | null,
  ): Promise<Record<number, { option_id: number | null; text?: string }>> {
    const answers = await this.getAnswersForAttempt(attemptId, studentId);
    const result: Record<number, { option_id: number | null; text?: string }> = {};

    for (const a of answers) {
      result[a.questionId] = {
        option_id: a.optionId,
        text: a.answerText ?? undefined,
      };
    }

    return result;
  }

  /**
   * Clear all data (for testing or signed-out lab resets).
   */
  async clearAll(): Promise<void> {
    this.fallbackStore.clear();
    try {
      const db = await this.init();
      if (db) {
        await db.clear('answers');
      }
    } catch (error) {
      console.warn('Failed to clear IndexedDB:', error);
    }
  }
}

export const answerPersistence = new AnswerPersistenceService();
