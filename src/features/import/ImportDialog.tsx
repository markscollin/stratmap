import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Upload, FileSpreadsheet, Download, AlertTriangle, AlertCircle, Check } from 'lucide-react'
import {
  IMPORT_FIELDS, MAX_IMPORT_ROWS, buildImportPlan, buildTemplateCsv, guessMapping,
  type ColumnMapping, type ImportField, type ParsedSheet,
} from '../../lib/importOrg'
import { readSheetFile, SheetFileError } from '../../lib/readSheetFile'
import { useBillingStore } from '../../store/billingStore'
import { useChartStore } from '../../store/chartStore'
import { useToastStore } from '../../store/toastStore'
import { useChartLimit } from '../../hooks/useChartLimit'
import { api, ApiError } from '../../lib/apiClient'
import { NODE_W } from '../nodes/nodeSize'
import type { Department, OrgNode } from '../../types'

// Roadmap 2.1: import people from a CSV or Excel file.
//   1. Choose a file (and, from a chart, where it goes).
//   2. Map columns, with a best guess filled in.
//   3. Review: a dry run. Nothing is written until the user confirms, and any
//      problem in the file blocks the import (the user fixes the file and retries).

type Step = 'file' | 'map' | 'review'
type Target = 'append' | 'new'

export interface ImportDialogProps {
  onClose: () => void
  /** Set when opened from a chart: offers "add to this chart" as well as "new chart". */
  chart?: { id: string; name: string; nodes: OrgNode[]; departments: Department[] }
  /** Called after roles were added to `chart`, so the canvas can reload. */
  onImported?: () => void
}

const MAX_ISSUES_SHOWN = 40
const GAP_X = 160 // space between the existing tree and an appended one

export function ImportDialog({ onClose, chart, onImported }: ImportDialogProps) {
  const navigate = useNavigate()
  const maxNodes = useBillingStore(s => s.plan.maxNodesPerChart)
  const createChart = useChartStore(s => s.createChart)
  const addToast = useToastStore(s => s.addToast)
  const chartLimit = useChartLimit()

  const [step, setStep] = useState<Step>('file')
  const [fileName, setFileName] = useState('')
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [targetChoice, setTarget] = useState<Target>(chart ? 'append' : 'new')
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  // A new chart needs room under the plan's chart limit; adding to this one does not.
  const newChartBlocked = chartLimit.atLimit
  const target: Target = chart && newChartBlocked && targetChoice === 'new' ? 'append' : targetChoice

  async function handleFile(file: File | undefined) {
    if (!file) return
    setFileError(null)
    setReading(true)
    try {
      const parsed = await readSheetFile(file)
      setSheet(parsed)
      setFileName(file.name)
      setNewName(file.name.replace(/\.[^.]+$/, '') || 'Imported chart')
      setMapping(guessMapping(parsed.headers))
      setStep('map')
    } catch (err) {
      setFileError(err instanceof SheetFileError ? err.message : 'This file could not be read.')
    } finally {
      setReading(false)
    }
  }

  // Appended people go to the right of what's already on the chart.
  const origin = useMemo(() => {
    if (!chart || target !== 'append' || chart.nodes.length === 0) return undefined
    return { x: Math.max(...chart.nodes.map(n => n.x)) + NODE_W + GAP_X, y: Math.min(...chart.nodes.map(n => n.y)) }
  }, [chart, target])

  const plan = useMemo(() => {
    if (!sheet || !mapping) return null
    const appending = !!chart && target === 'append'
    return buildImportPlan(sheet, mapping, {
      maxNodes,
      existingNodeCount: appending ? chart.nodes.length : 0,
      existingDepartments: appending ? chart.departments : [],
      origin,
    })
  }, [sheet, mapping, chart, target, maxNodes, origin])

  const canCreateNew = target === 'new' ? !newChartBlocked && newName.trim().length > 0 : true
  const canImport = !!plan && !plan.blocked && plan.stats.imported > 0 && canCreateNew && !submitting

  async function runImport() {
    if (!plan || !canImport) return
    setSubmitting(true)
    setServerError(null)
    try {
      if (chart && target === 'append') {
        await api.post(`/api/charts/${chart.id}/import`, { nodes: plan.nodes, edges: plan.edges, departments: plan.departments })
        addToast(`Added ${plan.stats.imported} role${plan.stats.imported === 1 ? '' : 's'} to ${chart.name}.`, 'success')
        onImported?.()
        onClose()
      } else {
        const created = await createChart(newName.trim(), plan.nodes, plan.edges, plan.departments)
        if (!created) {
          // chartStore already toasted the reason (plan limit, permission, …).
          setServerError('The chart could not be created. Check the message above and try again.')
          setSubmitting(false)
          return
        }
        addToast(`Imported ${plan.stats.imported} role${plan.stats.imported === 1 ? '' : 's'} into "${created.name}".`, 'success')
        onClose()
        navigate(`/charts/${created.id}`)
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.userMessage : 'Something went wrong. Nothing was imported.')
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Import people"
      onClick={() => { if (!submitting) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border-hover)', padding: 28, width: 620, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.3px' }}>Import people</h2>
          <button aria-label="Close" onClick={onClose} disabled={submitting} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>
        <Steps step={step} />

        {step === 'file' && (
          <FileStep
            reading={reading} error={fileError} inputRef={fileInput}
            onFile={f => void handleFile(f)}
          />
        )}

        {step === 'map' && sheet && mapping && (
          <MapStep
            sheet={sheet} fileName={fileName} mapping={mapping} onChange={setMapping}
            chart={chart} target={target} onTarget={setTarget} newChartBlocked={newChartBlocked}
            onBack={() => setStep('file')} onNext={() => setStep('review')}
          />
        )}

        {step === 'review' && plan && (
          <ReviewStep
            plan={plan} chart={chart} target={target} maxNodes={maxNodes}
            newName={newName} onNewName={setNewName} newChartBlocked={newChartBlocked && target === 'new'}
            serverError={serverError} submitting={submitting} canImport={canImport}
            onUpgrade={() => { onClose(); navigate('/pricing') }}
            onBack={() => setStep('map')} onImport={() => void runImport()}
          />
        )}
      </div>
    </div>
  )
}

