import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { initDatabase } from '../db/index.js';
import uploadRoutes from './routes/upload.js';
import statusRoutes from './routes/status.js';
import reviewRoutes from './routes/review.js';
import watcherRoutes from './routes/watcher.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts in review UI
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Serve static review UI from src/public/
app.use(express.static(join(__dirname, '..', 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/upload', uploadRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/watcher', watcherRoutes);

// Fallback: serve review UI for any non-API route (SPA)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found', path: req.path });
  }
});

// Error handler (must be last)
app.use(errorHandler);

export async function startApiServer() {
  initDatabase();
  logger.info('Database initialized');

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, `API server started on http://localhost:${config.port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

export default app;