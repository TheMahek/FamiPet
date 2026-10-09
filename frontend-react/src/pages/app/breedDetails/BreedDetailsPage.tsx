// Phase 19 Breed Details — React port of frontend/pages/breed-details.html +
// frontend/js/breed-details.js. Fetches GET /breeds/:id and renders the hero,
// stat tiles and info sections only for fields the real record has (AGENTS §5).
//
// The notification bell is NOT here: it is the single app-level bell in
// AppLayout, fed by the centralized NotificationProvider.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBreed, type Breed } from '../../../api/breeds'
import { Icon } from '../../../components/shared/Icon'
import { speciesLabel, breedImage } from '../breeds/breedsBase'

export function BreedDetailsPage() {
  const { id } = useParams<{ id: string }>()

  const [breed, setBreed] = useState<Breed | null>(null)
  const [problem, setProblem] = useState<'error' | 'not-found' | 'invalid' | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const load = () => {
    if (!id) {
      setProblem('invalid')
      return
    }
    setBreed(null)
    setProblem(null)
    getBreed(id)
      .then((res) => {
        if (!res.breed) {
          setProblem('not-found')
          return
        }
        setBreed(res.breed)
      })
      .catch((err: unknown) => {
        const status = err instanceof Error && 'status' in err ? (err as { status?: number }).status : undefined
        if (status === 404) {
          setProblem('not-found')
        } else if (status === 400) {
          // invalid breed id — surface the backend message (Vanilla's catch path)
          setProblem('error')
          setErrorMessage(err instanceof Error ? err.message : 'Invalid breed ID.')
        } else {
          setProblem('error')
          setErrorMessage(err instanceof Error ? err.message : '')
        }
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  const tag = (text: string, key: string) => (
    <span className="breed-tag" key={key}>
      {text}
    </span>
  )

  const tile = (icon: string, label: string, value?: string) =>
    value
      ? (
        <div className="detail-tile" key={label}>
          <div className="tile-icon">
            <Icon name={icon} />
          </div>
          <strong>{label}</strong>
          <span>{value}</span>
        </div>
      )
      : null

  const section = (title: string, icon: string, content: React.ReactNode) =>
    content
      ? (
        <section className="breed-section" key={title}>
          <h3>
            <Icon name={icon} />
            {title}
          </h3>
          {content}
        </section>
      )
      : null

  const problemState = (title: string, message: string) => (
    <div className="breeds-state">
      <Icon name="paw" style={{ fontSize: 40, color: '#ff4d6d', marginBottom: 12 }} />
      <h3>{title}</h3>
      <p style={{ marginTop: 8 }}>{message}</p>
      <Link className="back-link" to="/app/breeds" style={{ textDecoration: 'none' }}>
        <Icon name="arrow-left" />
        Back to All Breeds
      </Link>
    </div>
  )

  const temperament = breed ? (Array.isArray(breed.temperament) ? breed.temperament : []) : []
  const diseases = breed ? (Array.isArray(breed.commonDiseases) ? breed.commonDiseases : []) : []

  return (
    <div className="breed-details-page">
      {/* ================= HEADER ================= */}
      <header className="page-header">
        <div className="header-title">
          <h1>
            Breed Details
            <span className="title-paw">
              <Icon name="paw" />
            </span>
          </h1>
          <p>Everything you need to know about this breed.</p>
        </div>
      </header>

      <section className="breed-detail-wrap">
        <Link className="back-link" to="/app/breeds">
          <Icon name="arrow-left" />
          Back to All Breeds
        </Link>

        {problem === null && !breed && (
          <div className="breeds-state">
            <Icon name="paw" style={{ fontSize: 40, color: '#ff4d6d', marginBottom: 12 }} />
            <h3>Loading breed...</h3>
          </div>
        )}

        {problem === 'invalid' && problemState('No breed selected', 'Please pick a breed from the list.')}
        {problem === 'not-found' && problemState('Breed not found', 'This breed may no longer be available.')}
        {problem === 'error' && problemState('Could not load breed', errorMessage || 'Please check your connection and try again.')}

        {breed && (
          <>
            <div className="breed-detail-hero">
              <img
                src={breedImage(breed)}
                alt={breed.name}
                onError={(e) => {
                  if (!breed.images || !breed.images.length) return
                  const el = e.target as HTMLImageElement
                  el.onerror = null
                  el.src = breedImage(breed)
                }}
              />
              <div>
                <h2>{breed.name}</h2>
                <span className="species-pill">{speciesLabel(breed.species)}</span>
              </div>
            </div>

            <div className="detail-grid">
              {tile('location-dot', 'Origin', breed.origin)}
              {tile('heart', 'Lifespan', breed.lifespan)}
              {tile('weight-scale', 'Weight', breed.weightRange)}
              {tile('ruler', 'Height', breed.heightRange)}
            </div>

            {section('Temperament', 'face-smile', temperament.length ? temperament.map((t, i) => tag(t, `temp-${i}`)) : null)}
            {section('Description', 'pen', breed.description)}
            {section('Exercise', 'person-running', breed.exerciseRequirements)}
            {section('Grooming', 'scissors', breed.groomingGuide)}
            {section('Suitable Environment', 'house', breed.suitableEnvironment)}
            {section('Common Health Concerns', 'heart-pulse', diseases.length ? diseases.map((d, i) => tag(d, `disease-${i}`)) : null)}
          </>
        )}
      </section>
    </div>
  )
}