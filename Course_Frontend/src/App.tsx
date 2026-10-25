import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import catalogFile from '../../Course_Data/Major.json/CPSC_BS.json' // copy of Course_Data/Major.json/CPSC_BS.json
import uccFile from '../../Course_Data/UCC.json'
import apFile from '../../Course_Data/AP.json'
import {
  AP_SCORES, DEFAULT_UCC_TARGETS, evaluateAp, evaluateUcc, parseAp, parseUcc,
  type UccCategoryResult,
} from './creditSources'
import etamFile from '../../Course_Data/ETAM.json'
import otherRequirementsFile from '../../Course_Data/OtherRequirements.json'

type StudentProfile = {
  name: string
  uin: string
  major: string
  year: string
  semester: string
}

const student: StudentProfile = {
  name: 'Daniel Kim',
  uin: '93535',
  major: 'CPSC_BS',
  year: 'Freshman',
  semester: '1st semester',
}

type ActiveUser = {
  name: string
  uin: string | number
  major?: string
  year?: string
  sem?: string
  semester?: string
}

// Everything the planner saves for one student under `classes_${uin}`.
// otherTamuHours / transferHours are inputs; ringHours / requiredCredits are calculated and saved for convenience.
// apScores maps an AP exam_id from AP.json to the score earned; apAlternates lists exam_ids using the "alternative" award.
type SavedPlanner = {
  completed: string[]; customCourses: CustomCourse[]; highImpact: boolean
  otherTamuHours: number; transferHours: number; ringHours: number; requiredCredits: number
  apScores: Record<string, number>; apAlternates: string[]
}

type CourseOption = {
  course_id: string; canonical_id?: string; name?: string; credits: number
  completed: boolean; applied_here: boolean
}
type Requirement = {
  id: string; kind: 'required' | 'choose_one' | 'elective' | 'experience'
  show_dropdown: boolean; multiple: boolean; options: CourseOption[]
  required_credits: number; earned_credits: number; remaining_credits: number
  complete: boolean; applied_courses: string[]; allow_custom_courses?: boolean
}
type Report = {
  CPSC_BS: Requirement[]
  degree_credits: number; total_credits: number; total_credits_complete: boolean
  courses_missing_credit_values: string[]; major_checklist_complete: boolean
  applied_codes: string[] // every course applied to the major checklist or UCC (each counted once)
  credit_requirements: { full_degree_total: number }
}
type CustomCourse = { id: string; name: string; credits: number; completed: boolean }

// ---------- Texas A&M credit rules ----------
// Aggie Ring (undergraduate): 90 total completed hours, 45 of them earned at Texas A&M.
// Credit by exam (AP) and transfer hours count toward the 90 but NOT toward the 45.
// The Ring also needs a 2.0 cumulative GPR and good standing, which this planner does not track.
const RING_TOTAL_HOURS = 90
const RING_RESIDENT_HOURS = 45
const MAX_EXTRA_HOURS = 300

// =====================================================================
//  CS BS checklist: TypeScript port of Course_Backend/CPSC_BS.py
//  (major-only; UCC, AP, GPA, prerequisites etc. are not evaluated)
// =====================================================================
type CatalogEntry = { type?: string; credits: number; elective: 'yes' | 'no'; elective_type?: string }
const catalog = catalogFile as unknown as Record<string, CatalogEntry>

const COMPLEMENTARY_KEY = 'COMPLEMENTARY_ELECTIVE'
const UPPER_LEVEL = 'Upper-level Computer Science and Engineering Electives'
const COMPLEMENTARY = 'Complementary Elective'
const TARGETS: Record<string, number> = {
  'Systems Electives': 3,
  'Software and Languages Electives': 3,
  'Information and Applications Electives': 3,
  [UPPER_LEVEL]: 9,
  'Science Elective': 7,
  [COMPLEMENTARY]: 9,
}
const DEGREE_TOTAL_CREDITS = 126

// =====================================================================
//  Per-major settings for the AP / UCC columns.
//  creditSources.ts is major-agnostic; a new major only needs its own copy of this block.
//  uccTargets keys must match the "type" values in UCC.json (SCH required per category).
// =====================================================================
const MAJOR_CONFIG = {
  uccTargets: { ...DEFAULT_UCC_TARGETS } as Record<string, number>,
}
type ExtraRequirementData = {
  required_credits: number
  courses: Record<string, number>
}

const extraRequirements = otherRequirementsFile as Record<
  string,
  ExtraRequirementData
>

// A course can belong to a core category and CD/ICD at the same time.
// Temporary unique keys preserve both entries during parsing.
const combinedUccData: Record<string, unknown> = { ...uccFile }

for (const [category, requirement] of Object.entries(extraRequirements)) {
  if (
    category === 'Foreign Language' ||
    category === 'Writing / Communication'
  ) {
    continue
  }
  for (const [course, credits] of Object.entries(requirement.courses)) {
    combinedUccData[`${course}::${category}`] = {
      type: category,
      credits,
    }
  }

  MAJOR_CONFIG.uccTargets[category] = requirement.required_credits
}

const uccTable = parseUcc(combinedUccData)
const apTable = parseAp(apFile as unknown)

/** CSCE 120, csce120 -> CSCE120; known cross-listings share one ID. */
function normalize(code: string, aliasMap: Record<string, string> = {}) {
  const cleaned = code.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]+[0-9]{3}$/.test(cleaned)) throw new Error(`Use one actual course code, not a group: ${cleaned}`)
  let canonical = cleaned
  const visited = new Set<string>()
  while (aliasMap[canonical] && !visited.has(canonical)) {
    visited.add(canonical)
    canonical = aliasMap[canonical]
  }
  return canonical
}
const stripRaw = (code: string) => code.replace(/ /g, '').toUpperCase()

// Cross-listed pairs come from two-code upper-level entries (same convention as the Python).
const aliases: Record<string, string> = {}
for (const [key, info] of Object.entries(catalog)) {
  if (info.elective === 'yes' && info.elective_type === UPPER_LEVEL) {
    const codes = key.split('/')
    if (codes.length === 2) {
      const first = normalize(codes[0])
      for (const code of codes) aliases[normalize(code)] = first
    }
  }
}

// UCC.json cross-listings (ARSC105/CHEM105, ...) share one ID everywhere, same as the major's.
for (const [code, root] of Object.entries(uccTable.aliases)) if (!(code in aliases)) aliases[code] = root

// Parse the catalog once: required courses, choice groups, credits, elective buckets.
const baseCredits = new Map<string, number>()
const requiredCodes: string[] = []
const choiceGroups: { label: string; codes: string[] }[] = []
const eligibleBuckets: Record<string, Set<string>> = {}
for (const name of Object.keys(TARGETS)) eligibleBuckets[name] = new Set()
for (const [key, info] of Object.entries(catalog)) {
  if (key === COMPLEMENTARY_KEY) continue // a requirement, not a nine-credit course
  const codes = [...new Set(key.split('/').map(c => normalize(c, aliases)))].sort()
  for (const code of codes) baseCredits.set(code, info.credits)
  if (info.elective === 'no') {
    if (codes.length === 1) requiredCodes.push(codes[0])
    else choiceGroups.push({ label: key, codes })
  } else {
    const bucket = eligibleBuckets[info.elective_type ?? '']
    if (!bucket) throw new Error(`Unknown elective type for ${key}: ${info.elective_type}`)
    for (const code of codes) bucket.add(code)
  }
}
const requiredSorted = [...new Set(requiredCodes)].sort()

