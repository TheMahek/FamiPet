// "My Applications" — the current user's adoption requests with live status
// (Pending / Approved / Rejected / Withdrawn), persisted via GET /adoptions/my.
// A Pending request can be withdrawn (DELETE /adoptions/my/:id sets it to
// Withdrawn so it stays visible history — the pet is not deleted or re-listed
// on withdraw). Approved requests surface the owner's acceptance message;
// Rejected requests surface the reason the admin chose.
//
// Uses the same modal-backdrop/modal-sheet language as AdoptionModal so the
// two dialogs read as one page.

import { useCallback, useEffect, useState } from 'react'
import { getMyAdoptions, withdrawAdoption, type Adoption } from '../../../api/adoptions'
import { Icon } from '../../../components/shared/Icon'

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  Pending: { label: 'Pending', className: 'app-status-pending' },
  Approved: { label: 'Approved', className: 'app-status-approved' },
  Rejected: { label: 'Rejected', className: 'app-status-rejected' },
  Withdrawn: { label: 'Withdrawn', className: 'app-status-withdrawn' },
}

export function MyApplications({ reloadKey }: { reloadKey?: number }) {
  const [apps, setApps] = useState<Adoption[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [withdrawing, setWithdrawing] = useState<Adoption | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setFailed(false)
    getMyAdoptions()
      .then((res) => setApps(res.adoptions || []))
      .catch(() => setFailed(true))
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [reloadKey])

  const confirmWithdraw = () => {
    if (!withdrawing) return
    setSaving(true)
    setError('')
    withdrawAdoption(withdrawing._id)
      .then(() => {
        setWithdrawing(null)
        setSaving(false)
        load()
      })
      .catch((err) => {
        setError((err instanceof Error && err.message) || 'Could not withdraw the application.')
        setSaving(false)
      })
  }

  if (failed) {
    return (
      <div className="my-applications" style={{ textAlign: 'center', padding: '2rem' }}>
        <Icon name="triangle-exclamation" style={{ fontSize: 28 }} />
        <p style={{ marginTop: 8 }}>Could not load your adoption applications.</p>
        <button type="button" className="retry-btn" onClick={load}>
          Retry
        </button>
      </div>
    )
  }

  if (apps === null) {
    return (
      <div className="my-applications" style={{ textAlign: 'center', padding: '2rem' }}>
        <Icon name="circle-notch" spin />
        <span style={{ marginLeft: 8 }}>Loading your applications...</span>
      </div>
    )
  }

  if (apps.length === 0) {
    return null
  }

  return (
    <section className="my-applications">
      <div className="my-applications-head">
        <h2>
          <Icon name="note-sticky" /> My Adoption Applications
        </h2>
        <p>Track and manage your adoption requests.</p>
      </div>

      <div className="my-applications-list">
        {apps.map((app) => {
          const pill = STATUS_PILL[app.status || 'Pending'] || STATUS_PILL.Pending
          return (
            <div key={app._id} className="my-app-card">
              {app.pet && app.pet.images && app.pet.images[0] ? (
                <img className="my-app-pic" src={app.pet.images[0]} alt={app.pet?.name || 'Pet'} />
              ) : (
                <div className="my-app-pic my-app-pic-fallback">
                  <Icon name="paw" />
                </div>
              )}

              <div className="my-app-body">
                <div className="my-app-title">
                  <strong>{app.pet?.name || 'Pet'}</strong>
                  <span className={`app-status-pill ${pill.className}`}>{pill.label}</span>
                </div>

                <div className="my-app-meta">
                  Applied {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : ''}
                  {app.status === 'Approved' && app.acceptanceMessage && (
                    <p className="my-app-note my-app-note-approved">
                      <strong>Acceptance:</strong> {app.acceptanceMessage}
                    </p>
                  )}
                  {app.status === 'Rejected' && app.rejectionReason && (
                    <p className="my-app-note my-app-note-rejected">
                      <strong>Reason:</strong> {app.rejectionReason}
                    </p>
                  )}
                </div>

                {app.status === 'Pending' && (
                  <button type="button" className="withdraw-btn" onClick={() => setWithdrawing(app)}>
                    <Icon name="trash-can" /> Withdraw
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {withdrawing && (
        <div
          className="modal-backdrop open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setWithdrawing(null)
          }}
        >
          <div className="modal-sheet">
            <h2 className="adoption-modal-title">Withdraw Application?</h2>
            <p className="adoption-success-text">
              Your adoption request for <strong>{withdrawing.pet?.name || 'this pet'}</strong> will be marked as
              withdrawn. You can apply again later.
            </p>

            {error && (
              <p className="adoption-form-error">
                <Icon name="triangle-exclamation" /> {error}
              </p>
            )}

            <div className="adoption-form-actions">
              <button type="button" className="adoption-cancel-btn" disabled={saving} onClick={() => setWithdrawing(null)}>
                Cancel
              </button>
              <button type="button" className="adoption-submit-btn" disabled={saving} onClick={confirmWithdraw}>
                <Icon name="check" />
                {saving ? 'Withdrawing...' : 'Confirm Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}