// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/svelte'
import App from './App.svelte'
import { calculate, type HouseholdInput } from './tax'

// Start every test with a clean cookie jar so the consent banner state is deterministic.
beforeEach(() =>
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=;max-age=0;path=/`
  }),
)

// Intl formats de-DE currency with a narrow no-break space (U+202F) before €.
// testing-library normalizes DOM whitespace to a regular space, so normalize the
// expected string the same way before matching.
const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(Math.round(n))
    .replace(/\s+/g, ' ')
    .trim()

// The component's hard-coded defaults (must match App.svelte's $state initial values).
const DEFAULTS: HouseholdInput = {
  year: 2024,
  grossYou: 70000, classYou: 'III', grossWife: 35000, classWife: 'V',
  ausRent: 12000, zusatzPct: 1.7, kids: 0, interest: 3000,
  freelance: 0, deductions: 0, denkmalCost: 0,
}

describe('App.svelte', () => {
  it('renders the grand total for the default scenario', () => {
    render(App)
    const expected = eur(calculate(DEFAULTS).grandTotal)
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0)
  })

  it('recomputes when an income input changes', async () => {
    const { container } = render(App)
    const youGross = container.querySelector<HTMLInputElement>('input[type="number"]')!
    await fireEvent.input(youGross, { target: { value: '120000' } })
    const expected = eur(calculate({ ...DEFAULTS, grossYou: 120000 }).grandTotal)
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0)
  })

  it('shows the invalid-combo warning for III + III', async () => {
    render(App)
    const threes = screen.getAllByRole('button', { name: 'III' })
    // click the wife's III (second tax-class group) → III + III is invalid
    await fireEvent.click(threes[threes.length - 1])
    expect(screen.getByText(/A married couple can only run/i)).toBeTruthy()
  })

  it('shows the cookie banner and persists the form on Accept', async () => {
    render(App)
    // banner visible while no consent decision exists
    expect(screen.getByText(/Keep your numbers\?/i)).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    // banner dismissed and a form cookie now exists
    expect(screen.queryByText(/Keep your numbers\?/i)).toBeNull()
    expect(document.cookie).toMatch(/gtc_consent=accepted/)
    expect(document.cookie).toMatch(/gtc_form=/)
  })

  it('breaks out health insurance and shows net income', () => {
    render(App)
    // health + care insurance now have their own lines in the take-home table
    expect(screen.getByText(/Health insurance \(KV\)/i)).toBeTruthy()
    expect(screen.getByText(/Care insurance \(PV\)/i)).toBeTruthy()
    // the combined monthly net income is surfaced
    expect(screen.getByText(/Combined net income \/ month/i)).toBeTruthy()
    const expected = eur((calculate(DEFAULTS).p1.netA + calculate(DEFAULTS).p2.netA) / 12)
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0)
  })

  it('has a dedicated Denkmal card that shows the payable tax', () => {
    render(App)
    expect(screen.getAllByText(/Denkmal-AfA/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Tax payable without Denkmal/i)).toBeTruthy()
    expect(screen.getByText(/Tax payable with Denkmal/i)).toBeTruthy()
  })

  it('recalculates when the tax year changes', async () => {
    const { container } = render(App)
    const select = container.querySelector<HTMLSelectElement>('select#year')!
    await fireEvent.change(select, { target: { value: '2026' } })
    const expected = eur(calculate({ ...DEFAULTS, year: 2026 }).grandTotal)
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0)
    // the 2026 total differs from the 2024 default total
    expect(eur(calculate({ ...DEFAULTS, year: 2026 }).grandTotal))
      .not.toBe(eur(calculate(DEFAULTS).grandTotal))
  })

  it('does not store the form when declined', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(screen.queryByText(/Keep your numbers\?/i)).toBeNull()
    expect(document.cookie).toMatch(/gtc_consent=declined/)
    expect(document.cookie).not.toMatch(/gtc_form=/)
  })
})
