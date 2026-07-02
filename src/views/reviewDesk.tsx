import { useMemo, useState } from 'react'
import { BufferedNumberInput } from '../components/BufferedInput'
import type { ApprovalStatus, ExtractedValue, ReviewStatus } from '../data/projectData'
import { resetExtractionForCorrection } from '../engine/extractionIntegrity'
import { resolveSccsForExtraction } from '../engine/sccs'
import { useProjectRole } from '../hooks/useProjectRole'
import { useProjectStore } from '../store/projectStore'
import { canApproveValue } from '../utils/workflow'
import {
  approvalLabels,
  confidenceClass,
  formatValue,
  statusClass,
  statusLabels,
} from './extractionShared'

export function ReviewDesk() {
  const { state, dispatch } = useProjectStore()
  const { canEdit } = useProjectRole()
  const values = state.values
  const selectedValueId = state.selectedValueId

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ExtractedValue['category'] | 'all'>('all')
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus | 'all'>('all')

  const selectedValue = values.find((value) => value.id === selectedValueId) ?? values[0]

  function setValues(next: (current: ExtractedValue[]) => ExtractedValue[]) {
    dispatch({ type: 'SET_VALUES', payload: next(values) })
  }

  function onSelect(id: string) {
    dispatch({ type: 'SET_SELECTED_VALUE', payload: id })
  }

  function updateReviewState(id: string, reviewStatus: ReviewStatus, approvalStatus: ApprovalStatus) {
    setValues((current) =>
      current.map((value) =>
        value.id === id && (approvalStatus !== 'approved' || canApproveValue(value))
          ? {
              ...value,
              reviewStatus,
              approvalStatus,
              reviewer: 'You',
            }
          : value,
      ),
    )
  }

  function updateNormalizedValue(id: string, nextValue: number) {
    if (!Number.isFinite(nextValue)) {
      return
    }

    setValues((current) =>
      current.map((value) =>
        value.id === id
          ? {
              ...resetExtractionForCorrection(value),
              normalizedValue: nextValue,
              sccs: resolveSccsForExtraction(value),
            }
          : value,
      ),
    )
  }

  function recordCorrection(id: string) {
    setValues((current) =>
      current.map((value) =>
        value.id === id
          ? {
              ...resetExtractionForCorrection(value),
              reviewer: 'You',
              correctionHistory: [
                {
                  at: new Date().toLocaleString(),
                  by: 'You',
                  from: value.rawValue,
                  to: formatValue(value),
                  reason: 'Manual reviewer correction in MVP prototype.',
                },
                ...value.correctionHistory,
              ],
            }
          : value,
      ),
    )
  }

  function approveCleanValues(ids: string[]) {
    const approvedAt = new Date().toLocaleString()

    setValues((current) =>
      current.map((value) =>
        ids.includes(value.id) && canApproveValue(value) && value.validationIssues.length === 0
          ? {
              ...value,
              reviewStatus: 'approved',
              approvalStatus: 'approved',
              reviewer: 'You',
              correctionHistory: [
                {
                  at: approvedAt,
                  by: 'You',
                  from: value.rawValue,
                  to: formatValue(value),
                  reason: 'Bulk-approved clean value with no validation issues.',
                },
                ...value.correctionHistory,
              ],
            }
          : value,
      ),
    )
  }

  const categories = Array.from(new Set(values.map((value) => value.category)))
  const filteredValues = useMemo(
    () =>
      values.filter((value) => {
        const haystack = [
          value.field,
          value.owner,
          value.wbs,
          value.cbs,
          value.standardMapping,
          value.source.document,
          value.period,
        ]
          .join(' ')
          .toLowerCase()
        const matchesSearch = haystack.includes(search.trim().toLowerCase())
        const matchesCategory = categoryFilter === 'all' || value.category === categoryFilter
        const matchesReview = reviewFilter === 'all' || value.reviewStatus === reviewFilter

        return matchesSearch && matchesCategory && matchesReview
      }),
    [categoryFilter, reviewFilter, search, values],
  )
  const cleanApprovalIds = filteredValues
    .filter((value) => value.validationIssues.length === 0 && value.approvalStatus !== 'approved')
    .map((value) => value.id)

  if (!selectedValue) {
    return (
      <section className="panel">
        <span className="eyebrow">Human review desk</span>
        <h3>No extracted values available</h3>
        <p className="empty-state">Upload a CSV report from the ingestion workspace to create review items.</p>
      </section>
    )
  }

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Human review desk</span>
            <h3>Correct and approve extracted project-controls values</h3>
          </div>
          <div className="hero-actions">
            <span className="badge badge-watch">{filteredValues.length} visible</span>
            <button
              className="ghost-button"
              disabled={cleanApprovalIds.length === 0 || !canEdit}
              title={canEdit ? undefined : 'Requires cost controller role'}
              onClick={() => approveCleanValues(cleanApprovalIds)}
              type="button"
            >
              Bulk approve clean values
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <label>
            <span>Search</span>
            <input
              className="filter-input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Field, owner, WBS, source..."
              type="search"
              value={search}
            />
          </label>
          <label>
            <span>Category</span>
            <select
              className="select-input"
              onChange={(event) => setCategoryFilter(event.target.value as ExtractedValue['category'] | 'all')}
              value={categoryFilter}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Review state</span>
            <select
              className="select-input"
              onChange={(event) => setReviewFilter(event.target.value as ReviewStatus | 'all')}
              value={reviewFilter}
            >
              <option value="all">All review states</option>
              <option value="pending_review">Pending review</option>
              <option value="needs_correction">Needs correction</option>
              <option value="approved">Approved</option>
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Normalized value</th>
                <th>Mapping</th>
                <th>SCCS</th>
                <th>Confidence</th>
                <th>Review</th>
                <th>Approval</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredValues.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <p className="empty-state">No extracted values match the current filters.</p>
                  </td>
                </tr>
              ) : (
                filteredValues.map((value) => {
                  const approvalBlocked = !canApproveValue(value) || !canEdit

                  return (
                    <tr className={selectedValueId === value.id ? 'selected-row' : ''} key={value.id}>
                      <td>
                        <button className="link-button" onClick={() => onSelect(value.id)} type="button">
                          {value.field}
                        </button>
                        <small>{value.owner} · {value.category}</small>
                      </td>
                      <td>
                        <BufferedNumberInput
                          aria-label={`Normalized value for ${value.field}`}
                          className="value-input"
                          disabled={!canEdit}
                          value={value.normalizedValue}
                          onCommit={(next) => updateNormalizedValue(value.id, next)}
                        />
                        <small>{value.unit}</small>
                      </td>
                      <td>
                        <strong>{value.wbs}</strong>
                        <small>{value.cbs} · {value.standardMapping}</small>
                      </td>
                      <td>
                        <code className="sccs-inline-code">{value.sccs?.composite ?? resolveSccsForExtraction(value).composite}</code>
                        {value.applied && <small className="muted"> · posted</small>}
                      </td>
                      <td>
                        <div className="confidence">
                          <span>{Math.round(value.confidence * 100)}%</span>
                          <div className="confidence-track">
                            <div
                              className={`confidence-fill ${confidenceClass(value.confidence)}`}
                              style={{ width: `${value.confidence * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${statusClass(value.reviewStatus)}`}>
                          {statusLabels[value.reviewStatus]}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${statusClass(value.approvalStatus)}`}>
                          {approvalLabels[value.approvalStatus]}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="small-button"
                            disabled={approvalBlocked}
                            onClick={() => updateReviewState(value.id, 'approved', 'approved')}
                            title={
                              !canEdit
                                ? 'Requires cost controller role'
                                : approvalBlocked
                                  ? 'Resolve critical validation issues before approval.'
                                  : 'Approve value'
                            }
                            type="button"
                          >
                            Approve
                          </button>
                          <button
                            className="small-button secondary"
                            disabled={!canEdit}
                            title={canEdit ? undefined : 'Requires cost controller role'}
                            onClick={() => updateReviewState(value.id, 'needs_correction', 'rejected')}
                            type="button"
                          >
                            Flag
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <span className="eyebrow">Selected value</span>
          <h3>{selectedValue.field}</h3>
          <dl className="detail-list">
            <div>
              <dt>Raw value</dt>
              <dd>{selectedValue.rawValue}</dd>
            </div>
            <div>
              <dt>Normalized value</dt>
              <dd>{formatValue(selectedValue)}</dd>
            </div>
            <div>
              <dt>Mapped WBS / CBS</dt>
              <dd>{selectedValue.wbs} / {selectedValue.cbs}</dd>
            </div>
            <div>
              <dt>Reviewer</dt>
              <dd>{selectedValue.reviewer}</dd>
            </div>
          </dl>
          <button
            className="ghost-button"
            disabled={!canEdit}
            title={canEdit ? undefined : 'Requires cost controller role'}
            onClick={() => recordCorrection(selectedValue.id)}
            type="button"
          >
            Record correction note
          </button>
        </div>

        <div className="panel">
          <span className="eyebrow">Validation issues</span>
          <h3>What blocks approval</h3>
          {!canApproveValue(selectedValue) && (
            <div className="notice-card risk">
              Resolve critical validation issues before this value can be approved.
            </div>
          )}
          {selectedValue.validationIssues.length === 0 ? (
            <p className="empty-state">No validation issues are attached to this value.</p>
          ) : (
            <div className="risk-list">
              {selectedValue.validationIssues.map((issue) => (
                <article className="risk-item" key={`${selectedValue.id}-${issue.message}`}>
                  <span className={`badge badge-${issue.severity === 'critical' ? 'risk' : 'watch'}`}>{issue.severity}</span>
                  <p>{issue.message}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
