import { jobsDb } from './jobs.js';

export const JobRepository = {
  create: (inputFileId, options = {}) => jobsDb.createJob({ sourceFile: options.sourceFile || inputFileId }),
  findById: (id) => jobsDb.getJob(id),
  findByStatus: (status) => jobsDb.getPendingReviewJobs(),
  findRecent: (limit) => jobsDb.getRecentJobs(limit),
  updateStatus: (id, status, updates = {}) => jobsDb.updateJob(id, { status, ...updates }),
  setError: (id, error) => jobsDb.updateJob(id, { status: 'failed', error: error.message || String(error) }),
  delete: (id) => jobsDb.deleteJob(id),
};

export const FileRepository = {
  create: (data) => data,
  findById: (id) => ({ id }),
};

export const StepRepository = {
  createSteps: () => [],
  updateStep: () => {},
  findByJobId: () => [],
};