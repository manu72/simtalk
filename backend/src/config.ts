export type AppConfig = {
  readonly appEnv: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
};

const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const;

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

export const createAppConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  appEnv: env.APP_ENV ?? 'development',
  port: parsePort(env.PORT),
  allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS)
});
