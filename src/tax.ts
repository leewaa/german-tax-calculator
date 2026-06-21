// German income tax, married/jointly, for tax years 2023–2026. Pure functions — no DOM,
// no side effects. Tariff coefficients verified against §32a EStG per year (gesetze-im-internet
// / BMF). Verified against the official tariff figures in tax.test.ts.

export type TaxClass = 'III' | 'IV' | 'V'
export type TaxYear = 2023 | 2024 | 2025 | 2026

export interface HouseholdInput {
  year: TaxYear
  grossYou: number; classYou: TaxClass
  grossWife: number; classWife: TaxClass
  ausRent: number; zusatzPct: number; kids: number
  interest: number; freelance: number
  deductions: number; denkmalCost: number
}
export interface PersonResult {
  g: number; cls: TaxClass; ls: number; slz: number
  svA: number; netA: number; withheld: number
  rvAlv: number // pension + unemployment (employee share)
  kv: number    // statutory health insurance (employee share)
  pv: number    // statutory care insurance (employee share)
}
export interface CapitalIncomeResult {
  interest: number; taxable: number; abgGross: number; auWHT: number
  auCredit: number; abgNet: number; soliInt: number; germanDue: number
}
export interface TaxResult {
  zvE: number; specialRate: number; incomeTax: number; taxNoRent: number
  costOfRent: number; annualSoli: number; annualTotal: number
  marginal: number; effective: number
  p1: PersonResult; p2: PersonResult
  withheld: number; balance: number; combined: number
  cap: CapitalIncomeResult; grandTotal: number
  freelance: number; freelanceTax: number; denkmalAfA: number
}

/* ---------- per-year constants ----------
 * §32a EStG zones: zone-2 (gfb..z2hi) = (z2a·y + 1400)·y, y=(x−gfb)/1e4;
 * zone-3 (z2hi..z3hi) = (z3c·z + 2397)·z + z3e, z=(x−z2hi)/1e4;
 * zone-4 (z3hi..277825) = 0.42·x − z4f; zone-5 (277826+) = 0.45·x − z5g.
 * The 1400/2397 linear terms and the 277825/277826 Reichensteuer threshold are
 * identical across all four years; only the values below move.
 */
interface YearConfig {
  gfb: number
  z2a: number; z2hi: number
  z3c: number; z3e: number; z3hi: number
  z4f: number; z5g: number
  bbgRV: number; bbgKV: number
  soliSingle: number // Soli Freigrenze (single); joint assessment uses 2× this
  kfb: number        // Kinderfreibetrag incl. BEA, full amount for the couple, per child
  pvBase: number     // employee Pflegeversicherung base rate (before childless surcharge)
}

const YEARS: Record<TaxYear, YearConfig> = {
  2023: { gfb: 10908, z2a: 979.18, z2hi: 15999, z3c: 192.59, z3e: 966.53, z3hi: 62809, z4f: 9972.98, z5g: 18307.73, bbgRV: 87600, bbgKV: 59850, soliSingle: 17543, kfb: 8952, pvBase: 0.017 },
  2024: { gfb: 11604, z2a: 922.98, z2hi: 17005, z3c: 181.19, z3e: 1025.38, z3hi: 66760, z4f: 10602.13, z5g: 18936.88, bbgRV: 90600, bbgKV: 62100, soliSingle: 18130, kfb: 9312, pvBase: 0.017 },
  2025: { gfb: 12096, z2a: 932.30, z2hi: 17443, z3c: 176.64, z3e: 1015.13, z3hi: 68480, z4f: 10911.92, z5g: 19246.67, bbgRV: 96600, bbgKV: 66150, soliSingle: 19950, kfb: 9600, pvBase: 0.018 },
  2026: { gfb: 12348, z2a: 914.51, z2hi: 17799, z3c: 173.10, z3e: 1034.87, z3hi: 69878, z4f: 11135.63, z5g: 19470.38, bbgRV: 101400, bbgKV: 69750, soliSingle: 20350, kfb: 9756, pvBase: 0.018 },
}

export const TAX_YEARS: TaxYear[] = [2023, 2024, 2025, 2026]

