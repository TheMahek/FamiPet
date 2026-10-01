// Identify-a-breed from a photo — the UI for POST /api/breeds/analyze.
//
// What the user sees, and nothing more than the backend decided:
//   * `matched`     -> an existing FamiPet breed, linked to its full page
//   * `created`     -> a new AI-written, UNVERIFIED breed (badged as such)
//   * `unsupported` -> an honest empty state with the reason (not a crash)
//
// The upload is sent once and never stored. The prediction is a SUGGESTION:
// nothing is written to a pet and no breed is applied automatically
// (AGENTS §2/§9 — the user must accept it). Images are validated in the
// backend; this only does the cheap client-side size/type guard so an
// oversized file fails instantly instead of after a round trip.

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  analyzeBreedImage,
  type Breed,
  type BreedAnalyzeResponse,
  type BreedAiStatus,
} from '../../../api/breeds'
import { Icon } from '../../../components/shared/Icon'
import { getErrorMessage } from '../../../lib/errors'
import { breedAiMessage, isAiUnverified, speciesLabel } from './breedsBase'

// Client-side mirror of the backend's accepted formats. Kept as a guard, not
// as the trust decision — the backend sniffs the bytes regardless.
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/bmp,image/gif'
const MAX_BYTES = 8 * 1024 * 1024

type Phase = 'idle' | 'analyzing' | 'done'

interface IdentifyBreedProps {
  status: BreedAiStatus | null
  onResult: (breed: Breed) => void
}

function confidencePct(value?: number): string {
  const n = typeof value === 'number' ? value : 0
  return `${Math.round(n * 100)}%`
}

export function IdentifyBreed({ status, onResult }: IdentifyBreedProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<BreedAnalyzeResponse | null>(null)

  const reset = () => {
    setFile(null)
    setPreview('')
    setResult(null)
    setError('')
    setPhase('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files && e.target.files[0]
    if (!picked) return
    setError('')
    setResult(null)
    if (!picked.type.startsWith('image/')) {
      setFile(null)
      setPreview('')
      setError('Please choose an image file.')
      return
    }
    if (picked.size > MAX_BYTES) {
      setFile(null)
      setPreview('')
      setError('That image is larger than 8MB. Please choose a smaller photo.')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(picked)
    setPreview(URL.createObjectURL(picked))
    setPhase('idle')
  }

  const run = async () => {
    if (!file || phase === 'analyzing') return
    setPhase('analyzing')
    setError('')
    setResult(null)
    try {
      const res = await analyzeBreedImage(file)
      setResult(res)
      setPhase('done')
      if (res.breed) onResult(res.breed)
    } catch (err) {
      setPhase('idle')
      setError(getErrorMessage(err, 'Could not identify the breed. Please try again.'))
    }
  }

  // The feature is optional. When the deployment has no ML service the
  // control is hidden rather than shown broken (AGENTS §11 empty states).
  if (status && !status.enabled) return null

  const breed = result && result.breed
  const unsupported = result && result.status === 'unsupported'
  const unverified = breed && isAiUnverified(breed)

  return (
    <section className="breeds-ai" aria-labelledby="identify-title">
      <div className="breeds-ai-head">
        <h2 id="identify-title">
          <Icon name="camera" /> Identify a Breed
        </h2>
        <p>Upload a clear photo of a single animal and we will suggest its breed.</p>
      </div>

      <div className="breeds-ai-body">
        <div className="breeds-ai-input">
          {preview ? (
            <img className="breeds-ai-preview" src={preview} alt="Selected animal" />
          ) : (
            <div className="breeds-ai-drop">
              <Icon name="image" style={{ fontSize: 34 }} />
              <p>No photo selected</p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            onChange={onPick}
            aria-label="Choose a photo of your pet"
            className="breeds-ai-file"
          />

          <div className="breeds-ai-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={run}
              disabled={!file || phase === 'analyzing'}
            >
              {phase === 'analyzing' ? (
                <>
                  <Icon name="loading" spin /> Identifying...
                </>
              ) : (
                <>
                  <Icon name="sparkles" /> Identify Breed
                </>
              )}
            </button>
            {file && (
              <button type="button" className="retry-btn" onClick={reset} disabled={phase === 'analyzing'}>
                Clear
              </button>
            )}
          </div>
          {error && (
            <p className="breeds-ai-error" role="alert">
              <Icon name="triangle-exclamation" /> {error}
            </p>
          )}
        </div>

        <div className="breeds-ai-result" aria-live="polite">
          {phase === 'analyzing' && (
            <div className="breeds-ai-state">
              <Icon name="loading" spin style={{ fontSize: 26 }} />
              <p>Looking at the photo...</p>
            </div>
          )}

          {phase === 'done' && breed && (
            <div className="breeds-ai-state">
              <div className="breeds-ai-badge-row">
                <span className={`breeds-ai-badge ${result.status === 'created' ? 'created' : 'matched'}`}>
                  <Icon name={result.status === 'created' ? 'sparkles' : 'circle-check'} />
                  {result.status === 'created' ? 'New breed added' : 'Breed found'}
                </span>
                {unverified && <span className="breeds-ai-badge unverified">AI generated — not yet verified</span>}
              </div>

              <h3>{breed.name}</h3>
              <p className="breeds-ai-species">
                <span className="species-pill">{speciesLabel(breed.species)}</span>
                {result.prediction && <em>match {confidencePct(result.prediction.confidence)}</em>}
              </p>

              <div className="breed-info-row">
                <strong>Origin</strong>
                <span>{breed.origin || '—'}</span>
              </div>
              <div className="breed-info-row">
                <strong>Lifespan</strong>
                <span>{breed.lifespan || '—'}</span>
              </div>
              {breed.description && <p className="breed-desc">{breed.description}</p>}

              <Link className="breed-full-link" to={`/app/breeds/${breed._id}`}>
                <Icon name="up-right-from-square" /> View Full Breed
              </Link>
            </div>
          )}

          {phase === 'done' && unsupported && (
            <div className="breeds-ai-state">
              <Icon name="circle-question" style={{ fontSize: 28 }} />
              <h3>No match</h3>
              <p>{breedAiMessage(result)}</p>
              {result.predictions && result.predictions.length > 0 && (
                <p className="breeds-ai-candidates">
                  Best guesses:{' '}
                  {result.predictions.slice(0, 3).map((p) => `${p.displayName} (${confidencePct(p.confidence)})`).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
