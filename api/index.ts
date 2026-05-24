import { Hono } from 'hono';
import { handle } from 'hono/vercel';

import { createApp } from '../backend/src/app.js';

const app = new Hono().route('/api', createApp());

export default handle(app);
