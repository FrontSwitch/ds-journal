import { useState } from 'react'
import { isTauri } from '../../native/platform'
import { t } from '../../i18n'
import { parseSPData, previewSP, runSPImport, type SPData, type SPPreview, type SPImportResult } from '../../lib/importSP'
import { parsePKData, previewPK, runPKImport, type PKData, type PKPreview, type PKImportResult } from '../../lib/importPK'

type Source = 'sp' | 'pk'
type Phase = 'setup' | 'ready' | 'importing' | 'done'

interface Props { onClose: () => void }

export default function Import({ onClose }: Props) {
  const [source, setSource] = useState<Source>('sp')
  const [fileName, setFileName] = useState<string | null>(null)
  const [spData, setSpData] = useState<SPData | null>(null)
  const [pkData, setPkData] = useState<PKData | null>(null)
  const [spPreview, setSpPreview] = useState<SPPreview | null>(null)
  const [pkPreview, setPkPreview] = useState<PKPreview | null>(null)
  const [phase, setPhase] = useState<Phase>('setup')
  const [parseError, setParseError] = useState<string | null>(null)

  // SP options
  const [skipMembers,       setSkipMembers]       = useState(false)
  const [skipGroups,        setSkipGroups]         = useState(false)
  const [skipChannels,      setSkipChannels]       = useState(false)
  const [skipMessages,      setSkipMessages]       = useState(false)
  const [skipFront,         setSkipFront]          = useState(false)
  const [skipNotes,         setSkipNotes]          = useState(false)
  const [skipBoard,         setSkipBoard]          = useState(false)
  const [importCustomFronts, setImportCustomFronts] = useState(false)

  // PK options
  const [pkSkipMembers,  setPkSkipMembers]  = useState(false)
  const [pkSkipGroups,   setPkSkipGroups]   = useState(false)
  const [pkSkipSwitches, setPkSkipSwitches] = useState(false)

  const [result, setResult]   = useState<SPImportResult | PKImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  async function pickFile() {
    if (!isTauri()) return
    setParseError(null)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!picked) return
      const filePath = typeof picked === 'string' ? picked : (picked as { path: string }).path

      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const text = await readTextFile(filePath)
      const raw = JSON.parse(text)

      const name = filePath.split('/').pop() ?? filePath
      setFileName(name)

      if (source === 'sp') {
        const data = parseSPData(raw)
        setSpData(data)
        setSpPreview(previewSP(data))
        setPkData(null); setPkPreview(null)
      } else {
        const data = parsePKData(raw)
        setPkData(data)
        setPkPreview(previewPK(data))
        setSpData(null); setSpPreview(null)
      }
      setPhase('ready')
    } catch (e) {
      setParseError(String(e))
      setPhase('setup')
    }
  }

  async function handleImport() {
    setPhase('importing')
    setImportError(null)
    try {
      if (source === 'sp' && spData) {
        const r = await runSPImport(spData, {
          dryRun: false,
          skipMembers, skipGroups, skipChannels, skipMessages,
          skipFront, skipNotes, skipBoard, importCustomFronts,
        })
        setResult(r)
      } else if (source === 'pk' && pkData) {
        const r = await runPKImport(pkData, {
          dryRun: false,
          skipMembers: pkSkipMembers,
          skipGroups: pkSkipGroups,
          skipSwitches: pkSkipSwitches,
        })
        setResult(r)
      }
      setPhase('done')
    } catch (e) {
      setImportError(String(e))
      setPhase('ready')
    }
  }

  function handleSourceChange(s: Source) {
    setSource(s)
    setFileName(null)
    setSpData(null); setSpPreview(null)
    setPkData(null); setPkPreview(null)
    setPhase('setup')
    setParseError(null)
    setResult(null)
    setImportError(null)
  }

  const spResult = result && source === 'sp' ? result as SPImportResult : null
  const pkResult = result && source === 'pk' ? result as PKImportResult : null

  return (
    <div>
      <div className="editor-header">
        <span>{t('settings.import')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body single">
        <div className="editor-col" style={{ gap: 16, maxWidth: 500 }}>

          {/* Source selector */}
          <div>
            <div className="settings-section-title" style={{ marginBottom: 8 }}>{t('import.source')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={source === 'sp' ? 'save-btn' : 'cancel-btn'}
                onClick={() => handleSourceChange('sp')}
                style={{ flex: 1 }}
              >
                {t('import.simplyPlural')}
              </button>
              <button
                className={source === 'pk' ? 'save-btn' : 'cancel-btn'}
                onClick={() => handleSourceChange('pk')}
                style={{ flex: 1 }}
              >
                {t('import.pluralKit')}
              </button>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {source === 'sp' ? t('import.spHint') : t('import.pkHint')}
            </p>
          </div>

          {/* File picker */}
          <div>
            <div className="settings-section-title" style={{ marginBottom: 8 }}>{t('import.selectFile')}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="save-btn" onClick={pickFile} disabled={phase === 'importing'}>
                {t('import.browse')}
              </button>
              {fileName && <span className="muted" style={{ fontSize: 13, wordBreak: 'break-all' }}>{fileName}</span>}
            </div>
            {parseError && <p className="muted" style={{ color: '#f38ba8', marginTop: 6 }}>{parseError}</p>}
          </div>

          {/* Preview */}
          {source === 'sp' && spPreview && (
            <div>
              <div className="settings-section-title" style={{ marginBottom: 6 }}>{t('import.contents')}</div>
              <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {([
                    [t('import.labelMembers'),      spPreview.members],
                    [t('import.labelCustomFronts'), spPreview.customFronts],
                    [t('import.labelGroups'),       spPreview.groups],
                    [t('import.labelFolders'),      spPreview.categories],
                    [t('import.labelChannels'),     spPreview.channels],
                    [t('import.labelMessages'),     spPreview.messages],
                    [t('import.labelFrontHistory'), spPreview.frontHistory],
                    [t('import.labelNotes'),        spPreview.notes],
                    [t('import.labelBoardPosts'),   spPreview.board],
                  ] as [string, number][]).map(([label, count]) => (
                    <tr key={label}>
                      <td className="muted" style={{ padding: '2px 0', paddingRight: 16 }}>{label}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {source === 'pk' && pkPreview && (
            <div>
              <div className="settings-section-title" style={{ marginBottom: 6 }}>{t('import.contents')}</div>
              <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {([
                    [t('import.labelMembers'),  pkPreview.members],
                    [t('import.labelGroups'),   pkPreview.groups],
                    [t('import.labelSwitches'), pkPreview.switches],
                  ] as [string, number][]).map(([label, count]) => (
                    <tr key={label}>
                      <td className="muted" style={{ padding: '2px 0', paddingRight: 16 }}>{label}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Options */}
          {phase === 'ready' && source === 'sp' && (
            <div>
              <div className="settings-section-title" style={{ marginBottom: 8 }}>{t('import.skipSection')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {([
                  [t('import.labelMembers'),      skipMembers,  setSkipMembers],
                  [t('import.labelGroups'),        skipGroups,   setSkipGroups],
                  [t('import.labelChannels'),      skipChannels, setSkipChannels],
                  [t('import.labelMessages'),      skipMessages, setSkipMessages],
                  [t('import.labelFrontHistory'),  skipFront,    setSkipFront],
                  [t('import.labelNotes'),         skipNotes,    setSkipNotes],
                  [t('import.labelBoardPosts'),    skipBoard,    setSkipBoard],
                ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
                  <label key={label} className="field-label checkbox-label">
                    <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                    {t('import.skipLabel', { label })}
                  </label>
                ))}
                <label className="field-label checkbox-label">
                  <input type="checkbox" checked={importCustomFronts} onChange={e => setImportCustomFronts(e.target.checked)} />
                  {t('import.importCustomFronts')}
                </label>
              </div>
            </div>
          )}

          {phase === 'ready' && source === 'pk' && (
            <div>
              <div className="settings-section-title" style={{ marginBottom: 8 }}>{t('import.skipSection')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {([
                  [t('import.labelMembers'),  pkSkipMembers,  setPkSkipMembers],
                  [t('import.labelGroups'),   pkSkipGroups,   setPkSkipGroups],
                  [t('import.labelSwitches'), pkSkipSwitches, setPkSkipSwitches],
                ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
                  <label key={label} className="field-label checkbox-label">
                    <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                    {t('import.skipLabel', { label })}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Import note */}
          {phase === 'ready' && (
            <p className="muted" style={{ color: '#f38ba8', fontStyle: 'normal' }}>
              {t('import.skipNote')}
            </p>
          )}

          {/* Import button */}
          {phase === 'ready' && (
            <button className="save-btn" onClick={handleImport} style={{ alignSelf: 'flex-start' }}>
              {t('import.importBtn')}
            </button>
          )}

          {phase === 'importing' && (
            <p className="muted">{t('import.importing')}</p>
          )}

          {importError && (
            <p className="muted" style={{ color: '#f38ba8', fontStyle: 'normal' }}>{importError}</p>
          )}

          {/* Results */}
          {phase === 'done' && spResult && (
            <div>
              <div className="settings-section-title" style={{ marginBottom: 6 }}>{t('import.importComplete')}</div>
              <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {([
                    [t('import.resultAvatars'),      spResult.avatars],
                    [t('import.resultGroups'),        spResult.groups],
                    [t('import.resultFolders'),       spResult.folders],
                    [t('import.resultChannels'),      spResult.channels],
                    [t('import.resultMessages'),      spResult.messages],
                    [t('import.resultFrontHistory'),  spResult.frontHistory],
                    [t('import.resultNotes'),         spResult.notes],
                    [t('import.resultBoard'),         spResult.board],
                  ] as [string, number][]).map(([label, count]) => (
                    <tr key={label}>
                      <td className="muted" style={{ padding: '2px 0', paddingRight: 16 }}>{label}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {spResult.warnings.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="settings-section-title" style={{ marginBottom: 4 }}>{t('import.warnings')}</div>
                  {spResult.warnings.map((w, i) => (
                    <p key={i} className="muted" style={{ fontSize: 12, color: '#f9e2af' }}>{w}</p>
                  ))}
                </div>
              )}
              <p className="muted" style={{ marginTop: 8 }}>{t('import.reloadNote')}</p>
            </div>
          )}

          {phase === 'done' && pkResult && (
            <div>
              <div className="settings-section-title" style={{ marginBottom: 6 }}>{t('import.importComplete')}</div>
              <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {([
                    [t('import.resultAvatars'),  pkResult.avatars],
                    [t('import.resultGroups'),   pkResult.groups],
                    [t('import.resultSwitches'), pkResult.switches],
                  ] as [string, number][]).map(([label, count]) => (
                    <tr key={label}>
                      <td className="muted" style={{ padding: '2px 0', paddingRight: 16 }}>{label}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pkResult.warnings.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="settings-section-title" style={{ marginBottom: 4 }}>{t('import.warnings')}</div>
                  {pkResult.warnings.map((w, i) => (
                    <p key={i} className="muted" style={{ fontSize: 12, color: '#f9e2af' }}>{w}</p>
                  ))}
                </div>
              )}
              <p className="muted" style={{ marginTop: 8 }}>{t('import.reloadNote')}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
