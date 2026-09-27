// Phase 20 Settings — React port of frontend/pages/settings.html +
// frontend/js/settings.js.
//
// Deltas from the Vanilla page (documented in migration.md):
// - All displayed values come from the real backend (AGENTS §5): profile fields
//   + account summary (role / joined / pet count) from GET /auth/me, appointment
//   count from GET /appointments, "Your Pets" list from the populated `pets`
//   array. Vanilla showed hardcoded "Mahek Shaikh", "2 Pets", Buddy/Whiskers.
// - Email is a read-only field: PUT /auth/profile only accepts
//   name/phone/address/city/avatar, so an editable email would silently not
//   persist (Vanilla bug — the email was never sent). Read-only avoids implying
//   a change happens.
// - Dark Mode preference is wired to the real theme system (useTheme) instead
//   of Vanilla's disabled "Coming soon" toggle.
// - Danger Zone "Delete Account" is dropped: there is no self-delete backend
//   endpoint, and the Vanilla button only cleared localStorage client-side
//   without deleting the account, so "permanently delete" would be fake.
// - "Push Notifications" was a localStorage-only preference that did nothing
//   (AGENTS §5). It now drives the real Web Push subscription: enable asks the
//   browser for permission and POSTs the subscription to the backend, disable
//   unsubscribes and DELETEs it, and the toggle reflects the real device/server
//   state (unsupported browser, insecure context, blocked permission or an
//   unconfigured server are all reported instead of pretending to be on).
// - No notification bell here: the single app-level bell lives in AppLayout and
//   reads the centralized NotificationProvider.

import { useEffect, useRef, useState, type ChangeEvent, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { changePassword, updateProfile, uploadAvatar } from '../../../api/settings'
import { getMe, type AuthUser } from '../../../api/auth'
import { normalizeUser } from '../../../api/client'
import { getAppointments } from '../../../api/appointments'
import { deletePushSubscription, savePushSubscription } from '../../../api/notifications'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushState,
  type PushState,
} from '../../../api/push'
import { getMyPets, type Pet } from '../../../api/pets'
import { useAuth } from '../../../hooks/useAuth'
import { useTheme } from '../../../hooks/useTheme'
import { Icon } from '../../../components/shared/Icon'
import { ageText, breedName, petImage } from '../../../lib/formatters'
import { getErrorMessage } from '../../../lib/errors'

const DEFAULT_AVATAR = '/assets/images/dashboard/user-profile.svg'

// A real avatar can be a server URL or a data URL; the bundled placeholder SVG
// is never a user's actual avatar (thinking of the Vanilla bug that stored the
// placeholder in the DB for every account that saved without a photo).
function realAvatar(value: string | null | undefined): string {
  if (value && !String(value).includes('user-profile.svg')) return value
  return DEFAULT_AVATAR
}