// ─── Steps ───────────────────────────────────────────────────────────────────

function Steps({ step }: { step: Step }) {
  const items: { id: Step; label: string }[] = [
    { id: 'file', label: '1. File' }, { id: 'map', label: '2. Columns' }, { id: 'review', label: '3. Review' },
  ]
  const at = items.findIndex(i => i.id === step)
  return (
    <ol style={{ display: 'flex', gap: 14, listStyle: 'none', padding: 0, margin: '0 0 20px', fontSize: 12 }}>
      {items.map((it, i) => (
        <li key={it.id} aria-current={i === at ? 'step' : undefined}
          style={{ color: i === at ? 'var(--brand)' : i < at ? 'var(--text)' : 'var(--dim)', fontWeight: i === at ? 700 : 500 }}>
          {it.label}
        </li>
      ))}
    </ol>
  )
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'stratmap-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function FileStep({ reading, error, inputRef, onFile }: {
  reading: boolean; error: string | null
  inputRef: React.RefObject<HTMLInputElement | null>; onFile: (f: File | undefined) => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>
        Upload a CSV or Excel (.xlsx) file with one row per role. You'll pick the columns next and review everything before anything is added.
        The file is read in your browser.
      </p>
      <div
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]) }}
        style={{ border: `2px dashed ${over ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 14, padding: '34px 16px', textAlign: 'center', background: over ? 'var(--brand-bg)' : 'transparent' }}
      >
        <Upload size={22} color="var(--muted)" />
        <p style={{ fontSize: 14, color: 'var(--text)', margin: '8px 0 12px' }}>{reading ? 'Reading…' : 'Drop a file here, or'}</p>
        <button
          onClick={() => inputRef.current?.click()} disabled={reading}
          style={{ padding: '8px 16px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >Choose file</button>
        <input
          ref={inputRef} type="file" data-testid="import-file" aria-label="Import file"
          accept=".csv,.tsv,.txt,.xlsx,text/csv" style={{ display: 'none' }}
          onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }}
        />
        <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 12 }}>.csv or .xlsx · up to 5 MB · up to {MAX_IMPORT_ROWS.toLocaleString()} rows</p>
      </div>
      {error && <p role="alert" style={{ ...errorBox, marginTop: 14 }}>{error}</p>}
      <button onClick={downloadTemplate} style={{ ...linkBtn, marginTop: 16 }}>
        <Download size={13} /> Download a template
      </button>
    </div>
  )
}

function MapStep({ sheet, fileName, mapping, onChange, chart, target, onTarget, newChartBlocked, onBack, onNext }: {
  sheet: ParsedSheet; fileName: string; mapping: ColumnMapping; onChange: (m: ColumnMapping) => void
  chart: ImportDialogProps['chart']; target: Target; onTarget: (t: Target) => void; newChartBlocked: boolean
  onBack: () => void; onNext: () => void
}) {
  const ok = mapping.name !== null || mapping.title !== null
  const sample = (col: number) =>
    sheet.rows.map(r => r[col]).filter(v => v && v.trim()).slice(0, 2).join(' · ')

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileSpreadsheet size={14} /> {fileName} · {sheet.rows.length.toLocaleString()} row{sheet.rows.length === 1 ? '' : 's'}
      </p>

      {chart && (
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <legend style={{ fontSize: 12, color: 'var(--muted)', padding: '0 6px' }}>Where should these roles go?</legend>
          <label style={radioRow}>
            <input type="radio" name="import-target" checked={target === 'append'} onChange={() => onTarget('append')} />
            Add to this chart ({chart.name})
          </label>
          <label style={{ ...radioRow, opacity: newChartBlocked ? 0.55 : 1 }}>
            <input type="radio" name="import-target" checked={target === 'new'} disabled={newChartBlocked} onChange={() => onTarget('new')} />
            Create a new chart
            {newChartBlocked && <span style={{ fontSize: 11, color: 'var(--dim)' }}> (your plan's chart limit is reached)</span>}
          </label>
        </fieldset>
      )}

      <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>
        Match your columns. A row needs a <strong>name</strong> or a <strong>title</strong>; leave the name blank for a role you haven't filled yet.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 12px', alignItems: 'start' }}>
        {IMPORT_FIELDS.map(f => (
          <FieldRow
            key={f.field} field={f.field} label={f.label} hint={f.hint}
            value={mapping[f.field]} headers={sheet.headers} sample={sample}
            onChange={v => onChange({ ...mapping, [f.field]: v })}
          />
        ))}
      </div>
      {!ok && <p role="alert" style={{ ...errorBox, marginTop: 14 }}>Choose a Name column or a Title column to continue.</p>}

      <Footer>
        <button onClick={onBack} style={secondaryBtn}>Back</button>
        <button onClick={onNext} disabled={!ok} style={{ ...primaryBtn, flex: 2, opacity: ok ? 1 : 0.5, cursor: ok ? 'pointer' : 'default' }}>Review</button>
      </Footer>
    </div>
  )
}

function FieldRow({ field, label, hint, value, headers, sample, onChange }: {
  field: ImportField; label: string; hint: string; value: number | null; headers: string[]
  sample: (col: number) => string; onChange: (v: number | null) => void
}) {
  const id = `map-${field}`
  return (
    <>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', paddingTop: 7 }}>{label}</label>
      <div>
        <select
          id={id} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          style={{ width: '100%', padding: '7px 10px', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
        >
          <option value="">— not in my file —</option>
          {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
        </select>
        <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 3 }}>
          {value !== null && sample(value) ? `e.g. ${sample(value)}` : hint}
        </p>
      </div>
    </>
  )
}

function ReviewStep({ plan, chart, target, maxNodes, newName, onNewName, newChartBlocked, serverError, submitting, canImport, onUpgrade, onBack, onImport }: {
  plan: ReturnType<typeof buildImportPlan>; chart: ImportDialogProps['chart']; target: Target; maxNodes: number
  newName: string; onNewName: (v: string) => void; newChartBlocked: boolean
  serverError: string | null; submitting: boolean; canImport: boolean
  onUpgrade: () => void; onBack: () => void; onImport: () => void
}) {
  const { stats } = plan
  const errors = plan.issues.filter(i => i.severity === 'error')
  const warnings = plan.issues.filter(i => i.severity === 'warning')
  const shown = [...errors, ...warnings].slice(0, MAX_ISSUES_SHOWN)
  const hidden = errors.length + warnings.length - shown.length
  const appending = !!chart && target === 'append'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Stat label={appending ? 'Roles to add' : 'Roles'} value={stats.imported} testId="stat-imported" />
        <Stat label="Open roles" value={stats.vacant} />
        <Stat label="Top-level" value={stats.roots} />
        <Stat label="Departments" value={stats.departments} note={stats.newDepartments !== stats.departments ? `${stats.newDepartments} new` : undefined} />
        {stats.skipped > 0 && <Stat label="Skipped rows" value={stats.skipped} />}
      </div>

      {!plan.blocked && stats.imported > 0 && (
        <p style={{ ...okBox, marginBottom: 12 }}>
          <Check size={14} /> No problems found.{' '}
          {appending
            ? `${stats.imported} role${stats.imported === 1 ? '' : 's'} will be added next to the existing chart.`
            : 'These roles will be laid out into a new chart.'}
        </p>
      )}
      {plan.overLimit && (
        <div role="alert" style={{ ...errorBox, marginBottom: 12 }}>
          <strong>Over your plan's limit.</strong> Your plan allows {maxNodes} roles per chart; this would make {plan.overLimit.wouldHave}.
          Nothing is imported until it fits.{' '}
          <button onClick={onUpgrade} style={{ ...linkBtn, display: 'inline', textDecoration: 'underline' }}>See plans</button>
        </div>
      )}

      {shown.length > 0 && (
        <ul aria-label="Problems found" style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', maxHeight: 190, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
          {shown.map((i, idx) => (
            <li key={idx} style={{ display: 'flex', gap: 8, padding: '7px 10px', fontSize: 12, borderTop: idx ? '1px solid var(--border)' : 'none', color: 'var(--text)' }}>
              {i.severity === 'error'
                ? <AlertCircle size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                : <AlertTriangle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />}
              <span><strong>{i.row ? `Row ${i.row}` : 'File'}</strong> · {i.message}</span>
            </li>
          ))}
          {hidden > 0 && <li style={{ padding: '7px 10px', fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>…and {hidden} more.</li>}
        </ul>
      )}
      {errors.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Fix the errors in your file and upload it again, or go back and change the column choices.
        </p>
      )}

      {!plan.blocked && <Outline plan={plan} />}

      {!appending && (
        <div style={{ margin: '14px 0' }}>
          <label htmlFor="import-chart-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>New chart name</label>
          <input
            id="import-chart-name" value={newName} onChange={e => onNewName(e.target.value)} maxLength={200}
            style={{ width: '100%', padding: '8px 10px', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }}
          />
          {newChartBlocked && <p role="alert" style={{ ...errorBox, marginTop: 8 }}>Your plan's chart limit is reached, so a new chart can't be created. Open a chart and import into it instead, or upgrade.</p>}
        </div>
      )}

      {serverError && <p role="alert" style={{ ...errorBox, marginBottom: 12 }}>{serverError}</p>}

      <Footer>
        <button onClick={onBack} disabled={submitting} style={secondaryBtn}>Back</button>
        <button onClick={onImport} disabled={!canImport} style={{ ...primaryBtn, flex: 2, opacity: canImport ? 1 : 0.5, cursor: canImport ? 'pointer' : 'default' }}>
          {submitting ? 'Importing…' : `Import ${stats.imported} role${stats.imported === 1 ? '' : 's'}`}
        </button>
      </Footer>
    </div>
  )
}

/** A short indented outline of the reporting tree, so mistakes are easy to spot. */
function Outline({ plan }: { plan: ReturnType<typeof buildImportPlan> }) {
  const LIMIT = 14
  const lines = useMemo(() => {
    const kids = new Map<string | null, OrgNode[]>()
    for (const n of plan.nodes) kids.set(n.managerId, [...(kids.get(n.managerId) ?? []), n])
    const out: { node: OrgNode; depth: number }[] = []
    const walk = (parent: string | null, depth: number) => {
      for (const n of kids.get(parent) ?? []) {
        if (out.length > LIMIT) return
        out.push({ node: n, depth })
        walk(n.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [plan.nodes])
  if (lines.length === 0) return null
  return (
    <div aria-label="Preview of the reporting tree" style={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Preview</p>
      {lines.slice(0, LIMIT).map(({ node, depth }) => (
        <div key={node.id} style={{ paddingLeft: depth * 16, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.status === 'open' || node.status === 'backfill' ? <em>{node.title}</em> : node.name}
          <span style={{ color: 'var(--muted)' }}> · {node.status === 'open' || node.status === 'backfill' ? (node.status === 'open' ? 'open role' : 'backfill') : node.title}</span>
        </div>
      ))}
      {lines.length > LIMIT && <div style={{ color: 'var(--muted)', paddingTop: 2 }}>…and {plan.nodes.length - LIMIT} more</div>}
    </div>
  )
}

function Stat({ label, value, note, testId }: { label: string; value: number; note?: string; testId?: string }) {
  return (
    <div style={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
      <div data-testid={testId} style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}{note ? ` · ${note}` : ''}</div>
    </div>
  )
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>{children}</div>
}

const primaryBtn: React.CSSProperties = { padding: '11px', background: 'var(--grad-brand)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, boxShadow: '0 4px 14px var(--brand-glow)' }
const secondaryBtn: React.CSSProperties = { flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }
const linkBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }
const radioRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', padding: '4px 0' }
const errorBox: React.CSSProperties = { padding: '10px 12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, fontSize: 13, lineHeight: 1.5 }
const okBox: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--success-bg, var(--raised))', color: 'var(--success)', borderRadius: 10, fontSize: 13 }
