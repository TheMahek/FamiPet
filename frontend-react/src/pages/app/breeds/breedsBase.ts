// Breed page helpers — port of frontend/js/breeds.js + breed-details.js data
// layer (speciesLabel, breedImage). React renders only real /breeds records;
// search matches name + origin (parity with the Vanilla filter).

import type { Breed } from '../../../api/breeds'

// Vanilla card/detail image fallbacks (the app's own assets, keyed by species).
export const BREED_FALLBACK_IMAGES: Record<string, string> = {
  cat: '/assets/images/my-pet/cat.png',
  bird: '/assets/images/my-pet/pet-tip.png',
}

export const BREED_DEFAULT_IMAGE = '/assets/images/my-pet/dog1.png'

export const SPECIES_TABS = [
  { value: 'all', label: 'All' },
  { value: 'dog', label: 'Dogs' },
  { value: 'cat', label: 'Cats' },
  { value: 'bird', label: 'Birds' },
  { value: 'other', label: 'Others' },
] as const

export type SpeciesTabValue = (typeof SPECIES_TABS)[number]['value']

export function speciesLabel(species?: string): string {
  return String(species || '').replace(/^\w/, (c) => c.toUpperCase())
}

export function breedImage(b: Breed): string {
  if (b.images && b.images.length && b.images[0]) return b.images[0]
  return BREED_FALLBACK_IMAGES[b.species] || BREED_DEFAULT_IMAGE
}

export function breedSearchText(b: Breed): string {
  return `${b.name} ${b.origin || ''}`.toLowerCase()
}

// Backend `reason` -> a sentence the UI can show. The backend already sends a
// `message` for every non-result case; this is the last-resort text so an
// unexpected reason never renders as a blank box (AGENTS §11 empty states).
const REASON_MESSAGES: Record<string, string> = {
  ml_not_configured: 'Breed identification is not enabled on this deployment.',
  ml_unavailable: 'Breed identification is temporarily unavailable. Please try again.',
  ml_bad_response: 'The identification service replied in an unexpected way. Please try again.',
  unsupported_animal: 'No supported breed was found in this image.',
  low_confidence: 'The image was recognised with low confidence. Try a clearer photo of a single animal.',
  enrich_disabled: 'This breed is not in FamiPet yet.',
  enrich_unavailable: 'This breed is not in FamiPet yet and breed information could not be generated.',
  enrich_rejected: 'This breed is not in FamiPet yet.',
}

export function breedAiMessage(res: {
  message?: string
  reason?: string
}): string {
  if (res.message) return res.message
  if (res.reason && REASON_MESSAGES[res.reason]) return REASON_MESSAGES[res.reason]
  return 'We could not identify a supported breed from that photo.'
}

// An AI-written breed is not human-checked. The badge must say so wherever a
// breed is shown (AGENTS §5/§9 — no fabricated verified-looking content).
export function isAiUnverified(b: Breed): boolean {
  return b.source === 'ai' && b.verificationStatus !== 'verified'
}
