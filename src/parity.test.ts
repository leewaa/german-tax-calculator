import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { calculate, type HouseholdInput, type TaxClass } from './tax'

// Pull the legacy positional calculate() out of the preserved single-file app.
function loadLegacyCalculate(): (...a: (number | string)[]) => any {
  const html = readFileSync(new URL('../legacy/index.html', import.meta.url), 'utf8')
  const script = html.split('<script>')[1].split('</script>')[0]
  const mathBlock = script.slice(0, script.indexOf('/* ---------- state + rendering'))
  // eslint-disable-next-line no-new-func
  return new Function(mathBlock + '; return calculate;')() as any
}

const grid: HouseholdInput[] = []
for (const gy of [0, 45000, 80000, 150000])
  for (const gw of [0, 35000, 60000])
    for (const [cy, cw] of [['III', 'V'], ['IV', 'IV'], ['V', 'III']] as [TaxClass, TaxClass][])
      for (const ausRent of [0, 12000])
        for (const kids of [0, 2])
          for (const interest of [0, 3000, 10000])
            for (const freelance of [0, 25000])
              for (const denkmalCost of [0, 100000])
                grid.push({
                  grossYou: gy, classYou: cy, grossWife: gw, classWife: cw,
                  ausRent, zusatzPct: 1.7, kids, interest, freelance,
                  deductions: 0, denkmalCost,
                })

describe('parity: typed tax.ts vs legacy single-file', () => {
  const legacy = loadLegacyCalculate()
  it(`matches across ${grid.length} scenarios to the euro`, () => {
    for (const h of grid) {
      const a = calculate(h)
      const b = legacy(h.grossYou, h.classYou, h.grossWife, h.classWife, h.ausRent,
        h.zusatzPct, h.kids, h.interest, h.freelance, h.deductions, h.denkmalCost)
      const fields = ['zvE', 'incomeTax', 'annualSoli', 'annualTotal', 'withheld',
        'balance', 'grandTotal', 'freelanceTax', 'denkmalAfA'] as const
      for (const f of fields) {
        expect(Math.round((a as any)[f]), `${f} for ${JSON.stringify(h)}`)
          .toBe(Math.round((b as any)[f]))
      }
      expect(Math.round(a.cap.germanDue)).toBe(Math.round(b.cap.germanDue))
    }
  })
})
