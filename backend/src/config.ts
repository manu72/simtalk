export type AppConfig = {
  readonly appAccessPassword: string | undefined;
  readonly appEnv: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly openAiApiKey: string | undefined;
  readonly openAiRealtimeClientSecretUrl: string;
  readonly realtimeClientSecretTtlSeconds: number;
  readonly realtimeTokenRateLimitWindowMs: number;
  readonly realtimeTokenRateLimitMaxRequests: number;
  readonly realtimeInputTranscriptionModel: string;
  readonly liveKitUrl: string | undefined;
  readonly liveKitApiKey: string | undefined;
  readonly liveKitApiSecret: string | undefined;
  readonly liveKitTokenTtlSeconds: number;
  readonly liveKitRoomEmptyTimeoutSeconds: number;
  readonly liveKitRoomDepartureTimeoutSeconds: number;
  readonly roomTokenRateLimitWindowMs: number;
  readonly roomTokenRateLimitMaxRequests: number;
};

const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const;
const defaultOpenAiRealtimeClientSecretUrl =
  'https://api.openai.com/v1/realtime/translations/client_secrets';
const defaultRealtimeInputTranscriptionModel = 'gpt-realtime-whisper';

const parseAllowedOrigins = (value: string | undefined): readonly string[] => {
  const origins = value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins && origins.length > 0 ? origins : defaultAllowedOrigins;
};

const parsePort = (value: string | undefined): number => {
  const port = Number(value);

  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3000;
};

const parseIntegerInRange = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export const createAppConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const appAccessPassword = env.APP_ACCESS_PASSWORD?.trim() || undefined;
  const appEnv = env.APP_ENV ?? 'development';

  if (!appAccessPassword && appEnv !== 'development') {
    console.warn(
      '[config] APP_ACCESS_PASSWORD is empty in a non-development environment — expensive API routes are publicly reachable.'
    );
  }

  return {
    appAccessPassword,
    appEnv,
    port: parsePort(env.PORT),
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    openAiApiKey: env.OPENAI_API_KEY?.trim() || undefined,
    openAiRealtimeClientSecretUrl:
      env.OPENAI_REALTIME_CLIENT_SECRET_URL?.trim() || defaultOpenAiRealtimeClientSecretUrl,
    realtimeClientSecretTtlSeconds: parseIntegerInRange(
      env.OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS,
      600,
      10,
      7200
    ),
    realtimeTokenRateLimitWindowMs: parseIntegerInRange(
      env.REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS,
      60_000,
      1_000,
      3_600_000
    ),
    realtimeTokenRateLimitMaxRequests: parseIntegerInRange(
      env.REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS,
      5,
      1,
      100
    ),
    realtimeInputTranscriptionModel:
      env.OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL?.trim() || defaultRealtimeInputTranscriptionModel,
    liveKitUrl: env.LIVEKIT_URL?.trim() || undefined,
    liveKitApiKey: env.LIVEKIT_API_KEY?.trim() || undefined,
    liveKitApiSecret: env.LIVEKIT_API_SECRET?.trim() || undefined,
    liveKitTokenTtlSeconds: parseIntegerInRange(env.LIVEKIT_TOKEN_TTL_SECONDS, 600, 60, 3600),
    liveKitRoomEmptyTimeoutSeconds: parseIntegerInRange(
      env.LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS,
      300,
      30,
      3600
    ),
    liveKitRoomDepartureTimeoutSeconds: parseIntegerInRange(
      env.LIVEKIT_ROOM_DEPARTURE_TIMEOUT_SECONDS,
      60,
      10,
      600
    ),
    roomTokenRateLimitWindowMs: parseIntegerInRange(
      env.ROOM_TOKEN_RATE_LIMIT_WINDOW_MS,
      60_000,
      1_000,
      3_600_000
    ),
    roomTokenRateLimitMaxRequests: parseIntegerInRange(
      env.ROOM_TOKEN_RATE_LIMIT_MAX_REQUESTS,
      10,
      1,
      100
    )
  };
};