/** Credits for any known course: the major's catalog first, then UCC.json. */
const uccCredits = new Map<string, number>()
for (const [raw, hours] of uccTable.credits) uccCredits.set(normalize(raw, aliases), hours)
type EtamEntry = {
  type: string
  credits: number
}

const etamCatalog = etamFile as Record<string, EtamEntry>

const etamGroups = [
  { type: 'ETAM Engineering', label: 'Engineering' },
  { type: 'ETAM Science', label: 'Science' },
  { type: 'ETAM Math', label: 'Math' },
].map(group => ({
  ...group,
  courses: Object.entries(etamCatalog)
    .filter(([, entry]) => entry.type === group.type)
    .map(([label, entry]) => ({
      label,
      credits: entry.credits,
      // "/" means equivalent alternatives; "&" requires both courses.
      alternatives: label.split('/').map(option =>
        option.split('&').map(code => normalize(code, aliases))
      ),
    })),
}))

// Add credit values for ETAM courses absent from the major/UCC catalogs.
// CHEM107 + CHEM117 is a combined four-credit option.
const etamCredits = new Map<string, number>()

for (const group of etamGroups) {
  for (const course of group.courses) {
    for (const alternative of course.alternatives) {
      for (const code of alternative) {
        const credits = alternative.length === 2 && alternative.includes('CHEM107') && alternative.includes('CHEM117')
          ? (code === 'CHEM107' ? 3 : 1)
          : course.credits

        if (!baseCredits.has(code) && !uccCredits.has(code)) {
          etamCredits.set(code, credits)
        }
      }
    }
  }
}
const foreignConfig = (
  otherRequirementsFile as unknown as Record<
    string,
    {
      languages?: Record<string, string>
      courses: Record<string, number>
    }
  >
)['Foreign Language']

const foreignLanguages = Object.entries(
  foreignConfig.languages ?? {},
).map(([prefix, name]) => ({
  prefix,
  name,
}))

const foreignCourses = Object.entries(
  foreignConfig.courses,
).map(([code, credits]) => {
  const prefix = code.replace(/[0-9]/g, '')

  return {
    code,
    credits,
    language:
      foreignLanguages.find(
        language => language.prefix === prefix,
      )?.name ?? prefix,
  }
})

const foreignCredits = new Map(
  foreignCourses.map(course => [course.code, course.credits])
)
const creditOf = (code: string) =>
  baseCredits.get(code)
  ?? uccCredits.get(code)
  ?? etamCredits.get(code)
  ?? foreignCredits.get(code)
/** Canonical course ID, or null for things that are not one course code (e.g. AP's "SPECIAL"). */
const toCode = (raw: string) => { try { return normalize(raw, aliases) } catch { return null } }

const experienceCourses = new Set<string>()
for (const [key, info] of Object.entries(catalog)) {
  if (info.type === 'High-Impact Experience' && info.elective === 'no') {
    for (const c of key.split('/')) experienceCourses.add(normalize(c, aliases))
  }
}

// Raw (as written in the JSON) course codes shown on each requirement card.
const requiredRawOptions = new Map<string, Set<string>>()
for (const [key, info] of Object.entries(catalog)) {
  if (info.elective !== 'no') continue
  const raw = key.split('/')
  const normalized = raw.map(c => normalize(c, aliases))
  if (new Set(normalized).size === 1) {
    const set = requiredRawOptions.get(normalized[0]) ?? new Set<string>()
    raw.forEach(c => set.add(stripRaw(c)))
    requiredRawOptions.set(normalized[0], set)
  }
}
const electiveRawOptions: Record<string, Set<string>> = {}
for (const name of Object.keys(TARGETS)) electiveRawOptions[name] = new Set()
for (const [key, info] of Object.entries(catalog)) {
  if (key === COMPLEMENTARY_KEY || !info.elective_type || !electiveRawOptions[info.elective_type]) continue
  key.split('/').forEach(c => electiveRawOptions[info.elective_type!].add(stripRaw(c)))
}

const customCode = (course: { name: string }) => {
  const value = course.name.replace(/\s+/g, '').toUpperCase()
  return /^[A-Z]+[0-9]{3}$/.test(value) ? normalize(value, aliases) : null
}
const customId = (name: string) => {
  try { return normalize(name, aliases) } catch {
    return 'CUSTOM:' + name.toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  }
}

type ElectiveResult = { required_credits: number; earned_credits: number; remaining_credits: number; complete: boolean; applied_courses: string[] }
type Cell = { cost: number; assignments: [string, string][] }

// Python compares (cost, assignments) tuples; this does the same.
function compareCells(a: Cell, b: Cell) {
  if (a.cost !== b.cost) return a.cost - b.cost
  const shared = Math.min(a.assignments.length, b.assignments.length)
  for (let i = 0; i < shared; i++) {
    for (let j = 0; j < 2; j++) {
      const x = a.assignments[i][j], y = b.assignments[i][j]
      if (x !== y) return x < y ? -1 : 1
    }
  }
  return a.assignments.length - b.assignments.length
}

/** Exact capped-state DP: each course is used at most once across buckets. */
function allocate(candidates: Set<string>, eligible: Record<string, Set<string>>, credits: Map<string, number>) {
  const names = Object.keys(eligible)
  const targets = names.map(name => TARGETS[name])
  const zero = targets.map(() => 0)
  let states = new Map<string, { state: number[]; cell: Cell }>([[zero.join(','), { state: zero, cell: { cost: 0, assignments: [] } }]])
  for (const code of [...candidates].sort()) {
    const hours = credits.get(code) ?? 0
    if (!hours) continue
    const updates = new Map(states)
    for (const { state, cell } of states.values()) {
      names.forEach((name, i) => {
        if (!eligible[name].has(code) || state[i] >= targets[i]) return
        const next = [...state]
        next[i] = Math.min(targets[i], state[i] + hours)
        const proposal: Cell = { cost: cell.cost + hours, assignments: [...cell.assignments, [code, name]] }
        const key = next.join(',')
        const old = updates.get(key)
        if (!old || compareCells(proposal, old.cell) < 0) updates.set(key, { state: next, cell: proposal })
      })
    }
    states = updates
  }
  // Prefer most completed buckets, then most covered credits, then least credit used.
  let bestKey = zero.join(',')
  let bestScore: number[] | null = null
  for (const [key, { state, cell }] of states) {
    const score = [state.filter((value, i) => value === targets[i]).length, state.reduce((a, b) => a + b, 0), -cell.cost]
    const better = !bestScore || score[0] > bestScore[0]
      || (score[0] === bestScore[0] && (score[1] > bestScore[1] || (score[1] === bestScore[1] && score[2] > bestScore[2])))
    if (better) { bestScore = score; bestKey = key }
  }
  const best = states.get(bestKey)!
  const result: Record<string, ElectiveResult> = {}
  names.forEach((name, i) => {
    const selected = best.cell.assignments.filter(([, bucket]) => bucket === name).map(([code]) => code)
    result[name] = {
      required_credits: targets[i],
      earned_credits: selected.reduce((sum, code) => sum + (credits.get(code) ?? 0), 0),
      remaining_credits: targets[i] - best.state[i],
      complete: best.state[i] === targets[i],
      applied_courses: selected,
    }
  })
  return result
}

