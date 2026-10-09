// Breed gallery card — port of the Vanilla `.breed-card` (renderBreeds in
// frontend/js/breeds.js). View Details now opens BreedDetailsModal instead of
// expanding the card in place; the Open Full Page link still navigates to the
// breed-details route. Only real /breeds records render (AGENTS §5).

import type { Breed } from '../../../api/breeds'
import { Icon } from '../../../components/shared/Icon'
import { breedImage, speciesLabel } from './breedsBase'

interface BreedCardProps {
  breed: Breed
  onOpen: (breed: Breed) => void
}

export function BreedCard({ breed, onOpen }: BreedCardProps) {
  const primaryImage = breedImage(breed)
  const fromRemote = !!(breed.images && breed.images[0])

  return (
    <article className="breed-card" data-id={breed._id}>
      <div className="breed-card-img">
        <img
          src={primaryImage}
          alt={breed.name}
          loading="lazy"
          onError={(e) => {
            if (!fromRemote) return
            const el = e.target as HTMLImageElement
            el.src = breedImage(breed)
            el.onerror = null
          }}
        />
      </div>

      <div className="breed-card-body">
        <div className="breed-card-top">
          <h3>{breed.name}</h3>
          <span className="species-pill">{speciesLabel(breed.species)}</span>
        </div>

        <div className="breed-meta">
          {breed.origin && (
            <span>
              <Icon name="location-dot" />
              {breed.origin}
            </span>
          )}
          {breed.lifespan && (
            <span>
              <Icon name="heart" />
              {breed.lifespan}
            </span>
          )}
          {breed.weightRange && (
            <span>
              <Icon name="weight-scale" />
              {breed.weightRange}
            </span>
          )}
        </div>

        {breed.description && <p className="breed-desc">{breed.description}</p>}

        <button className="breed-toggle-btn" type="button" onClick={() => onOpen(breed)}>
          <Icon name="eye" />
          View Details
        </button>
      </div>
    </article>
  )
}
