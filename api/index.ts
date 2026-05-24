import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';

import { createApp } from '../backend/src/app.js';

export const app = new Hono().route('/api', createApp());

export default getRequestListener(app.fetch);
