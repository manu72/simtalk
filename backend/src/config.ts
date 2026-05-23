export type AppConfig = {
  readonly appEnv: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly openAiApiKey: string | undefined;
  readonly openAiRealtimeClientSecretUrl: string;
  readonly realtimeClientSecretTtlSeconds: number;
  readonly realtimeTokenRateLimitWindowMs: number;
  readonly realtimeTokenRateLimitMaxRequests: number;
  readonly realtimeInputTranscriptionModel: string;
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

export const createAppConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  appEnv: env.APP_ENV ?? 'development',
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
    env.OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL?.trim() || defaultRealtimeInputTranscriptionModel
});
