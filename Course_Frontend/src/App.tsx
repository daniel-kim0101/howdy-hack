import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'

type StudentProfile = {
  name: string; uin: string; year: string; semester: string
  ringHours: number; requiredCredits: number
}
const student: StudentProfile = {
  name: 'Daniel Kim', uin: '93535', year: 'Freshman', semester: '1st semester',
  ringHours: 33, requiredCredits: 126,
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
  requirements_list: string; CPSC_BS: Requirement[]
  degree_credits: number; total_credits: number; total_credits_complete: boolean
  courses_missing_credit_values: string[]; major_checklist_complete: boolean
  credit_requirements: { full_degree_total: number }
}
type CustomCourse = { id: string; name: string; credits: number; completed: boolean }

// No Vite config change is required when using an explicit API URL.
// Empty value also supports a future /api development proxy.
const API_BASE = '' // Uses the /api proxy already configured in vite.config.ts.
const panel: CSSProperties = { border: '1px solid #ddd6ce', borderRadius: 8, padding: 12, marginBottom: 12 }
const control: CSSProperties = { padding: '7px 9px', border: '1px solid #bdb5ad', borderRadius: 5, minWidth: 0 }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }

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
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current || !textRef.current) return
      setOverflow(Math.max(0, textRef.current.scrollWidth - containerRef.current.clientWidth))
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [children])
  return <div className="sliding-name" ref={containerRef}>
    <span ref={textRef} className="sliding-name__text sliding-name__text--active"
      style={{ '--name-overflow': `${overflow}px` } as CSSProperties}>{children}</span>
  </div>
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3v3m10-3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" />
    <path d="M7.5 13h2m3 0h2m3 0h.5m-10.5 3.5h2m3 0h2" />
  </svg>
}

