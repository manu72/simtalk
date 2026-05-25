import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AccessDeniedError,
  clearStoredPassword,
  getStoredPassword,
  setStoredPassword
} from '../../../frontend/src/accessGate';

const STORAGE_KEY = 'simtalk:access-password';

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe('access gate storage', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredPassword()).toBeNull();
  });

  it('persists the password under the documented key', () => {
    setStoredPassword('hunter2');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('hunter2');
    expect(getStoredPassword()).toBe('hunter2');
  });

  it('clears the stored password', () => {
    setStoredPassword('hunter2');
    clearStoredPassword();
    expect(getStoredPassword()).toBeNull();
  });
});

describe('AccessDeniedError', () => {
  it('has a stable name for instanceof checks', () => {
    const error = new AccessDeniedError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AccessDeniedError');
  });
});
