import { describe, expect, it, vi } from 'vitest';

import {
  realtimeTokenRoute,
  roomCreateRoute,
  roomTokenRoute
} from '@simtalk/shared-types';

import { createApp } from '../../../backend/src/app.js';
import { createAppConfig } from '../../../backend/src/config.js';

const PASSWORD = 'hunter2';
const ROOM_ID = 'room_abcdefghijklmnopqrstuvwxyz';

const baseEnv: NodeJS.ProcessEnv = {
  APP_ENV: 'test',
  OPENAI_API_KEY: 'sk-test-secret',
  APP_ACCESS_PASSWORD: PASSWORD
};

const openAiSuccessPayload = {
  value: 'ek_test_client_secret',
  expires_at: 1_779_280_000,
  session: { id: 'sess_test', expires_at: 1_779_280_600 }
};

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const createRoomService = () => ({
  createRoom: vi.fn(async () => ({
    roomId: ROOM_ID,
    roomUrlPath: `/rooms/${ROOM_ID}`,
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  })),
  createParticipantToken: vi.fn(async () => ({
    liveKitUrl: 'wss://simtalk.livekit.cloud',
    participantToken: 'livekit.jwt',
    roomId: ROOM_ID,
    participantIdentity: 'participant_abcdefghijklmnop',
    expiresAt: new Date('2026-05-20T13:10:00.000Z').toISOString()
  }))
});

const realtimeRequest = (headers: Record<string, string> = {}) =>
  new Request(`http://localhost${realtimeTokenRoute}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
      ...headers
    },
    body: JSON.stringify({ mode: 'listener', targetLanguage: 'es' })
  });

describe('access gate integration', () => {
  it('rejects /realtime/token without the X-Access-Password header', async () => {
    const app = createApp(createAppConfig(baseEnv), {
      fetch: vi.fn(async () => createJsonResponse(openAiSuccessPayload))
    });

    const response = await app.request(realtimeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { code: 'unauthorized', message: 'Access denied.' }
    });
  });

  it('rejects /realtime/token with the wrong password', async () => {
    const app = createApp(createAppConfig(baseEnv), {
      fetch: vi.fn(async () => createJsonResponse(openAiSuccessPayload))
    });

    const response = await app.request(realtimeRequest({ 'X-Access-Password': 'nope' }));

    expect(response.status).toBe(401);
  });

  it('allows /realtime/token with the correct password', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(openAiSuccessPayload));
    const app = createApp(createAppConfig(baseEnv), { fetch: fetchMock });

    const response = await app.request(realtimeRequest({ 'X-Access-Password': PASSWORD }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rejects POST /rooms without the header', async () => {
    const app = createApp(createAppConfig(baseEnv), { liveKitRoomService: createRoomService() });

    const response = await app.request(roomCreateRoute, { method: 'POST' });

    expect(response.status).toBe(401);
  });

  it('allows POST /rooms with the correct header', async () => {
    const roomService = createRoomService();
    const app = createApp(createAppConfig(baseEnv), { liveKitRoomService: roomService });

    const response = await app.request(roomCreateRoute, {
      method: 'POST',
      headers: { 'X-Access-Password': PASSWORD }
    });

    expect(response.status).toBe(201);
    expect(roomService.createRoom).toHaveBeenCalled();
  });

  it('rejects POST /rooms/:roomId/token without the header', async () => {
    const app = createApp(createAppConfig(baseEnv), { liveKitRoomService: createRoomService() });

    const response = await app.request(roomTokenRoute(ROOM_ID), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantIdentity: 'participant_abcdefghijklmnop',
        targetLanguage: 'en'
      })
    });

    expect(response.status).toBe(401);
  });

  it('allows GET /health without the header', async () => {
    const app = createApp(createAppConfig(baseEnv));

    const response = await app.request('/health');

    expect(response.status).toBe(200);
  });

  it('fails config creation when APP_ACCESS_PASSWORD is empty outside development', () => {
    expect(() => createAppConfig({ ...baseEnv, APP_ACCESS_PASSWORD: '' })).toThrow(
      'APP_ACCESS_PASSWORD is required when APP_ENV is "test"'
    );
  });

  it('accepts any password from a comma-separated allow-list', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse(openAiSuccessPayload));
    const app = createApp(
      createAppConfig({ ...baseEnv, APP_ACCESS_PASSWORD: 'Password1,XpasswordX' }),
      { fetch: fetchMock }
    );

    const first = await app.request(realtimeRequest({ 'X-Access-Password': 'Password1' }));
    const second = await app.request(realtimeRequest({ 'X-Access-Password': 'XpasswordX' }));
    const rejected = await app.request(realtimeRequest({ 'X-Access-Password': 'revoked' }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(rejected.status).toBe(401);
  });
});