/* year-stable constants */
const RV = 0.093, ALV = 0.013      // employee shares of pension + unemployment insurance
const KV_BASE = 0.073              // employee health-insurance base (half of 14.6%)
const AN_PB = 1230, SO_PB = 36     // Arbeitnehmer- + Sonderausgaben-Pauschbetrag (since 2023)
const SPB_MARRIED = 2000, ABG = 0.25, AU_WHT = 0.10
const DENKMAL_RATE = 0.09

// Employee health-insurance rate: base + half the Zusatzbeitrag (employer pays the other half).
export const kvRate = (zusatzPct: number): number => KV_BASE + (zusatzPct / 100) / 2
// Employee care-insurance rate: base (1.7%/1.8%) + 0.6% childless surcharge; −0.25%/child for kids 2–5.
export const pvRate = (kids: number, year: TaxYear): number => {
  const base = YEARS[year].pvBase
  if (kids <= 0) return base + 0.006
  return Math.max(0.007, base - 0.0025 * (Math.min(kids, 5) - 1))
}

/* ---------- §32a EStG ---------- */
export function grundtarif(x: number, year: TaxYear): number {
  const c = YEARS[year]
  x = Math.floor(x)
  if (x <= c.gfb) return 0
  if (x <= c.z2hi) { const y = (x - c.gfb) / 10000; return Math.floor((c.z2a * y + 1400) * y) }
  if (x <= c.z3hi) { const z = (x - c.z2hi) / 10000; return Math.floor((c.z3c * z + 2397) * z + c.z3e) }
  if (x <= 277825) return Math.floor(0.42 * x - c.z4f)
  return Math.floor(0.45 * x - c.z5g)
}
export const splittingTax = (x: number, year: TaxYear): number =>
  x <= 0 ? 0 : 2 * grundtarif(Math.floor(x / 2), year)

/* ---------- gross → contributions / taxable wage ---------- */
export const sv = (g: number, zus: number, kids: number, year: TaxYear): number => {
  const c = YEARS[year]
  return (RV + ALV) * Math.min(g, c.bbgRV) + (kvRate(zus) + pvRate(kids, year)) * Math.min(g, c.bbgKV)
}
const vorsorge = (g: number, zus: number, kids: number, year: TaxYear): number => {
  const c = YEARS[year]
  return RV * Math.min(g, c.bbgRV) + (kvRate(zus) + pvRate(kids, year)) * Math.min(g, c.bbgKV)
}
export const taxableWage = (g: number, zus: number, kids: number, year: TaxYear): number =>
  Math.max(0, g - vorsorge(g, zus, kids, year) - AN_PB - SO_PB)

/* ---------- Lohnsteuer by tax class (§39b Abs. 2) ----------
 * Class V/VI: twice the tariff difference between 1.25× and 0.75×, clamped to a floor/ceiling.
 * The clamp thresholds below are the 2024 §39b values, held across years — they only bind at
 * income extremes and the dominant per-year behaviour comes through the year-specific grundtarif.
 */
export function lohnsteuerV(X: number, year: TaxYear): number {
  X = Math.floor(X)
  if (X <= 0) return 0
  const diff = 2 * (grundtarif(Math.floor(1.25 * X), year) - grundtarif(Math.floor(0.75 * X), year))
  let lo: number, hi: number
  if (X <= 34939) lo = 0.14 * X
  else if (X <= 222260) lo = 0.14 * 34939 + 0.42 * (X - 34939)
  else lo = 0.14 * 34939 + 0.42 * (222260 - 34939) + 0.45 * (X - 222260)
  if (X <= 14071) hi = 0.14 * X
  else if (X <= 222260) hi = 0.14 * 14071 + 0.42 * (X - 14071)
  else hi = 0.14 * 14071 + 0.42 * (222260 - 14071) + 0.45 * (X - 222260)
  return Math.floor(Math.min(Math.max(diff, lo), hi))
}
export function lohnsteuer(X: number, cls: TaxClass, year: TaxYear): number {
  if (X <= 0) return 0
  if (cls === 'III') return splittingTax(X, year)
  if (cls === 'V') return lohnsteuerV(X, year)
  return grundtarif(X, year)
}
export const soli = (tax: number, kind: TaxClass | 'joint', year: TaxYear): number => {
  const single = YEARS[year].soliSingle
  const fg = (kind === 'joint' || kind === 'III') ? 2 * single : single
  if (tax <= fg) return 0
  return Math.min(0.119 * (tax - fg), 0.055 * tax)
}

