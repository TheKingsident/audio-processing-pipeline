import express from 'express';
import { checkDriveIntake } from '../../workers/watcher.js';
import { logger } from '../../lib/logger.js';

const router = express.Router();

// POST /api/watcher/check - Manual trigger for Drive folder intake
router.post('/check', async (req, res, next) => {
  try {
    logger.info('Manual watcher check triggered via API');
    const result = await checkDriveIntake();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/watcher/status - Scheduled windows info
router.get('/status', (req, res) => {
  res.json({
    enabled: true,
    schedule: [
      { label: 'Sunday 9:45–10:45am', cron: '45,55 9 * * 0 and 5,15,25,35,45 10 * * 0', interval: 'every 10 min' },
      { label: 'Sunday 12:30–1:30pm', cron: '30,40,50 12 * * 0 and 0,10,20,30 13 * * 0', interval: 'every 10 min' },
      { label: 'Wednesday 6:40–7:20pm', cron: '40,50 18 * * 3 and 0,10,20 19 * * 3', interval: 'every 10 min' },
    ],
  });
});

export default router;