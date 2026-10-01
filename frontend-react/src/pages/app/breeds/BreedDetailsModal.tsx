// Breed details modal — replaces the Vanilla / previous inline "View Details"
// expand (which pushed the card open in place). Same overlay contract as the
// other app modals (DetailsModal, PetDetailsModal): Escape closes, backdrop
// click closes, body scroll locks while open. Reuses the existing .breed-*
// content classes so the detail layout is identical to the old inline block.

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Breed } from '../../../api/breeds'
import { Icon } from '../../../components/shared/Icon'
import { breedImage, speciesLabel } from './breedsBase'

interface BreedDetailsModalProps {
  breed: Breed
  onClose: () => void
}

export function BreedDetailsModal({ breed, onClose }: BreedDetailsModalProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const temperament = Array.isArray(breed.temperament) ? breed.temperament : []
  const diseases = Array.isArray(breed.commonDiseases) ? breed.commonDiseases : []
  const fromRemote = !!(breed.images && breed.images[0])

  const infoRow = (label: string, value?: string) =>
    value ? (
      <div className="breed-info-row" key={label}>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
    ) : null

  const fullRow = (label: string, value?: string) =>
    value ? (
      <div className="breed-info-row full" key={label}>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
    ) : null

  const tag = (text: string, key: string) => (
    <span className="breed-tag" key={key}>
      {text}
    </span>
  )

  return (
    <div
      className="breed-modal-overlay show"
      role="dialog"
      aria-modal="true"
      aria-label={`${breed.name} details`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="breed-modal">
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>

        <div className="breed-modal-img">
          <img
            src={breedImage(breed)}
            alt={breed.name}
            onError={(e) => {
              if (!fromRemote) return
              const el = e.target as HTMLImageElement
              el.src = breedImage(breed)
              el.onerror = null
            }}
          />
        </div>

        <div className="breed-card-top">
          <h2>{breed.name}</h2>
          <span className="species-pill">{speciesLabel(breed.species)}</span>
        </div>

        {breed.description && <p className="breed-desc">{breed.description}</p>}

        <div className="breed-detail-grid">
          {infoRow('Origin', breed.origin)}
          {infoRow('Lifespan', breed.lifespan)}
          {infoRow('Weight', breed.weightRange)}
          {infoRow('Height', breed.heightRange)}
        </div>

        {temperament.length > 0 && (
          <div className="breed-info-block">
            <h4>
              <Icon name="face-smile" />
              Temperament
            </h4>
            <div>{temperament.map((t, i) => tag(t, `temp-${i}`))}</div>
          </div>
        )}

        {fullRow('Exercise', breed.exerciseRequirements)}
        {fullRow('Grooming', breed.groomingGuide)}
        {fullRow('Suitable Environment', breed.suitableEnvironment)}

        {diseases.length > 0 && (
          <div className="breed-info-block">
            <h4>
              <Icon name="heart-pulse" />
              Common Health Concerns
            </h4>
            <div>{diseases.map((d, i) => tag(d, `disease-${i}`))}</div>
          </div>
        )}

        <div className="breed-modal-actions">
          <Link className="breed-full-link" to={`/app/breeds/${breed._id}`}>
            <Icon name="up-right-from-square" />
            Open Full Page
          </Link>

          <button className="breed-modal-close-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
