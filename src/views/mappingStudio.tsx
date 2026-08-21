import { useMemo, useState } from 'react'
import type {
  MappingProfile,
  MappingRule,
  MappingSourceType,
  MappingTargetDomain,
} from '../data/mappingProfiles'
import {
  applyMappingProfile,
  canonicalFields,
  schemaFingerprint,
  suggestMappingRules,
} from '../engine/dynamicMapping'
import { useProjectRole } from '../hooks/useProjectRole'
import { useProjectStore } from '../store/projectStore'
import { parseCsvTable } from '../utils/workflow'

function valueMapText(rule: MappingRule): string {
  return Object.entries(rule.valueMap).map(([source, target]) => `${source}=${target}`).join('\n')
}

function parseValueMap(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const separator = line.indexOf('=')
        return separator > 0 ? [[line.slice(0, separator).trim(), line.slice(separator + 1).trim()]] : []
      }),
  )
}

export function MappingStudioView() {
  const { state, dispatch, currentUser } = useProjectStore()
  const { canEdit } = useProjectRole()
  const actor = currentUser?.name ?? 'Data steward'
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [domain, setDomain] = useState<MappingTargetDomain>('contractor_report')
  const [sourceType, setSourceType] = useState<MappingSourceType>('csv')
  const [organization, setOrganization] = useState('')
  const [name, setName] = useState('')
  const [dataset, setDataset] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rules, setRules] = useState<MappingRule[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const existing = editingId
    ? state.mappingProfiles.find((profile) => profile.id === editingId)
    : undefined
  const draftProfile = useMemo<MappingProfile | null>(() => {
    if (headers.length === 0 || rules.length === 0) return null
    const timestamp = new Date().toISOString()
    return {
      id: existing?.id ?? `MAP-${Date.now()}`,
      name: name.trim() || 'Untitled mapping',
      organization: organization.trim() || 'Unspecified organization',
      sourceType,
      targetDomain: domain,
      dataset: dataset.trim() || 'Unspecified dataset',
      version: existing ? existing.version + 1 : 1,
      status: 'draft',
      schemaFingerprint: schemaFingerprint(headers),
      sourceHeaders: headers,
      rules,
      createdAt: existing?.createdAt ?? timestamp,
      createdBy: existing?.createdBy ?? actor,
      updatedAt: timestamp,
      updatedBy: actor,
    }
  }, [actor, dataset, domain, existing, headers, name, organization, rules, sourceType])
  const preview = useMemo(
    () => (draftProfile ? applyMappingProfile(draftProfile, headers, rows.slice(0, 10)) : null),
    [draftProfile, headers, rows],
  )
  const missingRequired = canonicalFields[domain].filter(
    (field) =>
      field.required &&
      !rules.some(
        (rule) =>
          rule.targetField === field.field &&
          (rule.operation === 'constant' ? Boolean(rule.constant) : rule.sourceColumns.length > 0),
      ),
  )

  async function loadSample(file: File) {
    const table = parseCsvTable(await file.text())
    setHeaders(table.headers)
    setRows(table.rows)
    setRules(existing ? existing.rules : suggestMappingRules(table.headers, domain))
    setDataset(file.name)
    setMessage(`Detected ${table.headers.length} columns and ${table.rows.length} sample rows.`)
  }

  function changeDomain(next: MappingTargetDomain) {
    setDomain(next)
    if (headers.length > 0) setRules(suggestMappingRules(headers, next))
  }

  function loadProfile(profile: MappingProfile) {
    setEditingId(profile.id)
    setHeaders(profile.sourceHeaders)
    setRows([])
    setDomain(profile.targetDomain)
    setSourceType(profile.sourceType)
    setOrganization(profile.organization)
    setName(profile.name)
    setDataset(profile.dataset)
    setRules(profile.rules)
    setMessage(`Loaded ${profile.name} v${profile.version}. Upload a current sample to test schema drift.`)
  }

  function saveProfile() {
    if (!draftProfile || !canEdit) return
    if (missingRequired.length > 0) {
      setMessage(`Map required fields: ${missingRequired.map((field) => field.label).join(', ')}.`)
      return
    }
    dispatch({
      type: 'UPSERT_MAPPING_PROFILE',
      payload: { ...draftProfile, status: 'active' },
    })
    setMessage(`Saved ${draftProfile.name} v${draftProfile.version} as an active mapping profile.`)
    setEditingId(draftProfile.id)
  }

  return (
    <div className="view-stack" data-testid="mapping-studio-view">
      <div className="topbar">
        <div>
          <span className="eyebrow">Dynamic integration mapping</span>
          <h1>Mapping Studio</h1>
          <p className="muted">
            Map any company’s column names and coded values to a stable project-controls schema. Profiles are
            versioned, reusable across Snowflake/CSV/OCR/API sources, and warn when the source schema changes.
          </p>
        </div>
      </div>

      <section className="panel split-panel">
        <div>
          <span className="eyebrow">Source schema sample</span>
          <h2>Start with representative columns</h2>
          <div className="form-grid">
            <label className="field">
              <span>Organization</span>
              <input type="text" value={organization} onChange={(event) => setOrganization(event.target.value)} />
            </label>
            <label className="field">
              <span>Profile name</span>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>Source</span>
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value as MappingSourceType)}>
                <option value="snowflake">Snowflake</option>
                <option value="csv">CSV</option>
                <option value="excel">Excel export</option>
                <option value="ocr">OCR extraction</option>
                <option value="api">API</option>
              </select>
            </label>
            <label className="field">
              <span>Target domain</span>
              <select value={domain} onChange={(event) => changeDomain(event.target.value as MappingTargetDomain)}>
                <option value="contractor_report">Contractor report values</option>
                <option value="cost_transaction">Cost transactions / Snowflake</option>
                <option value="schedule_activity">Schedule activities</option>
              </select>
            </label>
          </div>
          <label className="file-drop mapping-sample-upload">
            <input
              accept=".csv,text/csv"
              className="hidden-file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void loadSample(file)
                event.target.value = ''
              }}
              type="file"
              data-testid="mapping-sample-file"
            />
            <strong>Choose sample CSV</strong>
            <span>Use exported headers/sample rows; no production credentials are required.</span>
          </label>
          {message && <p className="upload-message">{message}</p>}
        </div>
        <div className="format-card">
          <h3>Supported safe operations</h3>
          <ul>
            <li>Direct, first-non-empty, concatenated, or constant values</li>
            <li>Trim, upper/lowercase, number, and ISO-date conversion</li>
            <li>Company code → canonical value lookup tables</li>
            <li>Required-field validation and schema-fingerprint drift warning</li>
            <li>No arbitrary scripts or SQL expressions in mappings</li>
          </ul>
        </div>
      </section>

      {headers.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Field mapping</span>
              <h3>{headers.length} source columns → {canonicalFields[domain].length} canonical fields</h3>
            </div>
            <span className={`badge ${missingRequired.length > 0 ? 'badge-risk' : 'badge-good'}`}>
              {missingRequired.length > 0 ? `${missingRequired.length} required missing` : 'Required fields mapped'}
            </span>
          </div>
          <div className="mapping-rule-grid">
            {rules.map((rule) => {
              const field = canonicalFields[domain].find((entry) => entry.field === rule.targetField)
              return (
                <article className="mapping-rule-card" key={rule.id}>
                  <div>
                    <strong>{field?.label ?? rule.targetField}{rule.required ? ' *' : ''}</strong>
                    <small>{rule.targetField}</small>
                  </div>
                  <label className="field">
                    <span>Operation</span>
                    <select
                      value={rule.operation}
                      onChange={(event) =>
                        setRules((current) =>
                          current.map((entry) =>
                            entry.id === rule.id
                              ? { ...entry, operation: event.target.value as MappingRule['operation'] }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="direct">Direct column</option>
                      <option value="coalesce">First non-empty</option>
                      <option value="concat">Concatenate</option>
                      <option value="constant">Constant</option>
                    </select>
                  </label>
                  {rule.operation === 'constant' ? (
                    <label className="field">
                      <span>Constant</span>
                      <input
                        type="text"
                        value={rule.constant ?? ''}
                        onChange={(event) =>
                          setRules((current) =>
                            current.map((entry) =>
                              entry.id === rule.id ? { ...entry, constant: event.target.value } : entry,
                            ),
                          )
                        }
                      />
                    </label>
                  ) : (
                    <label className="field">
                      <span>Source column</span>
                      <select
                        value={rule.sourceColumns[0] ?? ''}
                        onChange={(event) =>
                          setRules((current) =>
                            current.map((entry) =>
                              entry.id === rule.id
                                ? { ...entry, sourceColumns: event.target.value ? [event.target.value] : [] }
                                : entry,
                            ),
                          )
                        }
                      >
                        <option value="">Not mapped</option>
                        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="field">
                    <span>Transform</span>
                    <select
                      value={rule.transforms.at(-1) ?? 'trim'}
                      onChange={(event) =>
                        setRules((current) =>
                          current.map((entry) =>
                            entry.id === rule.id
                              ? { ...entry, transforms: ['trim', event.target.value as MappingRule['transforms'][number]].filter((value, index, all) => all.indexOf(value) === index) }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="trim">Trim</option>
                      <option value="uppercase">Uppercase</option>
                      <option value="lowercase">Lowercase</option>
                      <option value="number">Number</option>
                      <option value="date_iso">ISO date</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Value lookup (one source=target per line)</span>
                    <textarea
                      rows={3}
                      value={valueMapText(rule)}
                      onChange={(event) =>
                        setRules((current) =>
                          current.map((entry) =>
                            entry.id === rule.id ? { ...entry, valueMap: parseValueMap(event.target.value) } : entry,
                          ),
                        )
                      }
                    />
                  </label>
                </article>
              )
            })}
          </div>
          <div className="panel-actions">
            <button className="primary-button" disabled={!canEdit || missingRequired.length > 0} onClick={saveProfile} type="button" data-testid="save-mapping-profile">
              Save active profile
            </button>
          </div>
        </section>
      )}

      {preview && rows.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Mapped preview</span><h3>Canonical output before ingestion</h3></div>
            <span className={`badge ${preview.issues.some((issue) => issue.severity === 'error') ? 'badge-risk' : preview.schemaChanged ? 'badge-watch' : 'badge-good'}`}>
              {preview.issues.length} issue(s)
            </span>
          </div>
          <div className="table-wrap">
            <table data-testid="mapping-preview-table">
              <thead><tr>{rules.map((rule) => <th key={rule.id}>{rule.targetField}</th>)}</tr></thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, index) => (
                  <tr key={index}>{rules.map((rule) => <td key={rule.id}>{row[rule.targetField] || '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div><span className="eyebrow">Profile library</span><h3>Reusable company and dataset mappings</h3></div>
          <span className="badge badge-good">{state.mappingProfiles.length} profiles</span>
        </div>
        <div className="report-list">
          {state.mappingProfiles.length === 0 ? (
            <p className="empty-state">No saved profiles yet.</p>
          ) : (
            state.mappingProfiles.map((profile) => (
              <article className="report-card" key={profile.id}>
                <div>
                  <span className="eyebrow">{profile.organization} · {profile.sourceType}</span>
                  <h4>{profile.name}</h4>
                  <p>{profile.dataset} · {profile.targetDomain.replace('_', ' ')}</p>
                </div>
                <div className="report-meta">
                  <span className="badge badge-good">{profile.status}</span>
                  <strong>v{profile.version}</strong>
                  <button className="ghost-button" type="button" onClick={() => loadProfile(profile)}>Open</button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
