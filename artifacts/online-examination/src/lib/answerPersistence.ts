/**
 * Local-first answer persistence using IndexedDB.
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
}

interface AnswerDBSchema extends DBSchema {
  answers: {
    key: [number, number]; // [attemptId, questionId]
    value: PendingAnswer;
    indexes: {
      'by-attempt': number;
      'by-synced': [number, boolean];
      'by-timestamp': number;
    };
  };
}

const DB_NAME = 'ofijan-exam-answers';
const DB_VERSION = 1;

class AnswerPersistenceService {
  private db: IDBPDatabase<AnswerDBSchema> | null = null;
  private initPromise: Promise<IDBPDatabase<AnswerDBSchema>> | null = null;

  /**
   * Initialize the IndexedDB database.
   */
  private async init(): Promise<IDBPDatabase<AnswerDBSchema>> {
    if (this.db) return this.db;

    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const db = await openDB<AnswerDBSchema>(DB_NAME, DB_VERSION, {
          upgrade(db) {
            const store = db.createObjectStore('answers', {
              keyPath: ['attemptId', 'questionId'],
            });

            store.createIndex('by-attempt', 'attemptId');
            store.createIndex('by-synced', ['attemptId', 'synced']);
            store.createIndex('by-timestamp', 'timestamp');
          },
        });

        this.db = db;
        return db;
      } catch (error) {
        console.error('Failed to initialize answer persistence DB:', error);
        throw new Error('Failed to initialize local storage');
      }
    })();

    return this.initPromise;
  }

  /**
   * Save an answer to IndexedDB.
   */
  async saveAnswer(answer: PendingAnswer): Promise<void> {
    try {
      const db = await this.init();
      await db.put('answers', answer);
    } catch (error) {
      console.error('Failed to save answer locally:', error);
      throw new Error('Failed to save answer locally');
    }
  }

  /**
   * Get a specific answer.
   */
  async getAnswer(attemptId: number, questionId: number): Promise<PendingAnswer | undefined> {
    try {
      const db = await this.init();
      return await db.get('answers', [attemptId, questionId]);
    } catch (error) {
      console.error('Failed to get answer:', error);
      return undefined;
    }
  }

  /**
   * Get all answers for an attempt.
   */
  async getAnswersForAttempt(attemptId: number): Promise<PendingAnswer[]> {
    try {
      const db = await this.init();
      return await db.getAllFromIndex('answers', 'by-attempt', attemptId);
    } catch (error) {
      console.error('Failed to get answers for attempt:', error);
      return [];
    }
  }

  /**
   * Get unsynced answers for an attempt.
   */
  async getUnsyncedAnswers(attemptId: number): Promise<PendingAnswer[]> {
    try {
      const db = await this.init();
      return await db.getAllFromIndex('answers', 'by-synced', [attemptId, false]);
    } catch (error) {
      console.error('Failed to get unsynced answers:', error);
      return [];
    }
  }

  /**
   * Mark answers as synced.
   */
  async markAsSynced(attemptId: number, questionIds: number[]): Promise<void> {
    try {
      const db = await this.init();
      const tx = db.transaction('answers', 'readwrite');

      for (const questionId of questionIds) {
        const answer = await tx.store.get([attemptId, questionId]);
        if (answer) {
          await tx.store.put({ ...answer, synced: true });
        }
      }

      await tx.done;
    } catch (error) {
      console.error('Failed to mark answers as synced:', error);
      throw new Error('Failed to update sync status');
    }
  }

  /**
   * Delete all answers for an attempt (after final submission).
   */
  async deleteAnswersForAttempt(attemptId: number): Promise<void> {
    try {
      const db = await this.init();
      const answers = await this.getAnswersForAttempt(attemptId);
      const tx = db.transaction('answers', 'readwrite');

      for (const answer of answers) {
        await tx.store.delete([answer.attemptId, answer.questionId]);
      }

      await tx.done;
    } catch (error) {
      console.error('Failed to delete answers for attempt:', error);
      throw new Error('Failed to clean up local storage');
    }
  }

  /**
   * Get count of unsynced answers for an attempt.
   */
  async getUnsyncedCount(attemptId: number): Promise<number> {
    try {
      const answers = await this.getUnsyncedAnswers(attemptId);
      return answers.length;
    } catch (error) {
      console.error('Failed to get unsynced count:', error);
      return 0;
    }
  }

  /**
   * Clear all data (for testing or sign-out).
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.init();
      await db.clear('answers');
    } catch (error) {
      console.error('Failed to clear all answers:', error);
      throw new Error('Failed to clear local storage');
    }
  }
}

// Singleton instance
export const answerPersistence = new AnswerPersistenceService();
