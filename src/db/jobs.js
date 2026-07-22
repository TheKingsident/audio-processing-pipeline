import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class JobStore {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'church-audio-pipeline.db');
  }

  init() {
    if (this.db) return this.db;

    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initSchema();
    return this.db;
  }

  initSchema() {
    const schema = `
      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        source_file TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'transcribing',
        boundary_found INTEGER DEFAULT 0,
        transcript TEXT,
        proposed_cuts TEXT,
        reviewed_cuts TEXT,
        output_files TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    `;

    this.db.exec(schema);
  }

  getDb() {
    if (!this.db) this.init();
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  createJob({ jobId, sourceFile, status = 'transcribing' }) {
    const db = this.getDb();
    const id = jobId || randomUUID();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO jobs (job_id, source_file, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, sourceFile, status, now, now);
    return this.getJob(id);
  }

  getJob(jobId) {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
    return row ? this.mapJobRow(row) : null;
  }

  getPendingReviewJobs() {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT * FROM jobs 
      WHERE status IN ('awaiting_review', 'no_split_needed')
      ORDER BY created_at DESC
    `).all();
    return rows.map(this.mapJobRow);
  }

  getRecentJobs(limit = 50, offset = 0) {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT * FROM jobs 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    return rows.map(this.mapJobRow);
  }

  updateJob(jobId, updates) {
    const db = this.getDb();
    const allowedFields = [
      'source_file',
      'status',
      'boundary_found',
      'transcript',
      'proposed_cuts',
      'reviewed_cuts',
      'output_files',
      'error',
    ];

    const setClause = ['updated_at = ?'];
    const params = [new Date().toISOString()];

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClause.push(`${snakeKey} = ?`);
        if (value === null || value === undefined) {
          params.push(null);
        } else if (typeof value === 'boolean') {
          params.push(value ? 1 : 0);
        } else if (typeof value === 'object') {
          params.push(JSON.stringify(value));
        } else {
          params.push(value);
        }
      }
    }

    params.push(jobId);
    const sql = `UPDATE jobs SET ${setClause.join(', ')} WHERE job_id = ?`;
    db.prepare(sql).run(...params);

    return this.getJob(jobId);
  }

  deleteJob(jobId) {
    const db = this.getDb();
    db.prepare('DELETE FROM jobs WHERE job_id = ?').run(jobId);
  }

  mapJobRow(row) {
    let transcript = null;
    let proposedCuts = null;
    let reviewedCuts = null;
    let outputFiles = null;

    try { if (row.transcript) transcript = JSON.parse(row.transcript); } catch {}
    try { if (row.proposed_cuts) proposedCuts = JSON.parse(row.proposed_cuts); } catch {}
    try { if (row.reviewed_cuts) reviewedCuts = JSON.parse(row.reviewed_cuts); } catch {}
    try { if (row.output_files) outputFiles = JSON.parse(row.output_files); } catch {}

    return {
      jobId: row.job_id,
      sourceFile: row.source_file,
      status: row.status,
      boundaryFound: Boolean(row.boundary_found),
      transcript,
      proposedCuts,
      reviewedCuts,
      outputFiles,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      error: row.error || null,
    };
  }
}

export { JobStore };
export const jobsDb = new JobStore();
export default jobsDb;
