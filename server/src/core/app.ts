import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type Express } from 'express';
import { ingestRouter } from '../ingest/router';
import { voiceRouter } from '../voice/router';
import { REPO_ROOT } from './config';
import type { AppDeps } from './deps';
import { errorHandler } from './http';
import { coreRouter } from './routes';

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/ingest', ingestRouter(deps));
  app.use('/api/voice', voiceRouter(deps));
  app.use('/api', coreRouter(deps));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // In production the server also serves the built client.
  const dist = resolve(REPO_ROOT, 'client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(resolve(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