export default function App() {
  const isMobile = useMediaQuery('(max-width: 800px)')
  const [completed, setCompleted] = useState<string[]>([])
  const [customCourses, setCustomCourses] = useState<CustomCourse[]>([])
  const [highImpact, setHighImpact] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [customName, setCustomName] = useState('')
  const [customCredits, setCustomCredits] = useState('3')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setBusy(true); setError('')
      try {
        const isEmpty = !completed.length && !customCourses.length && !highImpact
        const response = await fetch(`${API_BASE}/api/cpsc-bs/${isEmpty ? 'requirements' : 'check'}`, {
          method: isEmpty ? 'GET' : 'POST', signal: controller.signal,
          ...(isEmpty ? {} : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed_courses: completed, high_impact_confirmed: highImpact,
              complementary_courses: customCourses.map(({ name, credits, completed: checked }) => ({ name, credits, completed: checked })) }),
          }),
        })
        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) throw new Error('API did not return JSON. Check VITE_API_BASE_URL and restart the frontend.')
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? `API error ${response.status}`)
        if (!Array.isArray(data.CPSC_BS)) throw new Error('API response does not contain the CPSC_BS requirement list.')
        if (!controller.signal.aborted) setReport(data as Report)
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to connect to the API.')
      } finally {
        if (!controller.signal.aborted) setBusy(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [completed, customCourses, highImpact, retry])

  const requirements = report?.CPSC_BS ?? []
  const canonical = (value: string) => {
    const cleaned = value.replace(/\s+/g, '').toUpperCase()
    for (const requirement of requirements) {
      if (requirement.allow_custom_courses) continue
      const option = requirement.options.find(o => o.course_id === cleaned)
      if (option) return option.canonical_id ?? option.course_id
    }
    return cleaned
  }
  const customCode = (course: CustomCourse) => {
    const value = course.name.replace(/\s+/g, '').toUpperCase()
    return /^[A-Z]+\d{3}$/.test(value) ? canonical(value) : null
  }
  const isCompleted = (code: string) => completed.includes(code) || customCourses.some(c => c.completed && customCode(c) === code)
  const toggleCourse = (code: string, checked: boolean) => {
    setCompleted(previous => checked ? [...new Set([...previous, code])] : previous.filter(c => c !== code))
    setCustomCourses(previous => previous.map(c => customCode(c) === code ? { ...c, completed: checked } : c))
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
    const existsInCatalog = code && requirements.some(r => !r.allow_custom_courses && r.options.some(o => (o.canonical_id ?? o.course_id) === code))
    if (code && !existsInCatalog) setCompleted(previous => previous.filter(c => c !== code))
  }
  const addCustom = (event: FormEvent) => {
    event.preventDefault()
    const name = customName.trim(); const credits = Number(customCredits)
    if (!name || !Number.isInteger(credits) || credits < 1) { setFormError('Enter a course name and positive whole-number credits.'); return }
    const identity = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
    const proposedCode = customCode({ id: '', name, credits, completed: false })
    if (customCourses.some(c => identity(c.name) === identity(name) || (proposedCode && customCode(c) === proposedCode))) {
      setFormError('This course is already in your list.'); return
    }
    setCustomCourses(previous => [...previous, { id: crypto.randomUUID(), name, credits, completed: proposedCode ? isCompleted(proposedCode) : false }])
    setCustomName(''); setCustomCredits('3'); setFormError('')
  }

  const renderOptions = (requirement: Requirement) => <div style={{ maxHeight: 240, overflowY: 'auto', paddingTop: 8 }}>
    {requirement.options.map(option => {
      const code = option.canonical_id ?? option.course_id
      return <label key={option.course_id} style={row}>
        <input type="checkbox" checked={isCompleted(code)} onChange={event => toggleCourse(code, event.target.checked)} />
        <span>{option.course_id} <small>({option.credits} cr)</small></span>
        {option.applied_here && !busy && !error && <small style={{ marginLeft: 'auto' }}>Applied here</small>}
      </label>
    })}
  </div>

  return <main>
    <header className="topbar">
      <div className="brand">
        <div className="brand__mark" aria-label="App logo placeholder"><span>LOGO</span></div>
        <a className="calendar-link" href="/calendar.html"><CalendarIcon /><span>Calendar</span></a>
      </div>
      <div className="student-metrics" aria-busy={busy} style={{ width: 'auto', minWidth: 0, flex: '1 1 0',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, .85fr) minmax(0, .85fr) minmax(0, .7fr) minmax(0, 1.3fr) minmax(0, 1.3fr)' }}>
        <div className="metric"><span className="metric__label">Student</span><SlidingText>{student.name}</SlidingText><span className="metric__detail">UIN {student.uin}</span></div>
        <div className="metric"><span className="metric__label">Academic year</span><SlidingText>{student.year}</SlidingText><span className="metric__detail">{student.semester}</span></div>
        <div className="metric"><span className="metric__label">Total credits</span><strong>{report ? report.total_credits : '—'}</strong><span className="metric__detail">hours completed</span></div>
        <ProgressMeter label="Aggie Ring" current={student.ringHours} total={90} />
        <ProgressMeter label="Degree credits" current={report?.degree_credits ?? 0} total={report?.credit_requirements.full_degree_total ?? student.requiredCredits} />
      </div>
    </header>
    <section className="page-shell" aria-labelledby="page-title">
      <div className="intro">
        <div><p className="eyebrow">Degree planner</p><h1 id="page-title">Your degree at a glance</h1></div>
        <p className="intro__copy">Track completed credit and the requirements still ahead.</p>
      </div>
      <p role="status" aria-live="polite">{busy ? 'Updating CS BS progress…' : error ? 'Progress could not be updated.' : 'CS BS progress updated.'}</p>
      {error && <div role="alert" style={panel}><p>{error}</p><button type="button" style={control} onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
      {report && !report.total_credits_complete && <p role="alert">Total credits are incomplete. Credit values are missing for: {report.courses_missing_credit_values.join(', ')}.</p>}
      <div className="requirements-table">
        <section className="requirements-column">
          <div className="column-heading"><span>01</span><h2>AP Credit</h2></div>
          <ul aria-label="AP Credit requirements"></ul><p className="empty-state">Requirements will appear here.</p>
        </section>
        <section className="requirements-column">
          <div className="column-heading"><span>02</span><h2>Degree (Major)</h2></div>
          <p style={{ padding: '0 12px', fontSize: 13 }}>CS BS · Major requirements only. Check courses you have completed. UCC and first-year requirements are not included yet.</p>
          {report && <p style={{ padding: '0 12px' }}>{report.major_checklist_complete ? 'Major checklist complete' : 'Major checklist in progress'}</p>}
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
        <section className="requirements-column requirements-column--ucc">
          <div className="column-heading"><span>03</span><h2>UCC + Other Requirements</h2></div>
          <div className="ucc-grid">{Array.from({ length: 12 }, (_, index) => <article className="ucc-card" key={index}><h3>UCC Name</h3><p>Requirements will appear here.</p></article>)}</div>
        </section>
      </div>
    </section>
  </main>
}