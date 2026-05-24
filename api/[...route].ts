import { Hono } from 'hono';

import { createApp } from '../backend/src/app.js';

const app = new Hono().route('/api', createApp());

export default app;
