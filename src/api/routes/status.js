import express from 'express';
import { jobsDb } from '../../db/jobs.js';

const router = express.Router();

// GET /api/status - List recent jobs
router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const jobs = jobsDb.getRecentJobs(limit, offset);
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

// GET /api/status/:jobId - Get full job status
router.get('/:jobId', async (req, res, next) => {
  try {
    const job = jobsDb.getJob(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job });
  } catch (err) {
    next(err);
  }
});

export default router;