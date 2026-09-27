// Phase 19 Pet Breeds — React port of frontend/pages/breeds.html +
// frontend/js/breeds.js.
//
// Deltas from the Vanilla page (documented in migration.md):
// - Grid renders real GET /breeds records only (AGENTS §5). Loading/empty/
//   error states are explicit instead of the static "Loading breeds..."/
//   console.error-only failure.
// - Species filter tabs (All/Dogs/Cats/Birds/Others) + name/origin search are
//   preserved; filtering happens client-side exactly like Vanilla (the backend
//   exposes ?species= too, but Vanilla fetched all and split locally — parity).
// - The notification bell is NOT here: it is the single app-level bell in
//   AppLayout, fed by the centralized NotificationProvider (Vanilla hardcoded a
//   "0" badge — AGENTS §7).

import { useEffect, useMemo, useState } from 'react'
import { getBreeds, type Breed } from '../../../api/breeds'
import { Icon } from '../../../components/shared/Icon'
import { BreedCard } from './BreedCard'
import { breedSearchText, SPECIES_TABS, type SpeciesTabValue } from './breedsBase'

export function BreedsPage() {
  const [breeds, setBreeds] = useState<Breed[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const [query, setQuery] = useState('')
  const [species, setSpecies] = useState<SpeciesTabValue>('all')
  const [expandedId, setExpandedId] = useState('')

  const load = () => {
    setLoadFailed(false)
    getBreeds()
      .then((res) => {
        setBreeds(res.breeds || [])
      })
      .catch(() => {
        setLoadFailed(true)
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  /* ---------------- FILTER (Vanilla renderBreeds filter) ---------------- */

  const visible = useMemo(() => {
    const list = breeds || []
    const search = query.trim().toLowerCase()
    return list.filter((b) => {
      const speciesMatch = species === 'all' || b.species === species
      const searchMatch = !search || breedSearchText(b).includes(search)
      return speciesMatch && searchMatch
    })
  }, [breeds, query, species])

  const clearFilters = () => {
    setQuery('')
    setSpecies('all')
  }

  /* ---------------- RENDER ---------------- */

  if (loadFailed && !breeds) {
    return (
      <div className="breeds-page">
        <div className="breeds-state">
          <Icon name="triangle-exclamation" style={{ fontSize: 28 }} />
          <div style={{ marginTop: 8 }}>Could not load breeds.</div>
          <button type="button" className="retry-btn" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="breeds-page">
      {/* ================= HEADER ================= */}
      <header className="page-header">
        <div className="header-title">
          <h1>
            Pet Breeds
            <span className="title-paw">
              <Icon name="paw" />
            </span>
          </h1>
          <p>Explore dog, cat and other pet breeds to find the perfect match.</p>
        </div>
      </header>

      {/* ================= TOOLBAR ================= */}
      <section className="breeds-panel">
        <div className="breeds-toolbar">
          <div className="search-box">
            <Icon name="magnifying-glass" />
            <input
              type="text"
              placeholder="Search breeds..."
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="breed-filter-tabs">
            {SPECIES_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`tab-btn${species === tab.value ? ' active' : ''}`}
                aria-pressed={species === tab.value}
                onClick={() => setSpecies(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ================= GRID ================= */}
        <div className="breeds-grid">
          {breeds === null ? (
            <div className="breeds-state">
              <Icon name="paw" style={{ fontSize: 40, color: '#ff4d6d', marginBottom: 12 }} />
              <h3>Loading breeds...</h3>
            </div>
          ) : (
            visible.map((breed) => (
              <BreedCard
                key={breed._id}
                breed={breed}
                expanded={expandedId === breed._id}
                onToggle={setExpandedId}
              />
            ))
          )}
        </div>

        {/* ================= EMPTY ================= */}
        {breeds !== null && visible.length === 0 && (
          <div className="breeds-state">
            <Icon name="paw" style={{ fontSize: 40, color: '#ff4d6d', marginBottom: 12 }} />
            <h3>No breeds found</h3>
            <p style={{ marginTop: 8 }}>Try another search or filter.</p>
            <button type="button" className="retry-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        )}
      </section>
    </div>
  )
}