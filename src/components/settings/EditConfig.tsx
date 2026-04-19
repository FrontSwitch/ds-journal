import { useState } from 'react'
import { useAppStore } from '../../store/app'
import {
  REGISTRY, ConfigLevel,
  getConfigValue, setConfigValue, isEntryVisible,
} from '../../config'
import { t, type StringKey } from '../../i18n'

const LEVEL_KEY_MAP: Record<number, StringKey> = {
  [ConfigLevel.Basic]:    'editConfig.levels.basic',
  [ConfigLevel.Normal]:   'editConfig.levels.normal',
  [ConfigLevel.Advanced]: 'editConfig.levels.advanced',
  [ConfigLevel.System]:   'editConfig.levels.system',
  [ConfigLevel.Restart]:  'editConfig.levels.restart',
}

interface Props {
  onClose: () => void
}

export default function EditConfig({ onClose }: Props) {
  const { config, setConfig } = useAppStore()
  const [filter, setFilter] = useState('')

  const currentLevel = config.ui.settingsLevel
  const q = filter.toLowerCase()

  const visible = REGISTRY.filter(entry => {
    if (!isEntryVisible(entry, currentLevel)) return false
    if (!q) return true
    return (
      entry.label.toLowerCase().includes(q) ||
      entry.path.includes(q) ||
      (entry.description?.toLowerCase().includes(q) ?? false)
    )
  })

  // Preserve group order from REGISTRY
  const groups: string[] = []
  for (const entry of visible) {
    if (!groups.includes(entry.group)) groups.push(entry.group)
  }

  function handleChange(path: string, value: unknown) {
    setConfig(setConfigValue(config, path, value))
  }

  return (
    <>
      <div className="editor-header">
        <span>{t('editConfig.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body single">
        <div className="editor-col">
          <input
            className="config-filter"
            placeholder={t('editConfig.filterPlaceholder')}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />

          {groups.map(group => {
            const groupEntry = visible.find(e => e.group === group)!
            return (
              <div key={group} className="config-group">
                <div className="config-group-label">{t(groupEntry.groupKey)}</div>
                {visible.filter(e => e.group === group).map(entry => {
                  const value = getConfigValue(config, entry.path)
                  return (
                    <div key={entry.path} className="config-entry">
                      <div className="config-entry-header">
                        <span className="config-entry-label">{t(entry.labelKey)}</span>
                        {q && (
                          <span className="config-entry-level">
                            {t(LEVEL_KEY_MAP[entry.level])}
                          </span>
                        )}
                      </div>
                      {entry.descKey && (
                        <p className="config-entry-desc">{t(entry.descKey)}</p>
                      )}
                      <div className="config-entry-input">
                        {entry.type === 'boolean' && (
                          <label className="config-bool-label">
                            <input
                              type="checkbox"
                              checked={value as boolean}
                              onChange={e => handleChange(entry.path, e.target.checked)}
                            />
                            {t('editConfig.enable')}
                          </label>
                        )}
                        {entry.type === 'number' && (
                          <input
                            type="number"
                            className="config-number-input"
                            value={value as number}
                            onChange={e => handleChange(entry.path, Number(e.target.value))}
                          />
                        )}
                        {entry.type === 'text' && (
                          <input
                            type="text"
                            className="config-number-input"
                            value={value as string}
                            onChange={e => handleChange(entry.path, e.target.value)}
                            spellCheck={false}
                          />
                        )}
                        {entry.type === 'select' && (
                          <select
                            className="config-select"
                            value={value as string | number}
                            onChange={e => {
                              const raw = e.target.value
                              handleChange(entry.path, isNaN(Number(raw)) ? raw : Number(raw))
                            }}
                          >
                            {entry.options?.map(opt => (
                              <option key={String(opt.value)} value={String(opt.value)}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      {entry.level === ConfigLevel.Restart && (
                        <p className="config-restart-warning">{t('editConfig.requiresRestart')}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {visible.length === 0 && (
            <p className="editor-placeholder">{t('editConfig.noMatch')}</p>
          )}
        </div>
      </div>
    </>
  )
}
