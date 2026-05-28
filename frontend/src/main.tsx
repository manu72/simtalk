import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';

import { App } from './App';
import './styles/tokens.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>
);
