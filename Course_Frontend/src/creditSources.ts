/**
 * Major-agnostic loaders and evaluators for the two "credit source" data files:
 *   Course_Data/AP.json   AP exam score -> credit conversions
 *   Course_Data/UCC.json  University Core Curriculum courses grouped by category ("type")
 *
 * Nothing here knows about CS BS. A major only supplies per-category UCC targets
 * (see MAJOR_CONFIG in App.tsx), so adding a major never means touching this file.
 * Both loaders read the structure of the JSON instead of hard-coding names, so new
 * UCC categories or new AP exams show up just by editing the JSON.
 */

export const AP_SCORES = [1, 2, 3, 4, 5] as const

/**
 * Texas A&M core curriculum, 42 SCH across eight foundational component areas
 * (catalog.tamu.edu > University Core Curriculum). Keys must match the "type"
 * values in UCC.json. A category with no entry is still listed, just without a target.
 */
export const DEFAULT_UCC_TARGETS: Record<string, number> = {
  'Communication': 6,
  'Mathematics': 6,
  'Life and Physical Sciences': 9,
  'Language, Philosophy and Culture': 3,
  'Creative Arts': 3,
  'American History': 6,
  'Government/Political Science': 6,
  'Social and Behavioral Sciences': 3,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Every course code in a JSON key. "ATMO110/GEOL110" and the typo "GEOL110ATMO110" both give two codes. */
export const extractCodes = (key: string): string[] =>
  key.replace(/\s+/g, '').toUpperCase().match(/[A-Z]+[0-9]{3}/g) ?? []

// =====================================================================
//  UCC
// =====================================================================
export type UccCourse = { canonical: string; codes: string[]; label: string; credits: number }
export type UccTable = {
  categories: { name: string; courses: UccCourse[] }[]
  /** Cross-listed code -> canonical code (the alphabetically first code of the group). */
  aliases: Record<string, string>
  /** Credits keyed by canonical code. */
  credits: Map<string, number>
}

/**
 * Keys with several codes ("ARSC105/CHEM105") are cross-listings: one course, one set of credits.
 * The same pair listed twice in reverse order ("CHEM105/ARSC105") collapses into one entry.
 */
export function parseUcc(data: unknown): UccTable {
  if (!isRecord(data)) throw new Error('UCC JSON must be an object keyed by course code.')

  const parent = new Map<string, string>()
  const find = (code: string): string => {
    let root = code
    while (parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  const entries = Object.entries(data)
  for (const [key] of entries) for (const code of extractCodes(key)) if (!parent.has(code)) parent.set(code, code)
  for (const [key] of entries) {
    const codes = extractCodes(key)
    for (let i = 1; i < codes.length; i++) {
      const a = find(codes[0]), b = find(codes[i])
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b)
    }
    if (codes.length > 1 && !key.includes('/')) console.warn(`UCC.json: "${key}" lists several codes without "/". Treated as cross-listed: ${codes.join(', ')}.`)
  }
  const aliases: Record<string, string> = {}
  for (const code of parent.keys()) if (find(code) !== code) aliases[code] = find(code)

  const byCategory = new Map<string, Map<string, UccCourse>>()
  const credits = new Map<string, number>()
  for (const [key, info] of entries) {
    const codes = extractCodes(key)
    const hours = isRecord(info) ? Number(info.credits) : NaN
    if (!codes.length || !Number.isFinite(hours) || hours < 0) { console.warn(`UCC.json: skipped "${key}" (no course code or bad credits).`); continue }
    const name = isRecord(info) && typeof info.type === 'string' && info.type.trim() ? info.type.trim() : 'Other'
    const canonical = find(codes[0])
    const bucket = byCategory.get(name) ?? new Map<string, UccCourse>()
    byCategory.set(name, bucket)
    const previous = bucket.get(canonical)
    if (previous && previous.credits !== hours) console.warn(`UCC.json: "${key}" disagrees with another entry on credits for ${canonical}.`)
    const merged = [...new Set([...(previous?.codes ?? []), ...codes])].sort()
    bucket.set(canonical, { canonical, codes: merged, label: merged.join(' / '), credits: hours })
    credits.set(canonical, hours)
  }
  const categories = [...byCategory].map(([name, bucket]) => ({
    name, courses: [...bucket.values()].sort((a, b) => (a.canonical < b.canonical ? -1 : a.canonical > b.canonical ? 1 : 0)),
  }))
  return { categories, aliases, credits }
}

export type UccCourseState = UccCourse & { completed: boolean; applied: boolean }
export type UccCategoryResult = {
  name: string; required: number | null; earned: number; remaining: number; complete: boolean
  courses: UccCourseState[]; appliedCodes: string[]
}
export type UccResult = { categories: UccCategoryResult[]; appliedCodes: string[] }

/** Applies completed courses to each category until its target is met; extra courses stay checked but unapplied. */
export function evaluateUcc(table: UccTable, isCompleted: (canonical: string) => boolean, targets: Record<string, number>): UccResult {
  const appliedAll = new Set<string>()
  const categories = table.categories.map(category => {
    const required = Object.prototype.hasOwnProperty.call(targets, category.name) ? targets[category.name] : null
    const applied = new Set<string>()
    let total = 0
    for (const course of category.courses) {
      if (!isCompleted(course.canonical) || (required !== null && total >= required)) continue
      applied.add(course.canonical)
      total += course.credits
    }
    applied.forEach(code => appliedAll.add(code))
    return {
      name: category.name, required,
      earned: required === null ? total : Math.min(required, total),
      remaining: required === null ? 0 : Math.max(0, required - total),
      complete: required !== null && total >= required,
      courses: category.courses.map(course => ({ ...course, completed: isCompleted(course.canonical), applied: applied.has(course.canonical) })),
      appliedCodes: [...applied],
    }
  })
  return { categories, appliedCodes: [...appliedAll] }
}

// =====================================================================
//  AP
// =====================================================================
export type ApAward = {
  minScore: number; credits: number; courses: string[]; note?: string
  alternative?: { credits: number; courses: string[] }
}
export type ApExam = { id: string; name: string; awards: ApAward[] }
export type ApTable = { exams: ApExam[]; lastUpdated?: string }

const cleanCodes = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map(v => v.replace(/\s+/g, '').toUpperCase()) : []

/**
 * Reads the first list of objects that each carry an "awards" array (AP.json calls it "ap_conversions"),
 * so a future IB.json or CLEP.json with the same shape loads with this function too.
 */
export function parseAp(data: unknown): ApTable {
  const list = Array.isArray(data) ? data
    : isRecord(data) ? Object.values(data).find((v): v is unknown[] => Array.isArray(v) && v.length > 0 && v.every(e => isRecord(e) && Array.isArray(e.awards)))
    : undefined
  if (!list) throw new Error('AP JSON needs a list of exams that each have an "awards" list.')

  const exams: ApExam[] = []
  for (const item of list) {
    if (!isRecord(item) || !Array.isArray(item.awards)) continue
    const id = String(item.exam_id ?? item.id ?? '').trim()
    if (!id) continue
    const awards: ApAward[] = []
    for (const raw of item.awards) {
      if (!isRecord(raw)) continue
      const minScore = Number(raw.min_score), credits = Number(raw.credits)
      if (!Number.isFinite(minScore) || !Number.isFinite(credits) || credits < 0) continue
      const alt = raw.alternative
      awards.push({
        minScore, credits, courses: cleanCodes(raw.courses),
        note: typeof raw.note === 'string' ? raw.note : undefined,
        alternative: isRecord(alt) && Number.isFinite(Number(alt.credits)) ? { credits: Number(alt.credits), courses: cleanCodes(alt.courses) } : undefined,
      })
    }
    awards.sort((a, b) => a.minScore - b.minScore)
    if (awards.length) exams.push({ id, name: String(item.exam_name ?? item.name ?? id).trim(), awards })
  }
  exams.sort((a, b) => a.name.localeCompare(b.name))
  return { exams, lastUpdated: isRecord(data) && typeof data.last_updated === 'string' ? data.last_updated : undefined }
}

export type ApExamResult = {
  score: number | null
  award: ApAward | null
  usedAlternative: boolean
  hours: number
  /** Real course codes this exam covers (placeholders such as "SPECIAL" are left out). */
  courses: string[]
  /** True when the award lists a non-course placeholder, e.g. "SPECIAL" = advisor decides. */
  placeholder: boolean
  /** Courses already credited by an earlier exam, so their hours are not counted twice. */
  overlap: string[]
}
export type ApResult = { byExam: Map<string, ApExamResult>; hours: number; courses: string[] }

/** The best award a score qualifies for (awards are cumulative: a 4 lists the 3's courses too, so never add them). */
export const bestAward = (exam: ApExam, score: number): ApAward | null =>
  exam.awards.filter(award => award.minScore <= score).sort((a, b) => b.minScore - a.minScore)[0] ?? null

/** toCode turns a raw code into the app's canonical course ID, or null when it is not a real course. */
export function evaluateAp(table: ApTable, scores: Record<string, number>, alternates: string[], toCode: (raw: string) => string | null): ApResult {
  const claimed = new Set<string>()
  const byExam = new Map<string, ApExamResult>()
  let hours = 0
  for (const exam of table.exams) {
    const score = Number.isFinite(scores[exam.id]) ? scores[exam.id] : null
    const award = score === null ? null : bestAward(exam, score)
    if (!award) { byExam.set(exam.id, { score, award: null, usedAlternative: false, hours: 0, courses: [], placeholder: false, overlap: [] }); continue }
    const alternative = award.alternative && alternates.includes(exam.id) ? award.alternative : null
    const credits = alternative ? alternative.credits : award.credits
    const raw = alternative ? alternative.courses : award.courses
    const codes = [...new Set(raw.map(toCode).filter((c): c is string => c !== null))]
    const fresh = codes.filter(code => !claimed.has(code))
    const overlap = codes.filter(code => claimed.has(code))
    // Two exams that grant the same course (e.g. CS A and CS Principles) only count once.
    const examHours = overlap.length && codes.length ? Math.floor(credits * fresh.length / codes.length) : credits
    fresh.forEach(code => claimed.add(code))
    hours += examHours
    byExam.set(exam.id, { score, award, usedAlternative: !!alternative, hours: examHours, courses: codes, placeholder: raw.length > codes.length, overlap })
  }
  return { byExam, hours, courses: [...claimed] }
}