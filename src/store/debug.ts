import { create } from 'zustand'

const MAX_DB   = 300
const MAX_LOGS = 200

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

export function logLevelIndex(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level)
}

export interface DbEntry {
  ts:    number
  label: string
  ms:    number
}

export interface LogEntry {
  ts:    number
  msg:   string
  level: LogLevel
}

interface DebugState {
  dbCalls: DbEntry[]
  logs:    LogEntry[]
  _recordDb: (label: string, ms: number) => void
  _addLog:   (msg: string, level: LogLevel) => void
}

export const useDebugStore = create<DebugState>(set => ({
  dbCalls: [],
  logs:    [],
  _recordDb: (label, ms) => set(s => ({
    dbCalls: [...s.dbCalls.slice(-(MAX_DB - 1)), { ts: Date.now(), label, ms }],
  })),
  _addLog: (msg, level) => set(s => ({
    logs: [...s.logs.slice(-(MAX_LOGS - 1)), { ts: Date.now(), msg, level }],
  })),
}))

export function recordDb(label: string, ms: number) {
  useDebugStore.getState()._recordDb(label, ms)
}

export function addLog(msg: string, level: LogLevel = 'debug') {
  useDebugStore.getState()._addLog(msg, level)
}
