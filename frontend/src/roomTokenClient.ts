import {
  apiErrorSchema,
  roomCreateResponseSchema,
  roomCreateRoute,
  roomIdSchema,
  roomTokenRequestSchema,
  roomTokenResponseSchema,
  roomTokenRoute,
  type ApiErrorCode,
  type RoomCreateResponse,
  type RoomTokenRequest,
  type RoomTokenResponse
} from '@simtalk/shared-types';

type RoomTokenClientOptions = {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
};

export class RoomTokenClientError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode | 'network_error',
    readonly status?: number
  ) {
    super(message);
    this.name = 'RoomTokenClientError';
  }
}

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, '')}${path}`;

const parseApiError = async (
  response: Response,
  fallback: string
): Promise<RoomTokenClientError> => {
  const payload = (await response.json().catch(() => null)) as unknown;
  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new RoomTokenClientError(parsed.data.error.message, parsed.data.error.code, response.status);
  }

  return new RoomTokenClientError(fallback, 'network_error', response.status);
};

export const requestRoomCreate = async ({
  apiBaseUrl = defaultApiBaseUrl,
  fetchImpl = fetch
}: RoomTokenClientOptions = {}): Promise<RoomCreateResponse> => {
  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiBaseUrl, roomCreateRoute), { method: 'POST' });
  } catch {
    throw new RoomTokenClientError('Unable to create a remote room.', 'network_error');
  }

  if (!response.ok) {
    throw await parseApiError(response, 'Remote room could not be created.');
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const parsed = roomCreateResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RoomTokenClientError('The SimTalk backend returned an unexpected room response.', 'network_error');
  }

  return parsed.data;
};

export const requestRoomToken = async (
  roomId: string,
  request: RoomTokenRequest,
  { apiBaseUrl = defaultApiBaseUrl, fetchImpl = fetch }: RoomTokenClientOptions = {}
): Promise<RoomTokenResponse> => {
  const parsedRequest = roomTokenRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    throw new RoomTokenClientError(
      parsedRequest.error.issues[0]?.message ?? 'Room token request is invalid',
      'validation_error'
    );
  }

  const parsedRoomId = roomIdSchema.safeParse(roomId);
  if (!parsedRoomId.success) {
    throw new RoomTokenClientError(
      parsedRoomId.error.issues[0]?.message ?? 'Room id is invalid',
      'validation_error'
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(joinUrl(apiBaseUrl, roomTokenRoute(parsedRoomId.data)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedRequest.data)
    });
  } catch {
    throw new RoomTokenClientError('Unable to join the remote room.', 'network_error');
  }

  if (!response.ok) {
    throw await parseApiError(response, 'Remote room could not be joined.');
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const parsedResponse = roomTokenResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new RoomTokenClientError('The SimTalk backend returned an unexpected room token.', 'network_error');
  }

  return parsedResponse.data;
};
