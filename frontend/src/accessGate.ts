const STORAGE_KEY = 'simtalk:access-password';

export const getStoredPassword = (): string | null =>
  window.sessionStorage.getItem(STORAGE_KEY);

export const setStoredPassword = (value: string): void => {
  window.sessionStorage.setItem(STORAGE_KEY, value);
};

export const clearStoredPassword = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEY);
};

export class AccessDeniedError extends Error {
  constructor() {
    super('Access denied');
    this.name = 'AccessDeniedError';
  }
}
