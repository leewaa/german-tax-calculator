import { describe, it, expect } from 'vitest'
import {
  grundtarif, splittingTax, lohnsteuer, lohnsteuerV, soli,
  kvRate, pvRate, capitalIncomeTax, calculate, type HouseholdInput,
} from './tax'

// Minimal household builder so each test states only what it varies.
const H = (o: Partial<HouseholdInput> = {}): HouseholdInput => ({
  grossYou: 0, classYou: 'IV', grossWife: 0, classWife: 'IV',
  ausRent: 0, zusatzPct: 1.7, kids: 0, interest: 0,
  freelance: 0, deductions: 0, denkmalCost: 0, ...o,
})
const near = (a: number, b: number, t = 2) => Math.abs(a - b) <= t

describe('§32a tariff', () => {
  it('grundtarif(50000) ≈ 10906', () => expect(near(grundtarif(50000), 10906)).toBe(true))
  it('splittingTax(60000) ≈ 8892', () => expect(near(splittingTax(60000), 8892)).toBe(true))
  it('splittingTax(120000) ≈ 29360', () => expect(near(splittingTax(120000), 29360)).toBe(true))
})

describe('Solidaritätszuschlag', () => {
  it('soli(30000) joint = 0', () => expect(soli(30000, 'joint')).toBe(0))
  it('soli(40000) joint ≈ transition', () => expect(near(soli(40000, 'joint'), Math.round(0.119 * (40000 - 36260)))).toBe(true))
  it('soli(25000) IV ≈ transition', () => expect(near(soli(25000, 'IV'), Math.round(0.119 * (25000 - 18130)))).toBe(true))
})

describe('Lohnsteuer by class', () => {
  it('class III withholds less than IV', () => expect(lohnsteuer(40000, 'III') < lohnsteuer(40000, 'IV')).toBe(true))
  it('class V withholds more than IV', () => expect(lohnsteuer(40000, 'V') > lohnsteuer(40000, 'IV')).toBe(true))
  it('lohnsteuerV(40000) ≈ 12860', () => expect(near(lohnsteuerV(40000), 12860)).toBe(true))
  it('lohnsteuerV(27032) ≈ 7413', () => expect(near(lohnsteuerV(27032), 7413)).toBe(true))
})

describe('insurance rates', () => {
  it('pvRate(0) childless = 2.3%', () => expect(Math.round(pvRate(0) * 1000)).toBe(23))
  it('pvRate(1) = 1.7%', () => expect(Math.round(pvRate(1) * 1000)).toBe(17))
  it('pvRate(3) = 1.2%', () => expect(Math.round(pvRate(3) * 1000)).toBe(12))
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
})
