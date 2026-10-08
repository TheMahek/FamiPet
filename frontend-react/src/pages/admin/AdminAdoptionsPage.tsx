// Admin Adoptions — parity with frontend/admin/adoptions.html +
// js/admin-adoptions.js: review every adoption request (`GET /adoptions`) and
// approve/reject pending ones (`PUT /adoptions/:id`). The backend enforces
// `adminOnly`; approving also marks the pet adopted server-side; rejecting
// REQUIRES a reason (400 otherwise) and approving stores an acceptance message
// (the backend substitutes a generic one when none is given). Rows for
// reviewed requests surface those stored notes so staff can see the outcome.

import { useEffect, useState } from 'react'
import { getAllAdoptions, updateAdoptionStatus, type Adoption } from '../../api/adoptions'
import { Icon } from '../../components/shared/Icon'
import { AdminTableEmpty, AdminTopbar } from './AdminTopbar'

type ReviewTarget = { a: Adoption; kind: 'Approved' | 'Rejected' }

export function AdminAdoptionsPage() {
  const [adoptions, setAdoptions] = useState<Adoption[] | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const [target, setTarget] = useState<ReviewTarget | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = () => {
    setError('')
    getAllAdoptions()
      .then((res) => setAdoptions(res.adoptions || []))
      .catch((err) => {
        setAdoptions([])
        setError((err instanceof Error && err.message) || 'Could not load requests.')
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), 3000)
    return () => clearTimeout(t)
  }, [message])

  const openReview = (a: Adoption, kind: ReviewTarget['kind']) => {
    setTarget({ a, kind })
    setNote('')
    setFormError('')
  }

  const submitReview = async () => {
    if (!target) return
    const bodyNote = note.trim()
    if (target.kind === 'Rejected' && !bodyNote) {
      setFormError('A rejection reason is required.')
      return
    }
    setSaving(true)
    try {
      const res = await updateAdoptionStatus(target.a._id, target.kind, bodyNote || undefined)
      setIsError(false)
      setMessage(res.message || `Request ${target.kind.toLowerCase()}.`)
      setTarget(null)
      setSaving(false)
      load()
    } catch (err) {
      setIsError(true)
      setFormError((err instanceof Error && err.message) || 'Could not update the request.')
      setSaving(false)
    }
  }

  const statusPill = (s?: string) => {
    if (s === 'Approved') return ['pill green', 'Approved'] as const
    if (s === 'Rejected') return ['pill red', 'Rejected'] as const
    if (s === 'Withdrawn') return ['pill gray', 'Withdrawn'] as const
    return ['pill amber', 'Pending'] as const
  }

  const noteFor = (a: Adoption, label: string) => {
    const text = a.status === 'Approved' ? a.acceptanceMessage : a.status === 'Rejected' ? a.rejectionReason : ''
    if (!text) return null
    return (
      <div className="admin-review-note">
        <strong>{label}:</strong> {text}
      </div>
    )
  }

  return (
    <>
      <AdminTopbar title="Adoption Requests" subtitle="Review and approve/reject adoption applications." />

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Pet</th>
                <th>Applicant</th>
                <th>Contact</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adoptions === null && !error ? (
                <tr>
                  <td colSpan={6} className="admin-loading">
                    Loading requests...
                  </td>
                </tr>
              ) : error ? (
                <AdminTableEmpty icon="triangle-exclamation" message={error} colSpan={6} />
              ) : !(adoptions || []).length ? (
                <AdminTableEmpty icon="heart" message="No adoption requests yet." colSpan={6} />
              ) : (
                (adoptions || []).map((a) => {
                  const [cls, label] = statusPill(a.status)
                  const pending = String(a.status) === 'Pending'
                  const applicantUser = a.user && typeof a.user === 'object' ? a.user.name : ''
                  return (
                    <tr key={a._id}>
                      <td>
                        <strong>{(a.pet && a.pet.name) || 'Unknown Pet'}</strong>
                      </td>
                      <td>
                        <strong>{a.fullName}</strong>
                        <div className="admin-muted">{applicantUser}</div>
                      </td>
                      <td>
                        <div>{a.phone || '—'}</div>
                        <div className="admin-muted">
                          {a.user && typeof a.user === 'object' ? a.user.email || '' : ''}
                        </div>
                      </td>
                      <td className="admin-reason">{a.reasonForAdoption}</td>
                      <td>
                        <span className={cls}>{label}</span>
                        {!pending && noteFor(a, 'Note')}
                      </td>
                      <td>
                        {pending ? (
                          <>
                            <button
                              type="button"
                              className="admin-btn-sm btn-approve"
                              onClick={() => openReview(a, 'Approved')}
                            >
                              Approve
                            </button>{' '}
                            <button
                              type="button"
                              className="admin-btn-sm btn-reject"
                              onClick={() => openReview(a, 'Rejected')}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="admin-muted">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {target && (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setTarget(null)
          }}
        >
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label={`${target.kind} adoption request`}>
            <h3>
              {target.kind === 'Approved' ? (
                <>
                  <Icon name="circle-check" /> Approve this adoption request?
                </>
              ) : (
                <>
                  <Icon name="circle-xmark" /> Reject this adoption request?
                </>
              )}
            </h3>
            <p className="admin-modal-sub">
              <strong>{(target.a.pet && target.a.pet.name) || 'Unknown Pet'}</strong> — applicant{' '}
              <strong>{target.a.fullName}</strong>
            </p>

            <label className="admin-modal-field">
              <span>{target.kind === 'Approved' ? 'Acceptance message (optional)' : 'Rejection reason (required)'} *</span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  target.kind === 'Approved'
                    ? 'Leave blank to send the default acceptance message.'
                    : 'Explain why this application is not accepted...'
                }
              />
            </label>

            {formError && (
              <p className="admin-modal-error">
                <Icon name="triangle-exclamation" /> {formError}
              </p>
            )}

            <div className="admin-modal-actions">
              <button type="button" className="admin-btn-sm" disabled={saving} onClick={() => setTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`admin-btn-sm ${target.kind === 'Approved' ? 'btn-approve' : 'btn-reject'}`}
                disabled={saving}
                onClick={() => void submitReview()}
              >
                {saving ? 'Saving...' : target.kind === 'Approved' ? 'Confirm Approve' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`admin-toast${isError ? ' error' : ''}`}>
          <i>
            <Icon name={isError ? 'triangle-exclamation' : 'circle-check'} />
          </i>
          <span>{message}</span>
        </div>
      )}
    </>
  )
}