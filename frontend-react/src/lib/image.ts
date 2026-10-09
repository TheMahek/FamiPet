// Image/asset URL resolution — the single place that decides how backend media
// URLs are turned into renderable <img>/src values. Parity with api.js/page JS:
//   - relative `/uploads/...` paths resolve against the API origin (multer
//     stores media above the `/api` mount point),
//   - absolute URLs (http(s)://... — localhost, Cloudinary) pass through,
//   - anything else (bundled asset paths) passes through unchanged.

import { apiOrigin } from '../api/client'

export function assetUrl(src: string | null | undefined): string {
  if (!src) return ''
  if (src.startsWith('http://') || src.startsWith('https://')) return src
  if (src.startsWith('/uploads/')) return apiOrigin() + src
  return src
}

// Bundled default avatar. Renamed from user-profile.svg, which held a
// hand-drawn portrait rather than a generic placeholder; the old name is still
// matched below so rows seeded before the rename keep resolving to the default.
export const GENERIC_AVATAR = '/assets/images/dashboard/avatar-generic.svg'

// True for "this is the default avatar, not a real user upload". Guards live
// here so a placeholder can never be treated as a real avatar or persisted.
export function isGenericAvatar(value: string | null | undefined): boolean {
  if (!value) return true
  return String(value).includes('avatar-generic.svg') || String(value).includes('user-profile.svg')
}