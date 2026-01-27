import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ResumeListItem } from '../api';
import { ResumeData } from '@/components/dashboard/resume-component';

const DB_NAME = 'resume-matcher-db';
const STORE_NAME = 'resumes';

interface resume_db extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: ResumeListItem;
  };
}

class DBService {
  private dbPromise: Promise<IDBPDatabase<resume_db>> | null = null;

  private async getDb(): Promise<IDBPDatabase<resume_db>> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    this.dbPromise = this.open();
    return this.dbPromise;
  }

  private async open(): Promise<IDBPDatabase<resume_db>> {
    // Open the database without a version to get the latest version.
    let db = await openDB<resume_db>(DB_NAME);

    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const currentVersion = db.version;
      db.close();
      console.log('Object store not found, upgrading...');
      // Re-open with an incremented version to trigger the upgrade.
      db = await openDB<resume_db>(DB_NAME, currentVersion + 1, {
        upgrade(db, oldVersion, newVersion, transaction) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'resume_id' });
            console.log('Object store created:', STORE_NAME);
          }
        },
      });
    }
    return db;
  }

  async getAllItems(): Promise<ResumeListItem[]> {
    const db = await this.getDb();
    return db.getAll(STORE_NAME);
  }

  async getItemById(id: string): Promise<ResumeListItem | undefined> {
    const db = await this.getDb();
    return db.get(STORE_NAME, id);
  }

  async addItem(content: string): Promise<string> {
    const db = await this.getDb();
    const contentJson = JSON.parse(content) as ResumeListItem;
    await db.add(STORE_NAME, contentJson);
    return contentJson.resume_id;
  }

  async updateItem(resume_id: string, content: ResumeData): Promise<void> {
    const db = await this.getDb();
      const resume = await db.get(STORE_NAME, resume_id);
      console.log("Resume before:", resume);
      if (!resume) {
        throw new Error('Resume not found');
      }
      resume.content = content
      resume.updated_at = new Date().toISOString();
      console.log("Resume after:", resume);
      // await db.put(STORE_NAME,resume_id,resume);
  }

  async deleteItem(id: string): Promise<void> {
    const db = await this.getDb();
    await db.delete(STORE_NAME, id);
  }

  async clearAllItems(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
}

export const dbService = new DBService();
