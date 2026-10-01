// Breeds API — backend contract from backend/routes/breed.routes.js.
// `GET /` and `GET /:id` are public; create/update/delete are admin-only.

// Breeds API — backend contract from backend/routes/breed.routes.js.
// `GET /` and `GET /:id` are public; create/update/delete are admin-only.

import { apiGet, apiPostForm } from './client'

export interface Breed {
  _id: string
  name: string
  species: string
  origin?: string
  lifespan?: string
  weightRange?: string
  heightRange?: string
  temperament?: string[]
  exerciseRequirements?: string
  groomingGuide?: string
  commonDiseases?: string[]
  suitableEnvironment?: string
  description?: string
  characteristics?: string[]
  nutritionNotes?: string
  images?: string[]
  popularity?: number
  isActive?: boolean
  source?: 'curated' | 'ai'
  verificationStatus?: 'verified' | 'unverified'
  imagenetLabel?: string
  createdAt?: string
  updatedAt?: string
}

export interface BreedPrediction {
  label: string
  displayName: string
  confidence: number
}

export interface BreedAnalyzeResponse {
  success?: boolean
  status: 'matched' | 'created' | 'unsupported'
  reason?: string
  message?: string
  prediction?: BreedPrediction
  alternatives?: BreedPrediction[]
  breed?: Breed
  predictions?: BreedPrediction[]
}

export interface BreedAiStatus {
  enabled: boolean
  enrichEnabled: boolean
  maxUploadBytes: number
  minConfidence: number
  minConfidenceGeneric: number
}

export interface BreedsResponse {
  success?: boolean
  count?: number
  breeds?: Breed[]
}

export function getBreeds(): Promise<BreedsResponse> {
  return apiGet<BreedsResponse>('/breeds')
}

export function getBreed(id: string): Promise<{ success?: boolean; breed?: Breed }> {
  return apiGet<{ success?: boolean; breed?: Breed }>(`/breeds/${id}`)
}

export function getBreedAiStatus(): Promise<{ success?: boolean } & BreedAiStatus> {
  return apiGet<{ success?: boolean } & BreedAiStatus>('/breeds/ai/status')
}

export function analyzeBreedImage(imageFile: File): Promise<BreedAnalyzeResponse> {
  const formData = new FormData()
  formData.append('image', imageFile)
  return apiPostForm<BreedAnalyzeResponse>('/breeds/analyze', formData)
}
