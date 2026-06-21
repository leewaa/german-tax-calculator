import { describe, it, expect } from 'vitest'
import {
  grundtarif, splittingTax, lohnsteuer, lohnsteuerV, soli,
  kvRate, pvRate, capitalIncomeTax, calculate, TAX_YEARS,
  type HouseholdInput, type TaxYear,
} from './tax'

// Minimal household builder so each test states only what it varies. Defaults to 2024.
const H = (o: Partial<HouseholdInput> = {}): HouseholdInput => ({
  year: 2024,
  grossYou: 0, classYou: 'IV', grossWife: 0, classWife: 'IV',
  ausRent: 0, zusatzPct: 1.7, kids: 0, interest: 0,
  freelance: 0, deductions: 0, denkmalCost: 0, ...o,
})
const near = (a: number, b: number, t = 2) => Math.abs(a - b) <= t

describe('§32a tariff (2024 anchors)', () => {
  it('grundtarif(50000, 2024) ≈ 10906', () => expect(near(grundtarif(50000, 2024), 10906)).toBe(true))
  it('splittingTax(60000, 2024) ≈ 8892', () => expect(near(splittingTax(60000, 2024), 8892)).toBe(true))
  it('splittingTax(120000, 2024) ≈ 29360', () => expect(near(splittingTax(120000, 2024), 29360)).toBe(true))
})

describe('§32a tariff (per-year, zone-4 exact anchors at zvE=100000)', () => {
  // 0.42·100000 − z4f, floored, from the verified per-year subtractors.
  const expected: Record<TaxYear, number> = { 2023: 32027, 2024: 31397, 2025: 31088, 2026: 30864 }
  for (const y of TAX_YEARS) {
    it(`grundtarif(100000, ${y}) = ${expected[y]}`, () => expect(grundtarif(100000, y)).toBe(expected[y]))
  }
})

describe('§32a tariff (Grundfreibetrag rises each year)', () => {
  const gfb: Record<TaxYear, number> = { 2023: 10908, 2024: 11604, 2025: 12096, 2026: 12348 }
  for (const y of TAX_YEARS) {
    it(`zero tax at the ${y} Grundfreibetrag, positive just above`, () => {
      expect(grundtarif(gfb[y], y)).toBe(0)
      expect(grundtarif(gfb[y] + 1000, y)).toBeGreaterThan(0)
    })
  }
  it('at a fixed income, later years are taxed less (rising allowance)', () => {
    expect(grundtarif(50000, 2023)).toBeGreaterThan(grundtarif(50000, 2024))
    expect(grundtarif(50000, 2024)).toBeGreaterThan(grundtarif(50000, 2025))
    expect(grundtarif(50000, 2025)).toBeGreaterThan(grundtarif(50000, 2026))
  })
})

describe('Solidaritätszuschlag (2024)', () => {
  it('soli(30000) joint = 0', () => expect(soli(30000, 'joint', 2024)).toBe(0))
  it('soli(40000) joint ≈ transition', () => expect(near(soli(40000, 'joint', 2024), Math.round(0.119 * (40000 - 36260)))).toBe(true))
  it('soli(25000) IV ≈ transition', () => expect(near(soli(25000, 'IV', 2024), Math.round(0.119 * (25000 - 18130)))).toBe(true))
  it('2025 joint Freigrenze (39900) is higher than 2024', () => {
    expect(soli(38000, 'joint', 2025)).toBe(0)         // below 39900
    expect(soli(38000, 'joint', 2024)).toBeGreaterThan(0) // above 36260
  })
})

describe('Lohnsteuer by class (2024)', () => {
  it('class III withholds less than IV', () => expect(lohnsteuer(40000, 'III', 2024) < lohnsteuer(40000, 'IV', 2024)).toBe(true))
  it('class V withholds more than IV', () => expect(lohnsteuer(40000, 'V', 2024) > lohnsteuer(40000, 'IV', 2024)).toBe(true))
  it('lohnsteuerV(40000, 2024) ≈ 12860', () => expect(near(lohnsteuerV(40000, 2024), 12860)).toBe(true))
  it('lohnsteuerV(27032, 2024) ≈ 7413', () => expect(near(lohnsteuerV(27032, 2024), 7413)).toBe(true))
})

