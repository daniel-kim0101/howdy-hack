import { useEffect, useRef, useState, type CSSProperties } from 'react'

type StudentProfile = {
  name: string
  uin: string
  year: string
  semester: string
  ringHours: number
  earnedCredits: number
  requiredCredits: number
}

// Replace this object with data from your JavaScript program when it is ready.
const student: StudentProfile = {
  name: 'Daniel Kim',
  uin: '93535',
  year: 'Freshman',
  semester: '1st semester',
  ringHours: 33,
  earnedCredits: 33,
  requiredCredits: 126,
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

function ProgressMeter({
  label,
  current,
  total,
}: {
  label: string
  current: number
  total: number
}) {
  const percentage = Math.min(100, Math.max(0, (current / total) * 100))

  return (
    <div className="metric metric--progress">
      <div className="metric__topline">
        <span className="metric__label">{label}</span>
        <div
          className="progress-value"
          style={{
            flexShrink: 0,
            overflow: 'visible',
            textOverflow: 'clip',
            whiteSpace: 'nowrap',
          }}
        >
          {current} <span>/ {total}</span>
        </div>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label={`${label}: ${current} of ${total}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
      >
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
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    // observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [children])

  return (
    <div className="sliding-name" ref={containerRef}>
      <span
        ref={textRef}
        className="sliding-name__text sliding-name__text--active"
        style={{ '--name-overflow': `${overflow}px` } as CSSProperties}
      >
        {children}
      </span>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3m10-3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" />
      <path d="M7.5 13h2m3 0h2m3 0h.5m-10.5 3.5h2m3 0h2" />
    </svg>
  )
}

export default function App() {
  const isMobile = useMediaQuery('(max-width: 800px)')

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark" aria-label="App logo placeholder">
            <span>LOGO</span>
          </div>
          <a className="calendar-link" href="/calendar.html">
            <CalendarIcon />
            <span>Calendar</span>
          </a>
        </div>

        <div
          className="student-metrics"
          style={{
            width: 'auto',
            minWidth: 0,
            flex: '1 1 0',
            gridTemplateColumns: isMobile
              ? '1fr'
              : 'minmax(0, .85fr) minmax(0, .85fr) minmax(0, .7fr) minmax(0, 1.3fr) minmax(0, 1.3fr)',
          }}
        >
          <div className="metric">
            <span className="metric__label">Student</span>
            <SlidingText>{student.name}</SlidingText>
            <span className="metric__detail">UIN {student.uin}</span>
          </div>

          <div className="metric">
            <span className="metric__label">Academic year</span>
            <SlidingText>{student.year}</SlidingText>
            <span className="metric__detail">{student.semester}</span>
          </div>

          <div className="metric">
            <span className="metric__label">Total credits</span>
            <strong>{student.earnedCredits}</strong>
            <span className="metric__detail">hours completed</span>
          </div>

          <ProgressMeter label="Aggie Ring" current={student.ringHours} total={90} />
          <ProgressMeter
            label="Degree credits"
            current={student.earnedCredits}
            total={student.requiredCredits}
          />
        </div>
      </header>

      <section className="page-shell" aria-labelledby="page-title">
        <div className="intro">
          <div>
            <p className="eyebrow">Degree planner</p>
            <h1 id="page-title">Your degree at a glance</h1>
          </div>
          <p className="intro__copy">
            Track completed credit and the requirements still ahead.
          </p>
        </div>

        <div className="requirements-table">
          {['AP Credit', 'Degree (Major)'].map((column, index) => (
            <section className="requirements-column" key={column}>
              <div className="column-heading">
                <span>0{index + 1}</span>
                <h2>{column}</h2>
              </div>
              <ul aria-label={`${column} requirements`}></ul>
              <p className="empty-state">Requirements will appear here.</p>
            </section>
          ))}
          <section className="requirements-column requirements-column--ucc">
            <div className="column-heading">
              <span>03</span>
              <h2>UCC + Other Requirements</h2>
            </div>
            <div className="ucc-grid">
              {Array.from({ length: 12 }, (_, index) => (
                <article className="ucc-card" key={index}>
                  <h3>UCC Name</h3>
                  <p>Requirements will appear here.</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
