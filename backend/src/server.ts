import { serve } from '@hono/node-server';

import { app } from './app.js';
import { createAppConfig } from './config.js';

const config = createAppConfig();

serve(
  {
    fetch: app.fetch,
    port: config.port
  },
  (info) => {
    console.log(`SimTalk API listening on http://localhost:${info.port}`);
  }
);
