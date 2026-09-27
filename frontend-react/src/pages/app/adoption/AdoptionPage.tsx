// Phase 18 Adoption — React port of frontend/pages/adoption.html +
// frontend/js/adoption.js.
//
// Deltas from the Vanilla page (documented in migration.md):
// - Gallery renders real /pets?status=available records (Vanilla's defaultPetsData
//   was replaced on load; AGENTS §5). Loading/empty/error states are explicit.
// - The "Healthy" pill is dropped: the backend Pet model has no health field so
//   Vanilla hardcoded healthy:true (AGENTS §9 — no fabricated medical claims);
//   the real `vaccinated` badge stays.
// - Card hearts use the shared Phase 17 FavoriteButton + useFavorites
//   (POST /users/favorites/:petId), one liked-set for the page.
// - Pet location rows are omitted — Pet has no location field (Vanilla hardcoded
//   location: "" too).
// - No Add New Pet / Delete Pet buttons and no Filters modal / grid-list toggle:
//   dead or duplicate UI (pet CRUD lives on My Pets, Phase 9) and the backend
//   DELETE /pets/:id is owner-only anyway.
// - No notification bell: it is the single app-level bell in AppLayout, fed by
//   the centralized NotificationProvider (Vanilla here hardcoded a "3" badge —
//   AGENTS §7).
// - Application form drops Email and City: the backend Adoption model stores
//   neither, and Vanilla collected but never sent them (Phase 9/16 precedent).

import { useEffect, useMemo, useState } from 'react'
import { getAvailablePets } from '../../../api/pets'
import { Icon } from '../../../components/shared/Icon'
import { useFavorites } from '../../../hooks/useFavorites'
import { AdoptionCard } from './AdoptionCard'
import { AdoptionModal } from './AdoptionModal'
import { FilterChips } from './FilterChips'
import { SearchBar } from './SearchBar'
import {
  petSearchText,
  SORT_OPTIONS,
  toAdoptionPet,
  type AdoptionPetView,
  type CategoryValue,
  type SortValue,
} from './adoptionBase'

export function AdoptionPage() {
  const { favIds, toggle } = useFavorites()

  const [pets, setPets] = useState<AdoptionPetView[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryValue>('all')
  const [sort, setSort] = useState<SortValue>('newest')

  const [selected, setSelected] = useState<AdoptionPetView | null>(null)
  const [toast, setToast] = useState('')

  const load = () => {
    setLoadFailed(false)
    getAvailablePets()
      .then((petsRes) => {
        setPets((petsRes.pets || []).map((p) => toAdoptionPet(p)))
      })
      .catch(() => {
        setLoadFailed(true)
      })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  /* ---------------- FILTER / SORT (Vanilla renderPetCards + sort logic) ---------------- */

  const counts = useMemo(() => {
    const c: Record<CategoryValue, number> = { all: 0, dog: 0, cat: 0, others: 0 }
    for (const p of pets || []) c[p.type] += 1
    c.all = (pets || []).length
    return c
  }, [pets])

  const visible = useMemo(() => {
    const list = pets || []
    const search = query.trim().toLowerCase()
    const filtered = list.filter((p) => {
      const catMatch = category === 'all' || p.type === category
      const searchMatch = !search || petSearchText(p).includes(search)
      return catMatch && searchMatch
    })
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'age') return a.age.localeCompare(b.age, undefined, { numeric: true })
      return b.createdAt - a.createdAt
    })
  }, [pets, query, category, sort])

  const clearFilters = () => {
    setQuery('')
    setCategory('all')
    setSort('newest')
  }

  /* ---------------- RENDER ---------------- */

  if (loadFailed && !pets) {
    return (
      <div className="adoption-page">
        <div className="adoption-load-state">
          <Icon name="triangle-exclamation" style={{ fontSize: 28 }} />
          <div style={{ marginTop: 8 }}>Could not load adoptable pets.</div>
          <button type="button" className="retry-btn" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="adoption-page">
      {/* ================= TOP BAR ================= */}
      <header className="top-bar">
        <div className="page-title-group">
          <div className="title-row">
            <h1>
              Adoption <Icon name="heart" className="header-heart" />
            </h1>
          </div>
          <p className="subtitle">Find your perfect companion and give them the loving home they deserve. 🐾</p>
        </div>

        <div className="top-bar-actions">
          <SearchBar value={query} onChange={setQuery} />
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="hero-banner">
        <div className="hero-left">
          <h2>
            A New Friend<br />Awaits You <Icon name="heart" />
          </h2>
          <p>
            Every pet deserves a loving home.
            <br />
            Every home deserves a companion.
          </p>

          <div className="hero-cta-group">
            <button
              type="button"
              className="hero-btn"
              onClick={() => document.querySelector('.filters-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              Adopt Now <Icon name="paw" />
            </button>
            <div className="social-proof">
              <span>Give a loving pet a forever home 🐾</span>
            </div>
          </div>
        </div>

        <div className="hero-image-wrap">
          <img src="/assets/images/adoption/Hero-Page.png" alt="Puppy and Kitten" className="banner-pets-img" />
        </div>
      </section>

      {/* ================= FILTERS ================= */}
      <div className="filters-row">
        <FilterChips selected={category} counts={counts} onSelect={setCategory} />

        <div className="view-controls">
          <div className="sort-select-wrapper">
            <span>Sort by:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortValue)} aria-label="Sort pets">
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ================= GRID ================= */}
      <div className="pets-grid">
        {pets === null ? (
          <div className="adoption-load-state">
            <Icon name="circle-notch" spin />
            <span>Loading adoptable pets...</span>
          </div>
        ) : (
          visible.map((pet) => (
            <AdoptionCard
              key={pet.id}
              pet={pet}
              liked={favIds.has(pet.id)}
              onToggleFavorite={toggle}
              onDetails={setSelected}
            />
          ))
        )}
      </div>

      {/* ================= EMPTY ================= */}
      {pets !== null && visible.length === 0 && (
        <div className="empty-state">
          <Icon name="paw" style={{ fontSize: '2.5rem', color: '#f43f5e', marginBottom: '0.75rem' }} />
          <h3>No Companions Found</h3>
          <p>Try clearing your search query or selecting a different category tab.</p>
          <button type="button" className="clear-filters-btn" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {/* ================= TOAST ================= */}
      {toast && (
        <div className="adoption-toast">
          <Icon name="circle-check" />
          <span>{toast}</span>
        </div>
      )}

      {selected && (
        <AdoptionModal
          pet={selected}
          onClose={() => setSelected(null)}
          onSubmitted={(petName) => setToast(`${petName} adoption application submitted.`)}
        />
      )}
    </div>
  )
}