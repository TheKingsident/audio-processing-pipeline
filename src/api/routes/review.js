import express from 'express';
import { jobsDb } from '../../db/jobs.js';
import { enqueueEditUploadJob } from '../../lib/queue.js';
import { logger } from '../../lib/logger.js';

const router = express.Router();

function getTranscriptContext(transcriptWords, start, end, windowSeconds = 5) {
  if (!Array.isArray(transcriptWords)) return '';
  const contextWords = transcriptWords.filter(
    w => w.start >= start - windowSeconds && w.end <= end + windowSeconds
  );
  if (contextWords.length === 0) return '';
  const contextStart = contextWords[0].start.toFixed(1);
  const contextEnd = contextWords[contextWords.length - 1].end.toFixed(1);
  const text = contextWords.map(w => w.word).join(' ');
  return `[${contextStart}s-${contextEnd}s] ${text}`;
}

function enrichCutsWithContext(cuts, transcriptWords) {
  if (!Array.isArray(cuts)) return [];
  return cuts.map(cut => ({
    ...cut,
    context: getTranscriptContext(transcriptWords, cut.start, cut.end),
  }));
}

// GET /api/review/pending - List jobs awaiting review
router.get('/pending', async (req, res, next) => {
  try {
    const jobs = jobsDb.getPendingReviewJobs();

    const jobsWithContext = jobs.map(job => ({
      jobId: job.jobId,
      sourceFile: job.sourceFile,
      status: job.status,
      boundaryFound: job.boundaryFound,
      proposedCuts: enrichCutsWithContext(job.proposedCuts, job.transcript),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }));

    res.json({ jobs: jobsWithContext });
  } catch (err) {
    next(err);
  }
});

// GET /api/review/:jobId - Get detailed review data for one job
router.get('/:jobId', async (req, res, next) => {
  try {
    const job = jobsDb.getJob(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'awaiting_review' && job.status !== 'no_split_needed') {
      return res.status(400).json({
        error: 'Job is not awaiting review',
        status: job.status,
      });
    }

    res.json({
      job: {
        jobId: job.jobId,
        sourceFile: job.sourceFile,
        status: job.status,
        boundaryFound: job.boundaryFound,
        proposedCuts: enrichCutsWithContext(job.proposedCuts, job.transcript),
        transcript: job.transcript,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/review/:jobId/approve - Approve with optional edited cuts
router.post('/:jobId/approve', async (req, res, next) => {
  try {
    const { reviewedCuts } = req.body;
    const job = jobsDb.getJob(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'awaiting_review' && job.status !== 'no_split_needed') {
      return res.status(400).json({
        error: 'Job is not awaiting review',
        status: job.status,
      });
    }

    const cutsToUse = reviewedCuts || job.proposedCuts || [];

    jobsDb.updateJob(job.jobId, {
      status: 'approved',
      reviewedCuts: cutsToUse,
    });

    await enqueueEditUploadJob(job.jobId);

    logger.info({ jobId: job.jobId, cutsCount: cutsToUse.length }, 'Job approved and enqueued for editing');

    res.json({ success: true, jobId: job.jobId, status: 'approved' });
  } catch (err) {
    next(err);
  }
});

// POST /api/review/:jobId/reject - Reject the job
router.post('/:jobId/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const job = jobsDb.getJob(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    jobsDb.updateJob(job.jobId, {
      status: 'rejected',
      error: reason || 'Rejected by reviewer',
    });

    logger.info({ jobId: job.jobId, reason }, 'Job rejected');

    res.json({ success: true, jobId: job.jobId, status: 'rejected' });
  } catch (err) {
    next(err);
  }
});

export default router;