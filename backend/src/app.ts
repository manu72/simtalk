import { Hono } from 'hono';

import { apiErrorSchema } from '@simtalk/shared-types';

import { createAppConfig, type AppConfig } from './config.js';
import { createAccessGateMiddleware } from './middleware/accessGate.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { healthRoute } from './routes/health.js';
import { createImageTranslateRoute } from './routes/imageTranslate.js';
import { createRealtimeRoute } from './routes/realtime.js';
import { createRoomsRoute } from './routes/rooms.js';
import type { createLiveKitRoomService } from './services/liveKitRooms.js';

type AppDependencies = {
  readonly fetch?: typeof fetch;
  readonly liveKitRoomService?: ReturnType<typeof createLiveKitRoomService>;
};

export const createApp = (
  config: AppConfig = createAppConfig(),
  dependencies: AppDependencies = {}
) => {
  const app = new Hono();
  const accessGate = createAccessGateMiddleware(config.appAccessPasswords);

  app.use('*', createCorsMiddleware(config));
  app.use('*', securityHeaders);

  app.route('/health', healthRoute);

  app.use('/realtime/*', accessGate);
  app.use('/rooms/*', accessGate);
  app.use('/image/*', accessGate);

  app.route('/realtime', createRealtimeRoute(config, dependencies));
  app.route('/rooms', createRoomsRoute(config, dependencies));
  app.route('/image', createImageTranslateRoute(config, dependencies));

  app.notFound((c) =>
    c.json(
      apiErrorSchema.parse({
        error: {
          code: 'not_found',
          message: 'Route not found'
        }
      }),
      404
    )
  );

  app.onError((error, c) => {
    console.error('Unhandled backend error', {
      name: error.name,
      message: error.message
    });

    return c.json(
      apiErrorSchema.parse({
        error: {
          code: 'internal_error',
          message: 'Unexpected server error'
        }
      }),
      500
    );
  });

  return app;
};

export const app = createApp();