/** Whole-course UCC allocation: highest hours first; stop at or above the target.
 * Used by both the cards and degree totals so their applied courses agree.
 * Categories without a configured target retain the evaluator's display-only result.
 */
function applyWholeCourseUcc(category: UccCategoryResult, isCompleted: (code: string) => boolean): UccCategoryResult {
  const target = MAJOR_CONFIG.uccTargets[category.name]
  if (!Number.isFinite(target) || target < 0) return category
  const candidates = new Map<string, number>()
  for (const course of category.courses) {
    const code = toCode(course.canonical)
    if (!code || !isCompleted(code)) continue
    const hours = creditOf(code)
    if (hours !== undefined && Number.isFinite(hours) && hours > 0) candidates.set(code, hours)
  }
  const ranked = [...candidates].sort(([a, ah], [b, bh]) => bh - ah || a.localeCompare(b))
  const selected = new Set<string>()
  let earned = 0
  for (const [code, hours] of ranked) {
    if (earned >= target) break
    selected.add(code)
    earned += hours // Never truncate the final course to the remaining requirement.
  }
  return {
    ...category,
    required: target,
    earned,
    remaining: Math.max(0, target - earned),
    complete: earned >= target,
    courses: category.courses.map(course => {
      const code = toCode(course.canonical)
      return { ...course, completed: code !== null && isCompleted(code), applied: code !== null && selected.has(code) }
    }),
  }
}

function buildReport(completedCourses: string[], complementary: CustomCourse[], highImpact: boolean, uccCategories: UccCategoryResult[] = []): Report {
  // Major credits win over UCC credits for the same course.
  const credits = new Map<string, number>([
    ...foreignCredits,
    ...etamCredits,
    ...uccCredits,
    ...baseCredits,
  ])
  const completed = new Set<string>()
  for (const raw of completedCourses) {
    try { completed.add(normalize(raw, aliases)) } catch { /* ignore invalid saved codes */ }
  }
  // A known course checked in the custom list must update shared completion first.
  for (const record of complementary) if (record.completed) completed.add(customId(record.name))

  const applied = new Set<string>()
  const requiredResults = requiredSorted.map(code => {
    const done = experienceCourses.has(code) ? highImpact : completed.has(code)
    if (done) applied.add(code)
    return { course_id: code, complete: done }
  })

  const choiceResults = choiceGroups.map(({ label, codes }) => {
    const available = codes.filter(c => completed.has(c) && !applied.has(c))
      .sort((a, b) => (credits.get(a)! - credits.get(b)!) || (a < b ? -1 : a > b ? 1 : 0))
    const selected = available.slice(0, 1)
    selected.forEach(c => applied.add(c))
    return { label, selected, required: Math.min(...codes.map(c => credits.get(c) ?? 0)) }
  })

  // Student-entered complementary courses (catalog credits win for known course codes).
  const complementaryIds = new Set<string>()
  const customList: { course_id: string; name: string; credits: number; completed: boolean }[] = []
  const seen = new Set<string>()
  for (const record of complementary) {
    const name = record.name.trim()
    const hours = record.credits
    if (!name || !Number.isInteger(hours) || hours <= 0) continue
    const code = customId(name)
    if (seen.has(code)) continue
    seen.add(code)
    if (record.completed) completed.add(code)
    if (!credits.has(code)) credits.set(code, hours)
    complementaryIds.add(code)
    customList.push({ course_id: code, name, credits: hours, completed: completed.has(code) })
  }

  // Allocate ALL elective buckets together to prevent cross-bucket reuse.
  const allEligible: Record<string, Set<string>> = { ...eligibleBuckets, [COMPLEMENTARY]: complementaryIds }
  const candidates = new Set<string>()
  for (const bucket of Object.values(allEligible)) for (const code of bucket) if (completed.has(code) && !applied.has(code)) candidates.add(code)
  const electives = allocate(candidates, allEligible, credits)
  for (const result of Object.values(electives)) result.applied_courses.forEach(c => applied.add(c))

  const optionsFor = (rawCodes: Iterable<string>, selected: Set<string>): CourseOption[] =>
    [...new Set(rawCodes)].sort().map(raw => {
      const code = normalize(raw, aliases)
      return { course_id: raw, canonical_id: code, credits: credits.get(code) ?? 0, completed: completed.has(code), applied_here: selected.has(code) }
    })

  const cards: Requirement[] = []
  for (const item of requiredResults) {
    const code = item.course_id
    const rawOptions = requiredRawOptions.get(code) ?? new Set([code])
    const hours = credits.get(code) ?? 0
    cards.push({
      id: code, kind: experienceCourses.has(code) ? 'experience' : 'required',
      show_dropdown: rawOptions.size > 1, multiple: true,
      required_credits: hours, earned_credits: item.complete ? hours : 0,
      remaining_credits: item.complete ? 0 : hours, complete: item.complete,
      applied_courses: item.complete ? [code] : [],
      options: optionsFor(rawOptions, item.complete ? new Set([code]) : new Set()),
    })
  }
  for (const item of choiceResults) {
    const rawOptions = item.label.split('/')
    const earned = item.selected.reduce((sum, c) => sum + (credits.get(c) ?? 0), 0)
    cards.push({
      id: item.label, kind: 'choose_one', show_dropdown: new Set(rawOptions).size > 1, multiple: true,
      required_credits: item.required, earned_credits: earned,
      remaining_credits: Math.max(0, item.required - earned), complete: item.selected.length > 0,
      applied_courses: item.selected, options: optionsFor(rawOptions, new Set(item.selected)),
    })
  }
  for (const [name, result] of Object.entries(electives)) {
    const isCustom = name === COMPLEMENTARY
    cards.push({
      id: name, kind: 'elective', show_dropdown: true, multiple: true, ...result,
      allow_custom_courses: isCustom,
      options: isCustom
        ? customList.map(course => ({ ...course, applied_here: result.applied_courses.includes(course.course_id) }))
        : optionsFor(electiveRawOptions[name], new Set(result.applied_courses)),
    })
  }

  const unknown = [...completed].filter(code => !credits.has(code)).sort()
  const sumCredits = (codes: Iterable<string>) => { let total = 0; for (const c of codes) total += credits.get(c) ?? 0; return total }
  // A course may count toward the major AND UCC, but its hours count once.
  const degreeHoursByCourse = new Map([...applied].map(code => [code, credits.get(code) ?? 0]))
  for (const category of uccCategories) {
    // Only categories explicitly required by this degree can add degree hours.
    const target = MAJOR_CONFIG.uccTargets[category.name]
    if (!Number.isFinite(target) || target <= 0) continue
    const selected = applyWholeCourseUcc(category, code => completed.has(code))
    for (const course of selected.courses) {
      const code = toCode(course.canonical)
      if (!code || !course.applied) continue
      // Shared major/UCC courses and cross-listed aliases contribute hours once.
      degreeHoursByCourse.set(code, credits.get(code) ?? 0)
    }
  }
  const appliedAll = new Set(degreeHoursByCourse.keys())
  return {
    CPSC_BS: cards,
    degree_credits: [...degreeHoursByCourse.values()].reduce((sum, hours) => sum + hours, 0),
    applied_codes: [...appliedAll],
    total_credits: sumCredits([...completed].filter(code => credits.has(code))),
    total_credits_complete: unknown.length === 0,
    courses_missing_credit_values: unknown,
    major_checklist_complete: requiredResults.every(r => r.complete) && choiceResults.every(r => r.selected.length > 0)
      && Object.values(electives).every(r => r.complete),
    credit_requirements: { full_degree_total: DEGREE_TOTAL_CREDITS },
  }
}

