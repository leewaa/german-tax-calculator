// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { getConsent, setConsent, saveForm, loadForm, clearForm } from './storage'
import type { HouseholdInput } from './tax'

const clearAllCookies = () =>
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=;max-age=0;path=/`
  })

const FORM: HouseholdInput = {
  grossYou: 88000, classYou: 'IV', grossWife: 42000, classWife: 'IV',
  ausRent: 9000, zusatzPct: 1.3, kids: 2, interest: 5000,
  freelance: 15000, deductions: 2500, denkmalCost: 120000,
}

describe('storage (cookies)', () => {
  beforeEach(clearAllCookies)

  it('reports no consent by default', () => {
    expect(getConsent()).toBe(null)
  })

  it('persists a consent choice', () => {
    setConsent('accepted')
    expect(getConsent()).toBe('accepted')
    setConsent('declined')
    expect(getConsent()).toBe('declined')
  })

  it('round-trips the form through a cookie', () => {
    expect(loadForm()).toBe(null)
    saveForm(FORM)
    expect(loadForm()).toEqual(FORM)
  })

  it('clearForm removes the stored form', () => {
    saveForm(FORM)
    clearForm()
    expect(loadForm()).toBe(null)
  })
})
