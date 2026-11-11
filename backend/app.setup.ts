import type { INestApplication } from '@nestjs/common';
import express, { json } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Shared HTTP configuration for the real server and the HTTP tests. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  // Exam images and PDFs are sent as base64 JSON for OCR.
  app.use(json({ limit: '30mb' }));
  app.enableShutdownHooks();
  serveFrontend(app);
  return app;
}

/**
 * In production one process serves both the API and the built React app (dist/), so a single
 * container and port is enough. In development Vite serves the app instead and this is skipped.
 */
function serveFrontend(app: INestApplication) {
  const dir = resolve(process.env.STATIC_DIR || 'dist');
  const index = join(dir, 'index.html');
  if (process.env.SERVE_STATIC === 'false' || !existsSync(index)) return;

  // File names under assets/ contain a content hash, so they can be cached for a year.
  app.use('/assets', express.static(join(dir, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  app.use(express.static(dir, { index: false, maxAge: '1h' }));
  // Any other GET outside /api is a client-side route (/classes, /student/...): answer with the app shell.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