/**
 * Aggie Ring + degree credit math, kept pure so it can be tested without React.
 * apHours: hours AP exams award (AP.json). apCounted: AP-covered courses with a known credit value
 * (they sit inside report.total_credits).
 */
function calculateHours(report: Report, apHours: number, apCounted: string[], otherTamuHours: number, transferHours: number) {
  const sumOf = (codes: Iterable<string>) => { let total = 0; for (const code of codes) total += creditOf(code) ?? 0; return total }
  // Courses covered by an AP exam sit inside report.total_credits, but were not earned at Texas A&M.
  const institutionHours = report.total_credits - sumOf(apCounted) + otherTamuHours // earned at Texas A&M (needs 45)
  const ringHours = institutionHours + apHours + transferHours                       // all completed hours (needs 90)
  const requiredCredits = report.credit_requirements.full_degree_total
  // AP courses already participate in the major/UCC requirement allocation.
  // Unmatched AP awards and unverified manual hours cannot add degree credit.
  const degreeEarned = report.degree_credits
  return {
    institutionHours, ringHours, requiredCredits, degreeEarned,
    ringRemaining: Math.max(0, RING_TOTAL_HOURS - ringHours),
    residentRemaining: Math.max(0, RING_RESIDENT_HOURS - institutionHours),
    degreeRemaining: Math.max(0, requiredCredits - degreeEarned),
    ringHoursMet: ringHours >= RING_TOTAL_HOURS && institutionHours >= RING_RESIDENT_HOURS,
  }
}

// =====================================================================

const panel: CSSProperties = { border: '1px solid #ddd6ce', borderRadius: 8, padding: 12, marginBottom: 12 }
const control: CSSProperties = { padding: '7px 9px', border: '1px solid #bdb5ad', borderRadius: 5, minWidth: 0 }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }

