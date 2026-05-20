import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the Phase 1 product shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'SimTalk' })).toBeInTheDocument();
    expect(screen.getByText(/Speak naturally. Hear instantly./i)).toBeInTheDocument();
  });

  it('exposes all conversation modes as keyboard-accessible buttons', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /Prepare Listener Mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prepare Turn-about Mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prepare Practice Mode/i })).toBeInTheDocument();
  });

  it('communicates that recording starts disabled', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /Recording is off by default/i })).toBeInTheDocument();
  });
});
