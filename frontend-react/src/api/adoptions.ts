// Adoptions API — backend contract from backend/routes/adoption.routes.js
// (GET /adoptions/my returns the current user's requests, POST /adoptions
// creates one). Payload mirrors the Vanilla adoption.js adoption form; the
// backend model stores no email/city so those form fields are not sent.

import { apiDelete, apiGet, apiPost, apiPut } from './client'

export type AdoptionStatus = 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn'

export interface Adoption {
  _id: string
  status?: string
  createdAt?: string
  fullName?: string
  phone?: string
  address?: string
  occupation?: string
  experienceWithPets?: string
  reasonForAdoption?: string
  rejectionReason?: string
  acceptanceMessage?: string
  pet?: { name?: string; images?: string[]; species?: string } | null
  user?: { _id?: string; name?: string; email?: string; phone?: string } | string
}

export interface AdoptionsResponse {
  success?: boolean
  count?: number
  adoptions?: Adoption[]
  requests?: Adoption[]
}

export interface AdoptionPayload {
  pet: string
  fullName: string
  phone: string
  address: string
  occupation: string
  experienceWithPets: string
  reasonForAdoption: string
}

export function getMyAdoptions(): Promise<AdoptionsResponse> {
  return apiGet<AdoptionsResponse>('/adoptions/my')
}

export function createAdoption(payload: AdoptionPayload): Promise<{ success?: boolean; adoption?: Adoption }> {
  return apiPost('/adoptions', payload)
}

// Admin review endpoints (GET /adoptions + PUT /adoptions/:id are admin-only
// on the backend — the Vanilla admin adoptions page calls exactly these).
export function getAllAdoptions(): Promise<AdoptionsResponse> {
  return apiGet<AdoptionsResponse>('/adoptions')
}

export function updateAdoptionStatus(
  id: string,
  status: 'Approved' | 'Rejected',
  messageOrReason?: string,
): Promise<{ success?: boolean; message?: string; adoption?: Adoption }> {
  // Approve carries an optional `message` (backend substitutes a generic
  // acceptance message when blank); Reject requires `reason`.
  return apiPut<{ success?: boolean; message?: string; adoption?: Adoption }>(
    `/adoptions/${id}`,
    status === 'Approved' ? { status, message: messageOrReason } : { status, reason: messageOrReason },
  )
}
export function withdrawAdoption(id: string): Promise<{ success?: boolean; message?: string }> {
  return apiDelete<{ success?: boolean; message?: string }>(`/adoptions/my/${id}`)
}
