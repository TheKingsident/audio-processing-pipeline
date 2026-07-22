/**
 * src/db/jobs.js
 *
 * Uses the built-in node:sqlite module (stable in Node 22+, available in
 * Node 24 without any flag) so no native compilation is required.
 *
 * Schema matches Section 5 of church-audio-pipeline-spec.md:
 *   jobId, sourceFile, status, boundaryFound,
 *   transcript, proposedCuts, reviewedCuts, outputFiles,
 *   createdAt, updatedAt, error
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export class JobStore {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DB_PATH || './data/church-audio-pipeline.db';
  }

  init() {
    if (this.db) return this.db;

    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`PRAGMA journal_mode = WAL`);
    this.db.exec(`PRAGMA foreign_keys = ON`);
    this._initSchema();
    return this.db;
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id       TEXT PRIMARY KEY,
        source_file  TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'transcribing',
        boundary_found INTEGER DEFAULT 0,
        transcript    TEXT,
        proposed_cuts TEXT,
        reviewed_cuts TEXT,
        output_files  TEXT,
        created_at   TEXT DEFAULT (datetime('now')),
        updated_at   TEXT DEFAULT (datetime('now')),
        error        TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status     ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    `);
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

  // ── Job CRUD ───────────────────────────────────────────────────────────

  createJob({ jobId, sourceFile, status = 'transcribing' }) {
    const db = this.getDb();
    const id = jobId || randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO jobs (job_id, source_file, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, sourceFile, status, now, now);

    return this.getJob(id);
  }

  getJob(jobId) {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
    return row ? this._mapRow(row) : null;
  }

  getPendingReviewJobs() {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT * FROM jobs
      WHERE status IN ('awaiting_review', 'no_split_needed')
      ORDER BY created_at DESC
    `).all();
    return rows.map(r => this._mapRow(r));
  }

  getRecentJobs(limit = 50, offset = 0) {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
    return rows.map(r => this._mapRow(r));
  }

  updateJob(jobId, updates) {
    const db = this.getDb();

    const allowed = {
      sourceFile:    'source_file',
      status:        'status',
      boundaryFound: 'boundary_found',
      transcript:    'transcript',
      proposedCuts:  'proposed_cuts',
      reviewedCuts:  'reviewed_cuts',
      outputFiles:   'output_files',
      error:         'error',
    };

    const setClauses = ['updated_at = ?'];
    const params = [new Date().toISOString()];

    for (const [key, col] of Object.entries(allowed)) {
      if (!(key in updates)) continue;
      const val = updates[key];
      setClauses.push(`${col} = ?`);
      if (val === null || val === undefined) {
        params.push(null);
      } else if (key === 'boundaryFound') {
        params.push(val ? 1 : 0);
      } else if (typeof val === 'object') {
        params.push(JSON.stringify(val));
      } else {
        params.push(val);
      }
    }

    params.push(jobId);
    db.prepare(`UPDATE jobs SET ${setClauses.join(', ')} WHERE job_id = ?`).run(...params);
    return this.getJob(jobId);
  }

  deleteJob(jobId) {
    this.getDb().prepare('DELETE FROM jobs WHERE job_id = ?').run(jobId);
  }

  // ── Row mapper ────────────────────────────────────────────────────────

  _mapRow(row) {
    const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
    return {
      jobId:        row.job_id,
      sourceFile:   row.source_file,
      status:       row.status,
      boundaryFound: Boolean(row.boundary_found),
      transcript:   parse(row.transcript),
      proposedCuts: parse(row.proposed_cuts),
      reviewedCuts: parse(row.reviewed_cuts),
      outputFiles:  parse(row.output_files),
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
      error:        row.error || null,
    };
  }
}

export const jobsDb = new JobStore();
export default jobsDb;