const classesKey = (user: ActiveUser) => `classes_${user.uin}`
const formatMajor = (major: string) => major.replace(/_/g, ' ')
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const toHours = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.min(MAX_EXTRA_HOURS, Math.max(0, Math.floor(number))) : 0
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function ProgressMeter({ label, current, total }: { label: string; current: number; total: number }) {
  const percentage = total > 0 ? Math.min(100, Math.max(0, current / total * 100)) : 0
  return (
    <div className="metric metric--progress">
      <div className="metric__topline">
        <span className="metric__label">{label}</span>
        <div className="progress-value" style={{ flexShrink: 0, overflow: 'visible', textOverflow: 'clip', whiteSpace: 'nowrap' }}>
          {current} <span>/ {total}</span>
        </div>
      </div>
      <div className="progress" role="progressbar" aria-label={`${label}: ${current} of ${total}`}
        aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(current, total)} aria-valuetext={`${current} of ${total}`}>
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

function SlidingText({ children }: { children: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(0)

  useLayoutEffect(() => {
    let disposed = false

    const measure = () => {
      if (
        disposed ||
        !containerRef.current ||
        !textRef.current
      ) {
        return
      }

      setOverflow(
        Math.max(
          0,
          textRef.current.scrollWidth -
            containerRef.current.clientWidth,
        ),
      )
    }

    measure()

    const observer = new ResizeObserver(measure)

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    if (textRef.current) {
      observer.observe(textRef.current)
    }

    void document.fonts?.ready.then(measure)

    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [children])

  return (
    <div className="sliding-name" ref={containerRef}>
      <span
        ref={textRef}
        className={
          overflow > 1
            ? 'sliding-name__text sliding-name__text--active'
            : 'sliding-name__text'
        }
        style={
          {
            '--name-overflow': `${overflow}px`,
          } as CSSProperties
        }
        title={children}
      >
        {children}
      </span>
    </div>
  )
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3v3m10-3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" />
    <path d="M7.5 13h2m3 0h2m3 0h.5m-10.5 3.5h2m3 0h2" />
  </svg>
}

type WcCourse = {
  id: string
  name: string
  credits: number
  designation: 'W' | 'C'
  confirmed: boolean
}

function WcCoursePanel({
  uin,
  isCompleted,
}: {
  uin: string | number
  isCompleted: (code: string) => boolean
}) {
  const [courses, setCourses] = useState<WcCourse[]>([])
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [credits, setCredits] = useState('3')
  const [designation, setDesignation] =
    useState<'W' | 'C'>('W')
  const [error, setError] = useState('')

  const storageKey = `wc_courses_${uin}`

  useEffect(() => {
    setLoaded(false)

    try {
      const saved = localStorage.getItem(storageKey)
      const parsed: unknown = saved
        ? JSON.parse(saved)
        : []

      setCourses(
        Array.isArray(parsed)
          ? parsed.filter(
              (item): item is WcCourse =>
                !!item &&
                typeof item === 'object' &&
                typeof item.id === 'string' &&
                typeof item.name === 'string' &&
                Number.isInteger(item.credits) &&
                item.credits > 0 &&
                (item.designation === 'W' ||
                  item.designation === 'C') &&
                typeof item.confirmed === 'boolean',
            )
          : [],
      )
    } catch {
      setCourses([])
    }

    setLoaded(true)
  }, [storageKey])

  useEffect(() => {
    if (!loaded) return

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(courses),
      )
    } catch {
      // Keep current entries if storage is unavailable.
    }
  }, [storageKey, loaded, courses])

  const confirmedCourses = courses.filter(
    course => course.confirmed,
  )

  const wCount = confirmedCourses.filter(
    course => course.designation === 'W',
  ).length

  const cCount = confirmedCourses.filter(
    course => course.designation === 'C',
  ).length

  const complete =
    wCount >= 2 || (wCount >= 1 && cCount >= 1)

  const addCourse = (event: FormEvent) => {
    event.preventDefault()

    const courseName = name.trim()
    const hours = Number(credits)

    if (
      !courseName ||
      !Number.isInteger(hours) ||
      hours < 1
    ) {
      setError('Enter a course and positive whole-number credits.')
      return
    }

    const identity = (value: string) =>
      value.replace(/\s+/g, '').toUpperCase()

    if (
      courses.some(
        course =>
          identity(course.name) === identity(courseName),
      )
    ) {
      setError('This course is already listed.')
      return
    }

    const code = toCode(courseName)
    const knownCredits = code
      ? creditOf(code)
      : undefined

    if (
      knownCredits !== undefined &&
      knownCredits !== hours
    ) {
      setError(
        `${code} is worth ${knownCredits} credits. Use that value.`,
      )
      return
    }

    setCourses(previous => [
      ...previous,
      {
        id: crypto.randomUUID(),
        name: courseName,
        credits: hours,
        designation,
        confirmed: false,
      },
    ])

    setName('')
    setCredits('3')
    setError('')
  }

  return (
    <>
      <p>
        {complete ? 'Complete' : 'Not complete'}
        {' · '}
        {wCount} W / {cCount} C
      </p>

      <details>
        <summary>
          Add / select courses ({courses.length})
        </summary>

        <div
          style={{
            paddingTop: 8,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          <p style={{ fontSize: 12 }}>
            Add courses approved for your major.
            Check a course after completing its W/C requirements.
          </p>

          {courses.map(course => (
            <div key={course.id} style={panel}>
              <label style={row}>
                <input
                  type="checkbox"
                  checked={course.confirmed}
                  disabled={!loaded}
                  onChange={event => {
                    const checked = event.target.checked

                    setCourses(previous =>
                      previous.map(item =>
                        item.id === course.id
                          ? { ...item, confirmed: checked }
                          : item,
                      ),
                    )
                  }}
                />

                <span>
                  {course.name} ({course.credits} cr)
                  {' · '}
                  {course.designation}
                </span>
              </label>

              {isCompleted(course.name) && (
                <small>
                  Course already recorded in your planner.
                  Confirm W/C completion separately.
                </small>
              )}

              <button
                type="button"
                style={{ ...control, marginTop: 6 }}
                onClick={() =>
                  setCourses(previous =>
                    previous.filter(
                      item => item.id !== course.id,
                    ),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}

          <form
            onSubmit={addCourse}
            style={{
              display: 'grid',
              gap: 8,
              paddingTop: 10,
            }}
          >
            <label>
              Course name or code

              <input
                style={{
                  ...control,
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                value={name}
                maxLength={160}
                onChange={event =>
                  setName(event.target.value)
                }
                required
              />
            </label>

            <label>
              Credits

              <input
                style={{
                  ...control,
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                type="number"
                min="1"
                step="1"
                value={credits}
                onChange={event =>
                  setCredits(event.target.value)
                }
                required
              />
            </label>

            <label>
              Course designation

              <select
                style={{
                  ...control,
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                value={designation}
                onChange={event =>
                  setDesignation(
                    event.target.value as 'W' | 'C',
                  )
                }
              >
                <option value="W">W — Writing</option>
                <option value="C">C — Communication</option>
              </select>
            </label>

            <button
              type="submit"
              style={control}
              disabled={!loaded}
            >
              Add course
            </button>

            {error && <p role="alert">{error}</p>}
          </form>
        </div>
      </details>
    </>
  )
}

export default function App() {
  const isMobile = useMediaQuery('(max-width: 800px)')
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null)
  const [hydrated, setHydrated] = useState(false) // true once saved classes have been loaded for the active user
  const [completed, setCompleted] = useState<string[]>([])
  const [customCourses, setCustomCourses] = useState<CustomCourse[]>([])
  const [highImpact, setHighImpact] = useState(false)
  const [otherTamuHours, setOtherTamuHours] = useState(0) // TAMU hours outside the CS BS checklist (e.g. UCC)
  const [transferHours, setTransferHours] = useState(0)   // AP / credit by exam / transfer hours
  const [customName, setCustomName] = useState('')
  const [customCredits, setCustomCredits] = useState('3')
  const [formError, setFormError] = useState('')
  const [apScores, setApScores] = useState<Record<string, number>>({})
  const [apAlternates, setApAlternates] = useState<string[]>([])
  const [apFilter, setApFilter] = useState('')
  const [uccFilters, setUccFilters] = useState<Record<string, string>>({})
    const [otherRequirements, setOtherRequirements] = useState<string[]>([])
  const [otherRequirementsLoaded, setOtherRequirementsLoaded] = useState(false)

  useEffect(() => {
    if (!activeUser) return

    setOtherRequirementsLoaded(false)

    try {
      const saved = localStorage.getItem(
        `other_requirements_${activeUser.uin}`
      )
      const parsed: unknown = saved ? JSON.parse(saved) : []

      setOtherRequirements(
        Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : []
      )
    } catch {
      setOtherRequirements([])
    }

    setOtherRequirementsLoaded(true)
  }, [activeUser])

  useEffect(() => {
    if (!activeUser || !otherRequirementsLoaded) return

    try {
      localStorage.setItem(
        `other_requirements_${activeUser.uin}`,
        JSON.stringify(otherRequirements)
      )
    } catch {
      // Keep the current selections if storage is unavailable.
    }
  }, [activeUser, otherRequirementsLoaded, otherRequirements])

  const toggleOtherRequirement = (id: string, checked: boolean) => {
    setOtherRequirements(previous =>
      checked
        ? [...new Set([...previous, id])]
        : previous.filter(item => item !== id)
    )
  }

  // 1. LOAD ACTIVE SESSION + this user's saved classes
  useEffect(() => {
    let user: ActiveUser | null = null
    try {
      const raw = localStorage.getItem('activeLoggedInUser')
      const parsed = raw ? JSON.parse(raw) : null
      if (parsed && typeof parsed === 'object' && parsed.uin !== undefined && parsed.uin !== null && parsed.uin !== '') user = parsed as ActiveUser
    } catch { user = null }

    if (!user) { window.location.href = '/index.html'; return }
    setActiveUser(user)

    try {
      const saved = localStorage.getItem(classesKey(user))
      if (saved) {
        const data = JSON.parse(saved) as Partial<SavedPlanner>
        if (Array.isArray(data.completed)) setCompleted(data.completed)
        if (Array.isArray(data.customCourses)) setCustomCourses(data.customCourses)
        if (typeof data.highImpact === 'boolean') setHighImpact(data.highImpact)
        setOtherTamuHours(toHours(data.otherTamuHours))
        setTransferHours(toHours(data.transferHours))
        if (data.apScores && typeof data.apScores === 'object') {
          setApScores(Object.fromEntries(Object.entries(data.apScores).filter(([, score]) => Number.isInteger(score) && score >= 1 && score <= 5)))
        }
        if (Array.isArray(data.apAlternates)) setApAlternates(data.apAlternates.filter((id): id is string => typeof id === 'string'))
        // ringHours and requiredCredits are recalculated below, not read back.
      }
    } catch { /* corrupted saved data: start fresh */ }
    setHydrated(true)
  }, [])

  // 2. Progress is calculated locally from the JSON files: no network request
  // AP exams -> credited courses. Those courses count as completed for the major and UCC, but are not Texas A&M hours.
  const ap = useMemo(() => evaluateAp(apTable, apScores, apAlternates, toCode), [apScores, apAlternates])
  const apCovered = useMemo(() => new Set(ap.courses.map(toCode).filter((code): code is string => code !== null)), [ap])
  const apCounted = useMemo(() => [...apCovered].filter(code => creditOf(code) !== undefined), [apCovered])
  const completedWithAp = useMemo(() => [...new Set([...completed, ...apCounted])], [completed, apCounted])
  const completedSet = useMemo(() => {
    const set = new Set<string>()
    for (const raw of completedWithAp) { const code = toCode(raw); if (code) set.add(code) }
    for (const course of customCourses) if (course.completed) { const code = customCode(course); if (code) set.add(code) }
    return set
  }, [completedWithAp, customCourses])
  const ucc = useMemo(() => {
    const result = evaluateUcc(uccTable, code => completedSet.has(toCode(code) ?? ''), MAJOR_CONFIG.uccTargets)
    const categories = result.categories.map(category => applyWholeCourseUcc(category, code => completedSet.has(code)))
    const appliedCodes = [...new Set(categories.flatMap(category => category.courses
      .filter(course => course.applied)
      .map(course => toCode(course.canonical))
      .filter((code): code is string => code !== null)))]
    return { ...result, categories, appliedCodes }
  }, [completedSet])
  const report = useMemo(() => buildReport(completedWithAp, customCourses, highImpact, ucc.categories), [completedWithAp, customCourses, highImpact, ucc])
  const requirements = report.CPSC_BS

  // 3. TAMU credit calculations (Aggie Ring + degree credits)
  const hours = useMemo(
    () => calculateHours(report, ap.hours, apCounted, otherTamuHours, transferHours),
    [report, ap, apCounted, otherTamuHours, transferHours])

  // 4. SAVE to the user-specific key whenever their classes or hours change
  useEffect(() => {
    if (!hydrated || !activeUser) return // don't overwrite saved data with empty state before loading
    try {
      const data: SavedPlanner = {
        completed, customCourses, highImpact, otherTamuHours, transferHours,
        ringHours: hours.ringHours, requiredCredits: hours.requiredCredits, apScores, apAlternates,
      }
      localStorage.setItem(classesKey(activeUser), JSON.stringify(data))
    } catch { /* storage full or unavailable */ }
  }, [hydrated, activeUser, completed, customCourses, highImpact, otherTamuHours, transferHours, apScores, apAlternates, hours.ringHours, hours.requiredCredits])

  const isCompleted = (raw: string) => completedSet.has(toCode(raw) ?? '')
  const setApScore = (examId: string, value: string) => setApScores(previous => {
    const next = { ...previous }
    const score = Number(value)
    if (!value || !Number.isInteger(score)) delete next[examId]; else next[examId] = score
    return next
  })
  const toggleApAlternate = (examId: string, checked: boolean) =>
    setApAlternates(previous => checked ? [...new Set([...previous, examId])] : previous.filter(id => id !== examId))
  const toggleCourse = (code: string, checked: boolean) => {
    const canonical = toCode(code)
    if (!canonical || apCovered.has(canonical)) return
    setCompleted(previous => {
      const next = new Set(previous.map(toCode).filter((item): item is string => item !== null))
      if (checked) next.add(canonical); else next.delete(canonical)
      return [...next]
    })
    setCustomCourses(previous => previous.map(c => customCode(c) === canonical ? { ...c, completed: checked } : c))
  }
  const toggleCustom = (course: CustomCourse, checked: boolean) => {
    const code = customCode(course)
    if (code) toggleCourse(code, checked)
    else setCustomCourses(previous => previous.map(c => c.id === course.id ? { ...c, completed: checked } : c))
  }
  const removeCustom = (course: CustomCourse) => {
    // Removing an entry is different from unchecking completion: an actual
    // course still checked in a standard requirement remains completed.
    setCustomCourses(previous => previous.filter(c => c.id !== course.id))
    const code = customCode(course)
    if (code && creditOf(code) === undefined) setCompleted(previous => previous.filter(c => c !== code))
  }
  const addCustom = (event: FormEvent) => {
    event.preventDefault()
    const name = customName.trim(); const credits = Number(customCredits)
    if (!name || !Number.isInteger(credits) || credits < 1) { setFormError('Enter a course name and positive whole-number credits.'); return }
    const identity = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
    const proposedCode = customCode({ name })
    if (customCourses.some(c => identity(c.name) === identity(name) || (proposedCode && customCode(c) === proposedCode))) {
      setFormError('This course is already in your list.'); return
    }
    const known = proposedCode ? creditOf(proposedCode) : undefined
    if (known !== undefined && known !== credits) {
      setFormError(`${proposedCode} is worth ${known} credits in the catalog. Use that value.`); return
    }
    // Appending updates state; the save effect above writes it to `classes_${activeUser.uin}`.
    setCustomCourses(previous => [...previous, { id: crypto.randomUUID(), name, credits, completed: proposedCode ? completed.some(raw => toCode(raw) === proposedCode) : false }])
    setCustomName(''); setCustomCredits('3'); setFormError('')
  }

  const renderOptions = (requirement: Requirement) => <div style={{ maxHeight: 240, overflowY: 'auto', paddingTop: 8 }}>
    {requirement.options.map(option => {
      const code = option.canonical_id ?? option.course_id
      const viaAp = apCovered.has(code)
      return <label key={option.course_id} style={row}>
        <input type="checkbox" checked={isCompleted(code)} disabled={viaAp} onChange={event => toggleCourse(code, event.target.checked)} />
        <span>{option.course_id} <small>({option.credits} cr)</small></span>
        {(viaAp || option.applied_here) && <small style={{ marginLeft: 'auto' }}>{viaAp ? (option.applied_here ? 'AP credit · Applied here' : 'AP credit') : 'Applied here'}</small>}
      </label>
    })}
  </div>

  const renderUccCourses = (category: UccCategoryResult) => {
    const filter = (uccFilters[category.name] ?? '').trim().toLowerCase()
    const shown = category.courses.filter(course => !filter || course.label.toLowerCase().includes(filter))
    return <details>
      <summary>Select completed courses ({category.courses.filter(course => course.completed).length} / {category.courses.length})</summary>
      {category.courses.length > 10 && <input style={{ ...control, display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8 }} type="search"
        placeholder="Filter courses" aria-label={`Filter ${category.name} courses`} value={uccFilters[category.name] ?? ''}
        onChange={event => setUccFilters(previous => ({ ...previous, [category.name]: event.target.value }))} />}
      <div style={{ maxHeight: 240, overflowY: 'auto', paddingTop: 8 }}>
        {shown.map(course => {
          const viaAp = apCovered.has(toCode(course.canonical) ?? '')
          return <label key={course.canonical} style={row}>
            <input type="checkbox" checked={isCompleted(course.canonical)} disabled={viaAp} onChange={event => toggleCourse(course.canonical, event.target.checked)} />
            <span>{course.label} <small>({course.credits} cr)</small></span>
            {(viaAp || course.applied) && <small style={{ marginLeft: 'auto' }}>{viaAp ? 'AP credit' : 'Applied here'}</small>}
          </label>
        })}
        {shown.length === 0 && <small>No matching courses.</small>}
      </div>
    </details>
  }

  // Nothing to show until a session is found (the redirect is already in flight otherwise).
  if (!activeUser) return null

  const apFilterText = apFilter.trim().toLowerCase()
  const apExams = apTable.exams.filter(exam => !apFilterText || exam.name.toLowerCase().includes(apFilterText))

  const displayName = activeUser.name || student.name
const displayUin = String(activeUser.uin)
const displayMajor = formatMajor(activeUser.major || student.major)
const displayYear = activeUser.year
  ? capitalize(activeUser.year)
  : student.year
const displaySemester = activeUser.sem
  ? `Semester ${activeUser.sem}`
  : activeUser.semester || student.semester

  return <main>
      <style>{`
      .requirements-column--ucc .ucc-grid {
        align-items: stretch !important;
      }

      .requirements-column--ucc .ucc-grid > .ucc-card {
        height: auto !important;
        min-height: 0 !important;
        align-self: stretch !important;
        box-sizing: border-box;
        border-bottom: 1px solid #ddd6ce;
      }
    `}</style>
    <header className="topbar">
      <div className="brand">
        <div
          className="brand__mark"
          style={{ padding: 0, border: 'none', overflow: 'hidden' }}
        >
          <img
            src="/app-logo.png"
            alt="DO logo"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
            />
        </div>
        <a className="calendar-link" href="/calendar.html"><CalendarIcon /><span>Calendar</span></a>
      </div>
      <div className="student-metrics" style={{ width: 'auto', minWidth: 0, flex: '1 1 0',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, .85fr) minmax(0, .85fr) minmax(0, .7fr) minmax(0, 1.3fr) minmax(0, 1.3fr)' }}>
        <div className="metric">
  <span className="metric__label">Student</span>
  <SlidingText>{displayName}</SlidingText>
  <span className="metric__detail">
    UIN {displayUin} · {displayMajor}
  </span>
</div>
        <div className="metric"><span className="metric__label">Academic year</span><SlidingText>{displayYear}</SlidingText><span className="metric__detail">{displaySemester}</span></div>
        <div className="metric"><span className="metric__label">Total credits</span><strong>{hours.ringHours}</strong><span className="metric__detail">hours completed</span></div>
        <ProgressMeter label="Aggie Ring" current={hours.ringHours} total={RING_TOTAL_HOURS} />
        <ProgressMeter label="Degree credits" current={hours.degreeEarned} total={hours.requiredCredits} />
      </div>
    </header>
    <section className="page-shell" aria-labelledby="page-title">
      <div className="intro">
        <div><p className="eyebrow">Degree planner</p><h1 id="page-title">Your degree at a glance</h1></div>
        <p className="intro__copy">Track completed credit and the requirements still ahead.</p>
      </div>
      {!report.total_credits_complete && <p role="alert">Total credits are incomplete. Credit values are missing for: {report.courses_missing_credit_values.join(', ')}.</p>}

      <section
        className="requirements-table"
        aria-labelledby="etam-title"
        style={{
          display: 'block',
          height: 'auto',
          minHeight: 0,
          marginBottom: 20,
        }}
      >
        <div
          className="requirements-column"
          style={{
            display: 'block',
            height: 'auto',
            minHeight: 0,
          }}
        >
          <div className="column-heading">
            <span>ETAM</span>
            <h2 id="etam-title">Entry to a Major</h2>
          </div>

          <p style={{ padding: '0 12px', fontSize: 13 }}>
            Select completed courses. This checklist tracks coursework only,
            not ETAM eligibility or GPA.
          </p>

          <div
            className="ucc-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? '1fr'
                : 'repeat(3, minmax(0, 1fr))',
              gridTemplateRows: 'auto',
              gridAutoRows: 'auto',
              height: 'auto',
              minHeight: 0,
              alignItems: 'stretch',
              alignContent: 'start',
              flex: 'none',
            }}
          >
            {etamGroups.map(group => {
              const completedCount = group.courses.filter(course =>
                course.alternatives.some(codes =>
                  codes.every(code => isCompleted(code))
                )
              ).length

              return (
                <article
                  className="ucc-card"
                  key={group.type}
                  style={{
                    display: 'block',
                    height: 'auto',
                    minHeight: 0,
                    minWidth: 0,
                  }}
                >
                  <h3>{group.label}</h3>

                  <details>
                    <summary>
                      Select completed courses ({completedCount} / {group.courses.length})
                    </summary>

                    <div
                      style={{
                        paddingTop: 10,
                        maxHeight: 260,
                        overflowY: 'auto',
                      }}
                    >
                      {group.courses.map(course => (
                        <div key={course.label} style={panel}>
                          <div style={{ marginBottom: 6 }}>
                            <strong style={{ fontSize: 14 }}>
                              {course.label}
                            </strong>
                            <small> ({course.credits} cr)</small>
                          </div>

                          {course.alternatives.flatMap(codes =>
                            codes.map(code => {
                              const viaAp = apCovered.has(code)

                              return (
                                <label key={code} style={row}>
                                  <input
                                    type="checkbox"
                                    checked={isCompleted(code)}
                                    disabled={viaAp}
                                    onChange={event =>
                                      toggleCourse(code, event.target.checked)
                                    }
                                  />
                                  <span>{code}</span>

                                  {viaAp && (
                                    <small style={{ marginLeft: 'auto' }}>
                                      AP credit
                                    </small>
                                  )}
                                </label>
                              )
                            })
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              )
            })}
          </div>
        </div>
      </section>
      <section aria-label="Credit hours summary" style={panel}>
  <div style={{
    display: 'grid',
    gap: 8,
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
  }}>
    <label>
      Other TAMU hours (total / Ring hours only)
      <input
        style={{
          ...control,
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
        }}
        type="number"
        min="0"
        max={MAX_EXTRA_HOURS}
        step="1"
        placeholder="0"
        value={otherTamuHours === 0 ? '' : otherTamuHours}
        onChange={event => setOtherTamuHours(toHours(event.target.value))}
      />
    </label>

    <label>
      Other transfer / credit-by-exam hours (total / Ring only; excluding AP below)
      <input
        style={{
          ...control,
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
        }}
        type="number"
        min="0"
        max={MAX_EXTRA_HOURS}
        step="1"
        placeholder="0"
        value={transferHours === 0 ? '' : transferHours}
        onChange={event => setTransferHours(toHours(event.target.value))}
      />
    </label>
  </div>
</section>

      <div className="requirements-table">
        <section className="requirements-column">
          <div className="column-heading"><span>01</span><h2>AP Credit</h2></div>
          <p style={{ padding: '0 12px', fontSize: 13 }}>Choose the score you earned on each AP exam. Credit counts toward your Aggie Ring total hours (not the 45 Texas A&amp;M hours) and checks off the courses it covers.</p>
          <p style={{ padding: '0 12px' }}>{ap.hours} {ap.hours === 1 ? 'hour' : 'hours'} of AP credit</p>
          <div style={{ padding: '0 12px' }}>
            <input style={{ ...control, display: 'block', width: '100%', boxSizing: 'border-box' }} type="search" placeholder="Filter AP exams"
              aria-label="Filter AP exams" value={apFilter} onChange={event => setApFilter(event.target.value)} />
          </div>
          <ul aria-label="AP Credit requirements" style={{ listStyle: 'none', margin: 0, padding: 12 }}>
            {apExams.map(exam => {
              const result = ap.byExam.get(exam.id)
              const score = apScores[exam.id]
              return <li key={exam.id} style={panel}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <label htmlFor={`ap-${exam.id}`} style={{ overflowWrap: 'anywhere' }}>{exam.name}</label>
                  <select id={`ap-${exam.id}`} style={control} value={score ?? ''} onChange={event => setApScore(exam.id, event.target.value)}>
                    <option value="">Score</option>
                    {AP_SCORES.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                {score !== undefined && (result?.award ? <>
                  <p style={{ fontSize: 12, margin: '6px 0 0' }} title={result.award.note}>
                    {result.hours} {result.hours === 1 ? 'hour' : 'hours'}{result.courses.length > 0 && ` · ${result.courses.join(', ')}`}{result.placeholder && ' · exact credit is set by your advisor'}
                  </p>
                  {result.award.alternative && <label style={row}>
                    <input type="checkbox" checked={result.usedAlternative} onChange={event => toggleApAlternate(exam.id, event.target.checked)} />
                    <small>Use the {result.award.alternative.credits}-hour option ({result.award.alternative.courses.join(', ')})</small>
                  </label>}
                  {result.overlap.length > 0 && <p style={{ fontSize: 12, margin: '4px 0 0' }}>{result.overlap.join(', ')} already credited by another exam, so those hours are not counted twice.</p>}
                </> : <p style={{ fontSize: 12, margin: '6px 0 0' }}>No credit: Texas A&amp;M starts at a score of {exam.awards[0].minScore} for this exam.</p>)}
              </li>
            })}
          </ul>
          {apExams.length === 0 && <p className="empty-state">No exams match.</p>}
        </section>
        <section className="requirements-column">
          <div className="column-heading"><span>02</span><h2>Degree (Major)</h2></div>
          <p style={{ padding: '0 12px', fontSize: 13 }}>CS BS · Major requirements. Check courses you have completed. UCC is tracked in the next column; ETAM coursework is tracked above. Degree credit is awarded only for configured major and UCC requirements.</p>
          <p style={{ padding: '0 12px' }}>{report.major_checklist_complete ? 'Major checklist complete' : 'Major checklist in progress'}</p>
          <ul aria-label="CS BS requirements" style={{ listStyle: 'none', margin: 0, padding: 12 }}>
            {requirements.map(requirement => <li key={requirement.id} style={panel}>
              <h3 style={{ fontSize: 15, margin: '0 0 6px', overflowWrap: 'anywhere' }}>{requirement.id}</h3>
              <p style={{ fontSize: 12, margin: '0 0 8px' }}>{requirement.kind === 'experience' ? (requirement.complete ? 'Completed' : 'Completion required · 0 credits')
                : `${requirement.earned_credits} / ${requirement.required_credits} credits applied · ${requirement.complete ? 'Complete' : `${requirement.remaining_credits} credits remaining`}`}</p>
              {requirement.allow_custom_courses ? <>
                <p style={{ fontSize: 12 }}>Choose courses with your advisor. Add the course name or code and its credits, then check it when completed.</p>
                <details><summary>Add / select courses ({customCourses.length})</summary>
                  {customCourses.length === 0 && <p style={{ fontSize: 12 }}>No courses added yet.</p>}
                  {customCourses.map(course => <div key={course.id} style={row}>
                    <label style={{ ...row, flex: 1 }}><input type="checkbox" checked={customCode(course) ? isCompleted(customCode(course)!) : course.completed}
                      disabled={apCovered.has(customCode(course) ?? '')}
                      onChange={event => toggleCustom(course, event.target.checked)} /><span>{course.name} ({course.credits} cr)</span></label>
                    <button type="button" style={control} aria-label={`Remove ${course.name}`} onClick={() => removeCustom(course)}>Remove</button>
                  </div>)}
                  <form onSubmit={addCustom} style={{ display: 'grid', gap: 8, paddingTop: 10 }}>
                    <label>Course name or code<input style={{ ...control, display: 'block', width: '100%', boxSizing: 'border-box' }} value={customName} maxLength={160} onChange={event => setCustomName(event.target.value)} required /></label>
                    <label>Credits<input style={{ ...control, display: 'block', width: '100%', boxSizing: 'border-box' }} type="number" min="1" step="1" value={customCredits} onChange={event => setCustomCredits(event.target.value)} required /></label>
                    <button type="submit" style={control}>Add course</button>
                    {formError && <p role="alert">{formError}</p>}
                  </form>
                </details>
              </> : requirement.kind === 'experience' ? <label style={row}><input type="checkbox" checked={highImpact} onChange={event => setHighImpact(event.target.checked)} />High-impact experience completed</label>
                : requirement.show_dropdown ? <details><summary>Select completed courses</summary>{renderOptions(requirement)}</details> : renderOptions(requirement)}
            </li>)}
          </ul>
        </section>
        <section
          className="requirements-column requirements-column--ucc"
          style={{
            display: 'block',
            height: 'auto',
            minHeight: 0,
            alignSelf: 'start',
          }}
        >
          <div className="column-heading">
            <span>03</span>
            <h2>UCC + Other Requirements</h2>
          </div>

          <div
            className="ucc-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? '1fr'
                : 'repeat(3, minmax(0, 1fr))',
              gridTemplateRows: 'none',
              gridAutoRows: 'auto',
              height: 'auto',
              minHeight: 0,
              alignItems: 'start',
              alignContent: 'start',
              flex: 'none',
            }}
          >
            {ucc.categories.map(category => (
              <article
                className="ucc-card"
                key={category.name}
                style={{
                  display: 'block',
                  height: 'auto',
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                <h3>{category.name}</h3>

                <p>
                  {category.required === null
                    ? `${category.earned} credits applied`
                    : `${category.earned} / ${category.required} credits applied · ${
                        category.complete
                          ? 'Complete'
                          : `${category.remaining} credits remaining`
                      }`}
                </p>

                {renderUccCourses(category)}
              </article>
            ))}
            {[
              {
                id: 'wc',
                title: 'Writing / Communication',
                options: [
                  { id: 'wc-first-w', label: 'First W course completed' },
                  {
                    id: 'wc-second',
                    label: 'Second W or C course completed',
                  },
                ],
              },
              {
                id: 'foreign-language',
                title: 'Foreign Language',
                options: [
                  {
                    id: 'foreign-language-complete',
                    label: 'Requirement satisfied',
                  },
                ],
              },
            ].map(requirement => {
              const done =
                requirement.id === 'foreign-language'
                  ? foreignLanguages.some(language =>
                      [
                        [101, 102],
                        [102, 201],
                        [201, 202],
                      ].some(sequence =>
                        sequence.every(level =>
                          isCompleted(
                            `${language.prefix}${level}`,
                          ),
                        ),
                      ),
                    )
                  : requirement.options.every(option =>
                      otherRequirements.includes(option.id),
                    )

              return (
                <article
                  className="ucc-card"
                  key={requirement.id}
                  style={{
                    display: 'block',
                    height: 'auto',
                    minHeight: 0,
                    minWidth: 0,
                  }}
                >
                  <h3>{requirement.title}</h3>

                  {requirement.id === 'wc' ? (
                    <WcCoursePanel
                      key={String(activeUser.uin)}
                      uin={activeUser.uin}
                      isCompleted={isCompleted}
                    />
                  ) : (
                    <>
                      <p>
                        {done ? 'Complete' : 'Not complete'}
                      </p>

                      <details>
                        <summary>
                          Select completed courses (
                          {foreignCourses.filter(course =>
                            isCompleted(course.code),
                          ).length}
                          {' / '}
                          {foreignCourses.length})
                        </summary>

                        <div
                          style={{
                            paddingTop: 8,
                            maxHeight: 260,
                            overflowY: 'auto',
                          }}
                        >
                          {foreignLanguages.map(language => (
                            <div
                              key={language.prefix}
                              style={{ marginBottom: 12 }}
                            >
                              <h4 style={{ margin: '6px 0' }}>
                                {language.name}
                              </h4>

                              {foreignCourses
                                .filter(course =>
                                  course.code.startsWith(
                                    language.prefix,
                                  ),
                                )
                                .map(course => {
                                  const code = toCode(course.code)!
                                  const viaAp = apCovered.has(code)

                                  return (
                                    <label
                                      key={course.code}
                                      style={row}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isCompleted(code)}
                                        disabled={viaAp}
                                        onChange={event =>
                                          toggleCourse(
                                            code,
                                            event.target.checked,
                                          )
                                        }
                                      />

                                      <span>
                                        {course.code}
                                        {' ('}
                                        {course.credits} cr)
                                      </span>

                                      {viaAp && (
                                        <small
                                          style={{
                                            marginLeft: 'auto',
                                          }}
                                        >
                                          AP credit
                                        </small>
                                      )}
                                    </label>
                                  )
                                })}
                            </div>
                          ))}
                        </div>
                      </details>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </section>
  </main>
}