import { vi } from 'vitest'

export const convertFileSrc = (path: string) => `asset://${path}`

// vi.fn() so individual tests can override with mockResolvedValueOnce / mockResolvedValue
export const invoke = vi.fn().mockResolvedValue(null)
