// Functional-only persistence: stores the form in a first-party cookie so the user
// doesn't have to re-enter their numbers. No tracking, no analytics. Gated on consent.
import type { HouseholdInput } from './tax'

const CONSENT_KEY = 'gtc_consent'
const FORM_KEY = 'gtc_form'
const ONE_YEAR = 60 * 60 * 24 * 365

export type Consent = 'accepted' | 'declined' | null

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${maxAge};path=/;SameSite=Lax`
}
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}
function deleteCookie(name: string): void {
  document.cookie = `${name}=;max-age=0;path=/`
}

export function getConsent(): Consent {
  const v = getCookie(CONSENT_KEY)
  return v === 'accepted' || v === 'declined' ? v : null
}
export function setConsent(c: 'accepted' | 'declined'): void {
  setCookie(CONSENT_KEY, c, ONE_YEAR)
}

export function saveForm(input: HouseholdInput): void {
  setCookie(FORM_KEY, JSON.stringify(input), ONE_YEAR)
}
export function loadForm(): Partial<HouseholdInput> | null {
  const raw = getCookie(FORM_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Partial<HouseholdInput>) : null
  } catch {
    return null
  }
}
export function clearForm(): void {
  deleteCookie(FORM_KEY)
}
