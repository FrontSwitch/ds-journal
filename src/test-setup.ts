import '@testing-library/jest-dom'

// Simple in-memory localStorage for tests
const store: Record<string, string> = {}
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { for (const k in store) delete store[k] },
  get length() { return Object.keys(store).length },
  key: (i: number) => Object.keys(store)[i] ?? null,
}
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: false })
