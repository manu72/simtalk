import { randomBytes } from 'node:crypto';

import { AccessToken, RoomServiceClient, type CreateOptions } from 'livekit-server-sdk';

import {
  participantIdentitySchema,
  roomCreateResponseSchema,
  roomIdSchema,
  roomTokenResponseSchema,
  type RoomCreateResponse,
  type RoomTokenRequest,
  type RoomTokenResponse
} from '@simtalk/shared-types';

import type { AppConfig } from '../config.js';

type RoomService = {
  readonly createRoom: (options: CreateOptions) => Promise<unknown>;
};

type TokenSignerArgs = {
  readonly roomId: string;
  readonly participantIdentity: string;
  readonly displayName: string | undefined;
  readonly ttlSeconds: number;
  readonly apiKey: string;
  readonly apiSecret: string;
};

type LiveKitRoomDependencies = {
  readonly now?: () => Date;
  readonly roomService?: RoomService;
  readonly tokenSigner?: (args: TokenSignerArgs) => Promise<string>;
  readonly randomId?: (prefix: 'room' | 'participant') => string;
};

export class LiveKitRoomError extends Error {
  constructor(
    message: string,
    readonly kind: 'missing_config' | 'upstream_unavailable' | 'invalid_request'
  ) {
    super(message);
    this.name = 'LiveKitRoomError';
  }
}

const toLiveKitHttpUrl = (url: string): string =>
  url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

const createRandomId = (prefix: 'room' | 'participant'): string =>
  `${prefix}_${randomBytes(18).toString('base64url')}`;

const isAlreadyExistsError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /already exists|already_exist|exists/i.test(error.message);
};

const assertLiveKitConfig = (
  config: AppConfig
): {
  readonly liveKitUrl: string;
  readonly liveKitApiKey: string;
  readonly liveKitApiSecret: string;
} => {
  if (!config.liveKitUrl || !config.liveKitApiKey || !config.liveKitApiSecret) {
    throw new LiveKitRoomError('LiveKit is not configured', 'missing_config');
  }

  return {
    liveKitUrl: config.liveKitUrl,
    liveKitApiKey: config.liveKitApiKey,
    liveKitApiSecret: config.liveKitApiSecret
  };
};

const defaultTokenSigner = async ({
  roomId,
  participantIdentity,
  displayName,
  ttlSeconds,
  apiKey,
  apiSecret
}: TokenSignerArgs): Promise<string> => {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: displayName,
    ttl: ttlSeconds
  });
  token.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true
  });

  return token.toJwt();
};

export const createLiveKitRoomService = (
  config: AppConfig,
  {
    now = () => new Date(),
    roomService,
    tokenSigner = defaultTokenSigner,
    randomId = createRandomId
  }: LiveKitRoomDependencies = {}
) => {
  const getRoomService = (): RoomService => {
    const liveKitConfig = assertLiveKitConfig(config);
    return (
      roomService ??
      new RoomServiceClient(
        toLiveKitHttpUrl(liveKitConfig.liveKitUrl),
        liveKitConfig.liveKitApiKey,
        liveKitConfig.liveKitApiSecret
      )
    );
  };

  const ensureRoom = async (roomId: string): Promise<void> => {
    try {
      await getRoomService().createRoom({
        name: roomId,
        maxParticipants: 2,
        emptyTimeout: config.liveKitRoomEmptyTimeoutSeconds,
        departureTimeout: config.liveKitRoomDepartureTimeoutSeconds,
        metadata: JSON.stringify({
          app: 'simtalk',
          phase: '1.5'
        })
      });
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return;
      }

      throw new LiveKitRoomError('LiveKit room could not be prepared', 'upstream_unavailable');
    }
  };

  const expiresAt = (): string =>
    new Date(now().getTime() + config.liveKitTokenTtlSeconds * 1000).toISOString();

  return {
    createRoom: async (): Promise<RoomCreateResponse> => {
      assertLiveKitConfig(config);
      const roomId = roomIdSchema.parse(randomId('room'));
      await ensureRoom(roomId);

      return roomCreateResponseSchema.parse({
        roomId,
        roomUrlPath: `/rooms/${roomId}`,
        expiresAt: expiresAt()
      });
    },

    createParticipantToken: async (
      roomId: string,
      request: RoomTokenRequest
    ): Promise<RoomTokenResponse> => {
      const liveKitConfig = assertLiveKitConfig(config);
      const parsedRoomId = roomIdSchema.parse(roomId);
      const participantIdentity = participantIdentitySchema.parse(
        request.participantIdentity ?? randomId('participant')
      );

      await ensureRoom(parsedRoomId);

      const participantToken = await tokenSigner({
        roomId: parsedRoomId,
        participantIdentity,
        displayName: request.displayName,
        ttlSeconds: config.liveKitTokenTtlSeconds,
        apiKey: liveKitConfig.liveKitApiKey,
        apiSecret: liveKitConfig.liveKitApiSecret
      });

      return roomTokenResponseSchema.parse({
        liveKitUrl: liveKitConfig.liveKitUrl,
        participantToken,
        roomId: parsedRoomId,
        participantIdentity,
        expiresAt: expiresAt()
      });
    }
  };
};