/* ---------- capital income: Australian bank interest (§32d) ----------
 * Year-independent for 2023–2026: 25% Abgeltungsteuer + 5.5% Soli after the €2,000 married
 * Sparer-Pauschbetrag, with the 10% Australian treaty withholding credited.
 */
export function capitalIncomeTax(interest: number): CapitalIncomeResult {
  interest = Math.max(0, interest || 0)
  const taxable = Math.max(0, interest - SPB_MARRIED)
  const abgGross = Math.round(ABG * taxable)
  const auWHT = Math.round(AU_WHT * interest)
  const auCredit = Math.min(auWHT, abgGross)
  const abgNet = abgGross - auCredit
  const soliInt = Math.round(0.055 * abgNet)
  return { interest, taxable, abgGross, auWHT, auCredit, abgNet, soliInt, germanDue: abgNet + soliInt }
}

/* ---------- full calculation ---------- */
export function calculate(input: HouseholdInput): TaxResult {
  const year = input.year
  const g1 = Math.max(0, input.grossYou || 0), c1 = input.classYou
  const g2 = Math.max(0, input.grossWife || 0), c2 = input.classWife
  const ausRent = Math.max(0, input.ausRent || 0)
  const zus = Math.max(0, input.zusatzPct || 0)
  const kids = Math.max(0, Math.floor(input.kids || 0))
  const interest = Math.max(0, input.interest || 0)
  const freelance = Math.max(0, input.freelance || 0)
  const deductions = Math.max(0, input.deductions || 0)
  const denkmalCost = Math.max(0, input.denkmalCost || 0)

  const denkmalAfA = Math.round(DENKMAL_RATE * denkmalCost)
  const X1 = taxableWage(g1, zus, kids, year), X2 = taxableWage(g2, zus, kids, year)
  const zvE = Math.max(0, X1 + X2 + freelance - deductions - denkmalAfA)
  const totalKFB = kids * YEARS[year].kfb

  const combined = zvE + ausRent
  const specialRate = combined > 0 ? splittingTax(combined, year) / combined : 0
  const incomeTax = Math.floor(specialRate * zvE)
  const taxNoRent = splittingTax(zvE, year)
  const costOfRent = Math.max(0, incomeTax - taxNoRent)

  const zvE0 = Math.max(0, X1 + X2 - deductions - denkmalAfA), comb0 = zvE0 + ausRent
  const rate0 = comb0 > 0 ? splittingTax(comb0, year) / comb0 : 0
  const freelanceTax = Math.max(0, incomeTax - Math.floor(rate0 * zvE0))
  const soliBaseTax = Math.floor(specialRate * Math.max(0, zvE - totalKFB))
  const annualSoli = Math.round(soli(soliBaseTax, 'joint', year))
  const annualTotal = incomeTax + annualSoli
  const marginal = combined > 0 ? (splittingTax(combined + 100, year) - splittingTax(combined, year)) / 100 : 0
  const effective = zvE > 0 ? annualTotal / zvE : 0

  const cfg = YEARS[year]
  const person = (g: number, X: number, cls: TaxClass): PersonResult => {
    const ls = lohnsteuer(X, cls, year)
    const kfb = cls === 'III' ? totalKFB : cls === 'V' ? 0 : totalKFB / 2
    const slz = Math.round(soli(lohnsteuer(Math.max(0, X - kfb), cls, year), cls, year))
    const rvAlv = (RV + ALV) * Math.min(g, cfg.bbgRV)
    const kv = kvRate(zus) * Math.min(g, cfg.bbgKV)
    const pv = pvRate(kids, year) * Math.min(g, cfg.bbgKV)
    const svA = rvAlv + kv + pv
    const netA = g - svA - ls - slz
    return { g, cls, ls, slz, svA, netA, withheld: ls + slz, rvAlv, kv, pv }
  }
  const p1 = person(g1, X1, c1), p2 = person(g2, X2, c2)

  const withheld = p1.withheld + p2.withheld
  const balance = withheld - annualTotal

  const cap = capitalIncomeTax(interest)
  const grandTotal = annualTotal + cap.germanDue

  return {
    zvE, specialRate, incomeTax, taxNoRent, costOfRent, annualSoli, annualTotal,
    marginal, effective, p1, p2, withheld, balance, combined, cap, grandTotal,
    freelance, freelanceTax, denkmalAfA,
  }
}