describe('insurance rates', () => {
  it('pvRate(0, 2024) childless = 2.3%', () => expect(Math.round(pvRate(0, 2024) * 1000)).toBe(23))
  it('pvRate(1, 2024) = 1.7%', () => expect(Math.round(pvRate(1, 2024) * 1000)).toBe(17))
  it('pvRate(3, 2024) = 1.2%', () => expect(Math.round(pvRate(3, 2024) * 1000)).toBe(12))
  it('pvRate(0, 2025) childless = 2.4% (rate rose to 3.6%)', () => expect(Math.round(pvRate(0, 2025) * 1000)).toBe(24))
  it('kvRate(1.7) = 8.15%', () => expect(Math.round(kvRate(1.7) * 10000)).toBe(815))
})

describe('capital income (Abgeltungsteuer)', () => {
  it('interest 10000 → 1055 due', () => expect(near(capitalIncomeTax(10000).germanDue, 1055)).toBe(true))
  it('interest 1500 → 0 (under allowance)', () => expect(capitalIncomeTax(1500).germanDue).toBe(0))
  it('interest 3000 → 0 (AU credit wipes it)', () => expect(capitalIncomeTax(3000).germanDue).toBe(0))
})

describe('calculate() integration', () => {
  it('freelance raises income tax', () =>
    expect(calculate(H({ grossYou: 70000, grossWife: 35000, freelance: 20000 })).incomeTax
         > calculate(H({ grossYou: 70000, grossWife: 35000 })).incomeTax).toBe(true))
  it('freelanceTax isolates a positive cost', () =>
    expect(calculate(H({ grossYou: 60000, freelance: 10000 })).freelanceTax > 0).toBe(true))
  it('deductions cut the tax', () =>
    expect(calculate(H({ grossYou: 80000, grossWife: 40000, deductions: 10000 })).annualTotal
         < calculate(H({ grossYou: 80000, grossWife: 40000 })).annualTotal).toBe(true))
  it('tax classes do not change the annual total', () =>
    expect(calculate(H({ grossYou: 80000, classYou: 'III', grossWife: 40000, classWife: 'V' })).annualTotal)
      .toBe(calculate(H({ grossYou: 80000, grossWife: 40000 })).annualTotal))
  it('denkmal 100000 → 9000 AfA', () =>
    expect(calculate(H({ grossYou: 80000, grossWife: 40000, denkmalCost: 100000 })).denkmalAfA).toBe(9000))
  it('denkmal cuts the tax', () =>
    expect(calculate(H({ grossYou: 80000, grossWife: 40000, denkmalCost: 100000 })).annualTotal
         < calculate(H({ grossYou: 80000, grossWife: 40000 })).annualTotal).toBe(true))
  it('the same household owes less tax in 2026 than 2023', () =>
    expect(calculate(H({ year: 2026, grossYou: 80000, grossWife: 40000 })).annualTotal)
      .toBeLessThan(calculate(H({ year: 2023, grossYou: 80000, grossWife: 40000 })).annualTotal))

  it('exposes the social-security breakout that sums to the total (health + care + pension)', () => {
    const p = calculate(H({ grossYou: 70000, grossWife: 0 })).p1
    expect(p.kv).toBeGreaterThan(0)
    expect(p.pv).toBeGreaterThan(0)
    expect(p.rvAlv).toBeGreaterThan(0)
    expect(near(p.rvAlv + p.kv + p.pv, p.svA, 0.01)).toBe(true)
  })

  it('a higher Zusatzbeitrag raises health insurance and lowers net pay', () => {
    const lo = calculate(H({ grossYou: 60000, zusatzPct: 0.9 })).p1
    const hi = calculate(H({ grossYou: 60000, zusatzPct: 2.5 })).p1
    expect(hi.kv).toBeGreaterThan(lo.kv)
    expect(hi.netA).toBeLessThan(lo.netA)
  })
})