export function SettingsPage() {
  const { user: authUser, setUser } = useAuth()
  const { theme, toggle } = useTheme()

  /* ---------------- LOADED STATE ---------------- */

  const [loadFailed, setLoadFailed] = useState(false)
  const [profile, setProfile] = useState<AuthUser | null>(() => authUser)
  const [pets, setPets] = useState<Pet[]>([])
  const [apptCount, setApptCount] = useState<number | null>(null)

  /* ---------------- PUSH NOTIFICATIONS (real Web Push) ---------------- */

  // null = not resolved yet, so the toggle is disabled rather than briefly
  // showing "off" for a device that is actually subscribed.
  const [pushState, setPushState] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')

  /* ---------------- PROFILE FORM ---------------- */

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileBtnSaved, setProfileBtnSaved] = useState(false)
  const [profileError, setProfileError] = useState('')

  const nameRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  /* ---------------- PASSWORD FORM ---------------- */

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdVisible, setPwdVisible] = useState<Record<string, boolean>>({})
  const [pwdUpdating, setPwdUpdating] = useState(false)
  const [pwdBtnSaved, setPwdBtnSaved] = useState(false)
  const [pwdMsgs, setPwdMsgs] = useState<Record<string, string | null>>({})

  const currentPwdRef = useRef<HTMLInputElement>(null)
  const newPwdRef = useRef<HTMLInputElement>(null)
  const confirmPwdRef = useRef<HTMLInputElement>(null)

  /* ---------------- PREFERENCES (localStorage — Vanilla parity) ---------------- */

  // 'push' is deliberately NOT here: it is real device state, not a stored
  // preference (see the push block above).
  const prefKeys = ['email', 'appointments'] as const
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const saved: Record<string, boolean> = {}
    prefKeys.forEach((k) => {
      const stored = localStorage.getItem('annSetting_' + k)
      saved[k] = stored === null ? true : stored === 'true'
    })
    return saved
  })

  const setPref = (k: (typeof prefKeys)[number], value: boolean) => {
    setPrefs((p) => ({ ...p, [k]: value }))
    localStorage.setItem('annSetting_' + k, String(value))
  }

  /* ---------------- LOAD ---------------- */

  const fillFields = (u: AuthUser) => {
    setName(u.name || '')
    setEmail(u.email || '')
    setPhone(u.phone || '')
    setLocation(u.city || u.address || '')
    setAvatarUrl(realAvatar(u.avatar))
    setAvatarFile(null)
  }

  const load = () => {
    setLoadFailed(false)
    Promise.all([getMe(), getAppointments(), getMyPets()])
      .then(([meRes, apptRes, petsRes]) => {
        const u = meRes.user as AuthUser | undefined
        if (u) {
          fillFields(u)
          setProfile(u)
        } else if (authUser) {
          fillFields(authUser)
        }
        const scheduled = (apptRes.appointments || []).filter((a) => a.status === 'scheduled').length
        setApptCount(scheduled)
        setPets(petsRes.pets || [])
      })
      .catch(() => {
        if (authUser) {
          fillFields(authUser)
        } else {
          setLoadFailed(true)
        }
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  // Read the real push state on mount. This never prompts: `getPushState`
  // only inspects support/permission/subscription.
  useEffect(() => {
    let cancelled = false
    getPushState()
      .then((state) => {
        if (!cancelled) setPushState(state)
      })
      .catch(() => {
        if (!cancelled) setPushState('off')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const PUSH_LABELS: Record<PushState, string> = {
    unsupported: 'This browser does not support push notifications.',
    insecure: 'Push notifications need a secure connection (https, or localhost).',
    denied: 'Notifications are blocked for this site. Re-enable them in your browser settings.',
    off: 'Get alerts on this device when something happens with your pets.',
    on: 'This device will receive push alerts. Turn off to stop them.',
  }

  const onPushToggle = async () => {
    if (pushBusy) return
    setPushBusy(true)
    setPushMessage('')
    try {
      if (pushState === 'on') {
        const result = await disablePushNotifications()
        if (result.ok) {
          // Drop the server record too, so a stale endpoint is not kept alive
          // and counted as a delivery failure.
          if (result.endpoint) await deletePushSubscription(result.endpoint).catch(() => {})
          setPushState('off')
        } else {
          setPushMessage(result.reason)
          setPushState(await getPushState())
        }
        return
      }

      const result = await enablePushNotifications()
      if (!result.ok || !result.subscription) {
        setPushMessage(result.reason)
        setPushState(result.state || (await getPushState()))
        return
      }
      await savePushSubscription(result.subscription)
      setPushState('on')
    } catch (error) {
      setPushMessage(getErrorMessage(error) || 'Could not update push notifications.')
      setPushState(await getPushState().catch((): PushState => 'off'))
    } finally {
      setPushBusy(false)
    }
  }

  /* ---------------- PROFILE SAVE ---------------- */

  const onAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      e.target.value = ''
      return
    }
    setAvatarFile(file)
    setAvatarUrl(URL.createObjectURL(file))
  }

  const saveProfile = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      nameRef.current?.focus()
      return
    }
    setProfileSaving(true)
    setProfileSaved(false)
    setProfileError('')
    try {
      let avatar = avatarUrl
      if (avatarFile) {
        const up = await uploadAvatar(avatarFile)
        avatar = up.avatar || avatar
        setAvatarFile(null)
      }
      // The default placeholder must never be persisted as the user's avatar
      // (Vanilla bug) — only real uploaded/server avatars are saved.
      const persistedAvatar =
        avatar.startsWith('data:') || avatar.includes('user-profile.svg') ? '' : avatar
      const res = await updateProfile({
        name: trimmedName,
        phone: phone.trim(),
        address: '',
        city: location.trim(),
        avatar: persistedAvatar,
      })
      const u = res.user
      if (u) {
        // PUT /auth/profile echoes the raw user doc (`_id`); persist a
        // normalized user so `.id` stays available to other consumers.
        const normalized = normalizeUser(u as Parameters<typeof normalizeUser>[0])
        setUser((normalized || (u as AuthUser)) as AuthUser)
        setAvatarUrl(realAvatar((u.avatar as string) || persistedAvatar))
      }
      setProfileSaved(true)
      setProfileBtnSaved(true)
      setTimeout(() => setProfileBtnSaved(false), 1500)
    } catch (err) {
      setProfileError(getErrorMessage(err, 'Could not save profile. Please try again.'))
    } finally {
      setProfileSaving(false)
    }
  }

  /* ---------------- PASSWORD SAVE ---------------- */

  const setPwdMsg = (field: string, text: string | null) =>
    setPwdMsgs((m) => ({ ...m, [field]: text }))

  const updatePassword = async () => {
    if (!currentPassword) {
      currentPwdRef.current?.focus()
      return
    }
    if (!newPassword) {
      newPwdRef.current?.focus()
      return
    }
    if (newPassword.length < 6) {
      setPwdMsg('general', 'New password must be at least 6 characters.')
      setPwdMsg('ok', null)
      newPwdRef.current?.focus()
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg('general', 'Passwords do not match.')
      setPwdMsg('ok', null)
      confirmPwdRef.current?.focus()
      return
    }
    setPwdUpdating(true)
    setPwdMsg('general', null)
    setPwdMsg('ok', null)
    try {
      await changePassword(currentPassword, newPassword)
      setPwdMsg('ok', 'Password updated successfully.')
      setPwdBtnSaved(true)
      setTimeout(() => setPwdBtnSaved(false), 1500)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPwdMsg('general', getErrorMessage(err, 'Could not update password. Please try again.'))
    } finally {
      setPwdUpdating(false)
    }
  }

  /* ---------------- RENDER HELPERS ---------------- */

  const cardTitle = (icon: string, title: string, subtitle: string, extra = '') => (
    <div className="settings-card-title">
      <div className={`settings-icon${extra ? ' ' + extra : ''}`}>
        <Icon name={icon} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  )

  const smallCardHeading = (icon: string, title: string, extra = '') => (
    <div className="small-card-heading">
      <div className={`settings-icon${extra ? ' ' + extra : ''}`}>
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
    </div>
  )

  const inputRow = (
    label: string,
    nameAttr: string,
    type: string,
    value: string,
    onChange: (v: string) => void,
    ref?: Ref<HTMLInputElement>,
    readOnly?: boolean,
    placeholder?: string,
  ) => (
    <div className="form-group">
      <label htmlFor={nameAttr}>{label}</label>
      <input
        ref={ref}
        id={nameAttr}
        name={nameAttr}
        type={type}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        aria-readonly={readOnly}
        disabled={readOnly}
        autoComplete={type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'off'}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )

  const toggleRow = (
    icon: string,
    title: string,
    subtitle: string,
    checked: boolean,
    onToggle: () => void,
    disabled = false,
  ) => (
    <div className="preference-row">
      <div className="preference-icon">
        <Icon name={icon} />
      </div>
      <div className="preference-content">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          aria-label={title}
        />
        <span className="toggle-slider" />
      </label>
    </div>
  )

  const eyeBtn = (label: string, field: 'current' | 'new' | 'confirm') => (
    <button
      type="button"
      className="password-eye"
      aria-label={pwdVisible[field] ? `Hide ${label}` : `Show ${label}`}
      onClick={() => setPwdVisible((v) => ({ ...v, [field]: !v[field] }))}
    >
      <Icon name={pwdVisible[field] ? 'eye-slash' : 'eye'} />
    </button>
  )

  if (loadFailed && !profile) {
    return (
      <div className="settings-page">
        <div className="settings-state">
          <Icon name="triangle-exclamation" style={{ fontSize: 28 }} />
          <div style={{ marginTop: 8 }}>Could not load your account settings.</div>
          <button type="button" className="retry-btn" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const roleLabel = profile?.role === 'admin' ? 'Admin' : 'Pet Parent'
  const joinedDate = profile?.createdAt
    ? new Date(profile.createdAt as string).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

  return (
    <div className="settings-page">
      {/* ================= HEADER ================= */}
      <header className="page-header">
        <div className="header-title">
          <h1>
            Settings
            <span className="settings-title-icon">
              <Icon name="settings" />
            </span>
          </h1>
          <p>Manage your account, pets, preferences and app settings.</p>
        </div>

        <div className="header-actions">
          <Link className="settings-back-btn" to="/app/dashboard">
            <Icon name="arrow-left" />
            Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="settings-layout">
        {/* ================= LEFT COLUMN ================= */}
        <div className="settings-left">
          {/* --- PROFILE INFORMATION --- */}
          <section className="settings-card">
            {cardTitle('user', 'Profile Information', 'Update your personal details and profile picture.')}

            <div className="profile-settings-body">
              <div className="settings-profile-photo">
                <div className="settings-avatar-wrapper">
                  <img
                    id="settingsProfileImage"
                    src={avatarUrl}
                    alt="Profile picture"
                    onError={(e) => {
                      const img = e.currentTarget
                      if (img.src !== window.location.origin + DEFAULT_AVATAR) {
                        img.src = DEFAULT_AVATAR
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="change-photo-btn"
                    title="Change profile picture"
                    aria-label="Change profile picture"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Icon name="camera" />
                  </button>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  id="profileImageInput"
                  accept="image/*"
                  aria-label="Profile picture file"
                  hidden
                  onChange={onAvatarChange}
                />
                <span>Profile Picture</span>
                <small>JPG, PNG or WEBP</small>
              </div>

              <div className="profile-form">
                <div className="form-row">
                  {inputRow('Full Name', 'fullName', 'text', name, setName, nameRef)}
                  {inputRow('Email Address', 'email', 'email', email, setEmail, undefined, true)}
                </div>
                <div className="form-row">
                  {inputRow('Phone Number', 'phone', 'tel', phone, setPhone, undefined, false, '+1 555 000 0000')}
                  {inputRow('Location', 'location', 'text', location, setLocation, undefined, false, 'City, Country')}
                </div>

                {profileError && (
                  <div className="form-feedback error" role="alert">
                    <Icon name="triangle-exclamation" />
                    {profileError}
                  </div>
                )}
                {profileSaved && (
                  <div className="form-feedback ok" role="status">
                    <Icon name="circle-check" />
                    Profile saved.
                  </div>
                )}

                <div className="form-button-row">
                  <button
                    type="button"
                    className="purple-btn"
                    onClick={saveProfile}
                    disabled={profileSaving}
                  >
                    {profileSaving ? (
                      <>
                        <Icon name="loading" spin />
                        Saving...
                      </>
                    ) : profileBtnSaved ? (
                      <>
                        <Icon name="check" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Icon name="save" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* --- PREFERENCES --- */}
          <section className="settings-card">
            {cardTitle('sliders-horizontal', 'Preferences', 'Customize your app experience.')}

            <div className="preferences-list">
              {toggleRow(
                'envelope',
                'Email Notifications',
                'Receive updates about appointments, reminders and community activity.',
                prefs.email,
                () => setPref('email', !prefs.email),
              )}
              {toggleRow(
                'bell',
                'Push Notifications',
                pushState === null
                  ? 'Checking this device…'
                  : PUSH_LABELS[pushState] +
                    (pushMessage ? ` ${pushMessage}` : ''),
                pushState === 'on',
                onPushToggle,
                pushBusy || pushState === null || pushState === 'unsupported' || pushState === 'insecure',
              )}
              {toggleRow(
                'calendar-check',
                'Appointment Reminders',
                'Receive reminders before scheduled appointments.',
                prefs.appointments,
                () => setPref('appointments', !prefs.appointments),
              )}
              {toggleRow(
                'moon',
                'Dark Mode',
                theme === 'dark' ? 'Toggle light theme.' : 'Switch to dark theme.',
                theme === 'dark',
                toggle,
              )}
            </div>
          </section>

          {/* --- SECURITY --- */}
          <section className="settings-card">
            {cardTitle('shield-check', 'Security', 'Manage your password and account security.')}

            <div className="security-form">
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <div className="password-input">
                  <input
                    ref={currentPwdRef}
                    id="currentPassword"
                    type={pwdVisible.current ? 'text' : 'password'}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  {eyeBtn('current password', 'current')}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <div className="password-input">
                    <input
                      ref={newPwdRef}
                      id="newPassword"
                      type={pwdVisible.new ? 'text' : 'password'}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    {eyeBtn('new password', 'new')}
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm New Password</label>
                  <div className="password-input">
                    <input
                      ref={confirmPwdRef}
                      id="confirmPassword"
                      type={pwdVisible.confirm ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    {eyeBtn('confirm new password', 'confirm')}
                  </div>
                </div>
              </div>

              {pwdMsgs.general && (
                <div className="form-feedback error" role="alert">
                  <Icon name="triangle-exclamation" />
                  {pwdMsgs.general}
                </div>
              )}
              {pwdMsgs.ok && (
                <div className="form-feedback ok" role="status">
                  <Icon name="circle-check" />
                  {pwdMsgs.ok}
                </div>
              )}

              <div className="form-button-row">
                <button
                  type="button"
                  className="purple-btn"
                  onClick={updatePassword}
                  disabled={pwdUpdating}
                >
                  {pwdUpdating ? (
                    <>
                      <Icon name="loading" spin />
                      Updating...
                    </>
                  ) : pwdBtnSaved ? (
                    <>
                      <Icon name="check" />
                      Updated
                    </>
                  ) : (
                    <>
                      <Icon name="lock" />
                      Update Password
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* --- LANGUAGE & REGION --- */}
          <section className="settings-card">
            {cardTitle('globe', 'Language & Region', 'Choose your preferred language and region.')}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="language">Language</label>
                <div className="select-wrapper">
                  <select id="language" name="language" value="english" disabled>
                    <option value="english">English</option>
                  </select>
                  <Icon name="chevron-down" />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="country">Region</label>
                <div className="select-wrapper">
                  <select id="country" name="country" value="india" disabled>
                    <option value="india">India</option>
                  </select>
                  <Icon name="chevron-down" />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <aside className="settings-right">
          {/* --- ACCOUNT SUMMARY --- */}
          <section className="settings-card">
            {smallCardHeading('user', 'Account Summary')}

            <div className="summary-list">
              <div className="summary-row">
                <span>Account Type</span>
                <strong>{roleLabel}</strong>
              </div>
              <div className="summary-row">
                <span>Member Since</span>
                <strong>{joinedDate}</strong>
              </div>
              <div className="summary-row">
                <span>Total Pets</span>
                <strong>
                  {pets.length} {pets.length === 1 ? 'Pet' : 'Pets'}
                </strong>
              </div>
              <div className="summary-row">
                <span>Appointments</span>
                <strong>{apptCount === null ? '—' : apptCount + ' Scheduled'}</strong>
              </div>
            </div>
          </section>

          {/* --- YOUR PETS --- */}
          <section className="settings-card">
            {smallCardHeading('paw', 'Your Pets', 'pink')}

            {pets.length === 0 ? (
              <div className="pet-empty">No pets added yet.</div>
            ) : (
              <div className="pet-summary-list">
                {pets.map((pet) => (
                  <Link to="/app/mypet" className="pet-summary-item" key={pet._id}>
                    <img
                      src={petImage(pet)}
                      alt={pet.name || 'Pet'}
                      onError={(e) => {
                        const img = e.currentTarget
                        if (!img.src.includes('/assets/images/my-pet/')) {
                          img.src = petImage({ species: pet.species })
                        }
                      }}
                    />
                    <div className="pet-summary-info">
                      <strong>{pet.name}</strong>
                      <span>{breedName(pet)}</span>
                      <small>{ageText(pet)}</small>
                    </div>
                    <Icon name="chevron-right" className="pet-arrow" />
                  </Link>
                ))}
              </div>
            )}

            <Link to="/app/mypet" className="manage-pets-btn">
              <Icon name="paw" />
              Manage Pets
            </Link>
          </section>

          {/* --- APP INFORMATION --- */}
          <section className="settings-card">
            {smallCardHeading('info', 'App Information')}

            <div className="app-info-list">
              <div className="app-info-row">
                <span>App Version</span>
                <strong>v1.0.0</strong>
              </div>
              <button type="button" className="info-link">
                Terms of Service
                <Icon name="chevron-right" />
              </button>
              <button type="button" className="info-link">
                Privacy Policy
                <Icon name="chevron-right" />
              </button>
              <button type="button" className="info-link">
                Help &amp; Support
                <Icon name="chevron-right" />
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* ================= FOOTER ================= */}
      <footer className="settings-footer">
        <span className="footer-heart">♥</span>
        <strong>Thank you for being a part of Famipet!</strong>
        <span>We care for your pets as much as you do. 🐾</span>
      </footer>
    </div>
  )
}