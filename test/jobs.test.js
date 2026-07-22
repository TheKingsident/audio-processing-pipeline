import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { JobStore } from '../src/db/jobs.js';

const TEST_DB_PATH = join(process.cwd(), 'data', 'test-pipeline.db');

let store;

beforeEach(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  store = new JobStore();
  store.init();
});

afterEach(() => {
  store.close();
  try { if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH); } catch {}
});

describe('JobStore — CRUD', () => {
  it('creates a job with default status transcribing', () => {
    const job = store.createJob({ sourceFile: '/tmp/audio.mp3' });
    expect(job).toBeTruthy();
    expect(job.jobId).toBeTruthy();
    expect(job.sourceFile).toBe('/tmp/audio.mp3');
    expect(job.status).toBe('transcribing');
    expect(job.boundaryFound).toBe(false);
    expect(job.transcript).toBeNull();
  });

  it('retrieves a job by jobId', () => {
    const created = store.createJob({ sourceFile: '/tmp/test.mp3' });
    const fetched = store.getJob(created.jobId);
    expect(fetched.jobId).toBe(created.jobId);
  });

  it('updates job status to awaiting_review', () => {
    const job = store.createJob({ sourceFile: '/tmp/test.mp3' });
    const updated = store.updateJob(job.jobId, { status: 'awaiting_review', boundaryFound: true });
    expect(updated.status).toBe('awaiting_review');
    expect(updated.boundaryFound).toBe(true);
  });

  it('stores and retrieves transcript words', () => {
    const job = store.createJob({ sourceFile: '/tmp/test.mp3' });
    const words = [
      { word: 'Hello', start: 0.0, end: 0.5 },
      { word: 'world', start: 0.6, end: 1.0 },
    ];
    store.updateJob(job.jobId, { transcript: words });
    const fetched = store.getJob(job.jobId);
    expect(fetched.transcript).toHaveLength(2);
    expect(fetched.transcript[0].word).toBe('Hello');
  });

  it('stores and retrieves proposedCuts', () => {
    const job = store.createJob({ sourceFile: '/tmp/test.mp3' });
    const cuts = [
      { start: 0.0, end: 10.0, type: 'prayer', reason: 'Opening prayer' },
      { start: 10.0, end: 60.0, type: 'sermon', reason: 'Sermon' },
    ];
    store.updateJob(job.jobId, { proposedCuts: cuts });
    const fetched = store.getJob(job.jobId);
    expect(fetched.proposedCuts).toHaveLength(2);
    expect(fetched.proposedCuts[0].type).toBe('prayer');
  });

  it('stores reviewedCuts and outputFiles separately', () => {
    const job = store.createJob({ sourceFile: '/tmp/test.mp3' });
    const reviewedCuts = [{ start: 0, end: 5, type: 'prayer', reason: 'test' }];
    const outputFiles = { prayer: '/tmp/prayer.mp3', sermon: '/tmp/sermon.mp3' };
    store.updateJob(job.jobId, { reviewedCuts, outputFiles, status: 'done' });
    const fetched = store.getJob(job.jobId);
    expect(fetched.reviewedCuts[0].type).toBe('prayer');
    expect(fetched.outputFiles.sermon).toBe('/tmp/sermon.mp3');
    expect(fetched.status).toBe('done');
  });

  it('lists jobs in awaiting_review and no_split_needed', () => {
    store.createJob({ sourceFile: '/tmp/a.mp3' });
    const j2 = store.createJob({ sourceFile: '/tmp/b.mp3' });
    store.updateJob(j2.jobId, { status: 'awaiting_review' });
    const j3 = store.createJob({ sourceFile: '/tmp/c.mp3' });
    store.updateJob(j3.jobId, { status: 'no_split_needed' });

    const pending = store.getPendingReviewJobs();
    expect(pending).toHaveLength(2);
    expect(pending.map(j => j.status)).toContain('awaiting_review');
    expect(pending.map(j => j.status)).toContain('no_split_needed');
  });

  it('marks job as failed with error message', () => {
    const job = store.createJob({ sourceFile: '/tmp/test.mp3' });
    store.updateJob(job.jobId, { status: 'failed', error: 'WhisperX crashed' });
    const fetched = store.getJob(job.jobId);
    expect(fetched.status).toBe('failed');
    expect(fetched.error).toBe('WhisperX crashed');
  });

  it('returns null for a non-existent jobId', () => {
    const job = store.getJob('non-existent-id');
    expect(job).toBeNull();
  });

  it('deletes a job', () => {
    const job = store.createJob({ sourceFile: '/tmp/test.mp3' });
    store.deleteJob(job.jobId);
    expect(store.getJob(job.jobId)).toBeNull();
  });
});
