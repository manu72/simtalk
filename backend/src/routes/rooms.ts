import { Hono } from 'hono';

import {
  apiErrorSchema,
  roomCreateResponseSchema,
  roomIdSchema,
  roomTokenRequestSchema,
  roomTokenResponseSchema
} from '@simtalk/shared-types';

import type { AppConfig } from '../config.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import { createLiveKitRoomService, LiveKitRoomError } from '../services/liveKitRooms.js';

type RoomsRouteDependencies = {
  readonly liveKitRoomService?: ReturnType<typeof createLiveKitRoomService>;
};

const parseJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export const createRoomsRoute = (
  config: AppConfig,
  dependencies: RoomsRouteDependencies = {}
) => {
  const route = new Hono();
  const roomService = dependencies.liveKitRoomService ?? createLiveKitRoomService(config);
  const rateLimit = createRateLimitMiddleware({
    maxRequests: config.roomTokenRateLimitMaxRequests,
    windowMs: config.roomTokenRateLimitWindowMs
  });

  route.post('/', rateLimit, async (c) => {
    try {
      const room = roomCreateResponseSchema.parse(await roomService.createRoom());
      c.header('Cache-Control', 'no-store');
      return c.json(room, 201);
    } catch (error) {
      if (error instanceof LiveKitRoomError && error.kind === 'missing_config') {
        return c.json(
          apiErrorSchema.parse({
            error: {
              code: 'missing_server_config',
              message: 'Remote rooms are not configured'
            }
          }),
          503
        );
      }

      if (error instanceof LiveKitRoomError) {
        return c.json(
          apiErrorSchema.parse({
            error: {
              code: 'livekit_unavailable',
              message: 'Remote rooms are unavailable'
            }
          }),
          502
        );
      }

      throw error;
    }
  });

  route.post('/:roomId/token', rateLimit, async (c) => {
    const roomId = c.req.param('roomId');
    const parsedRoomId = roomIdSchema.safeParse(roomId);
    if (!parsedRoomId.success) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'validation_error',
            message: 'Room id is invalid'
          }
        }),
        400
      );
    }

    const body = await parseJsonBody(c.req.raw);
    const parsedBody = roomTokenRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        apiErrorSchema.parse({
          error: {
            code: 'validation_error',
            message: parsedBody.error.issues[0]?.message ?? 'Room token request is invalid'
          }
        }),
        400
      );
    }

    try {
      const token = roomTokenResponseSchema.parse(
        await roomService.createParticipantToken(parsedRoomId.data, parsedBody.data)
      );
      c.header('Cache-Control', 'no-store');
      return c.json(token);
    } catch (error) {
      if (error instanceof LiveKitRoomError && error.kind === 'missing_config') {
        return c.json(
          apiErrorSchema.parse({
            error: {
              code: 'missing_server_config',
              message: 'Remote rooms are not configured'
            }
          }),
          503
        );
      }

      if (error instanceof LiveKitRoomError) {
        return c.json(
          apiErrorSchema.parse({
            error: {
              code: 'livekit_unavailable',
              message: 'Remote rooms are unavailable'
            }
          }),
          502
        );
      }

      throw error;
    }
  });

  return route;
};
