// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/svelte'
import App from './App.svelte'
import { calculate, type HouseholdInput } from './tax'

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
})
