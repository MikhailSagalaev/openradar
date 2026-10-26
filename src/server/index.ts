import { serve } from '@hono/node-server';
import type { Hono } from 'hono';

export function startServer(app: Hono, port: number, hostname = '127.0.0.1'): ReturnType<typeof serve> {
  return serve(
    {
      fetch: app.fetch,
      port,
      hostname,
    },
    (info) => {
      console.log(`Radar is listening on http://${hostname}:${info.port}`);
    },
  );
}
