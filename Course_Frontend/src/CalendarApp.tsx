import { useEffect, useMemo, useState } from 'react'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const months = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2025, month, 1)),
)
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

// Shape written by the add-event page under `events_${uin}`.
type CalendarEvent = {
  id?: string
  event: string
  date: string
  start: string
  end: string
  notes: string
  color?: string // optional so events saved before the color picker still work
}

const DEFAULT_COLOR = '#500000'

const eventsKey = (uin: string | number) => `events_${uin}`

// Pick black or white text depending on how light the background color is.
function textColorFor(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return '#fff'
  const n = parseInt(match[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff'
}

// The logged-in user's UIN (same check as the other pages), or null if nobody is logged in.
function getUin(): string | number | null {
  try {
    const rawUser = localStorage.getItem('activeLoggedInUser')
    const user = rawUser ? JSON.parse(rawUser) : null
    if (user && user.uin !== undefined && user.uin !== null && user.uin !== '') return user.uin
  } catch { /* corrupted login data */ }
  return null
}

function readEvents(uin: string | number): CalendarEvent[] {
  try {
    const saved = localStorage.getItem(eventsKey(uin))
    const parsed = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e.date === 'string' && typeof e.event === 'string')
      : []
  } catch {
    return []
  }
}

// Events saved with an id match by id; any without one fall back to comparing every field.
const sameEvent = (a: CalendarEvent, b: CalendarEvent) =>
  a.id && b.id
    ? a.id === b.id
    : a.date === b.date && a.event === b.event && a.start === b.start && a.end === b.end && a.notes === b.notes

// Earliest start first; events with no start time go after the timed ones.
function byStartTime(a: CalendarEvent, b: CalendarEvent) {
  if (a.start && b.start) return a.start.localeCompare(b.start) || a.event.localeCompare(b.event)
  if (a.start) return -1
  if (b.start) return 1
  return a.event.localeCompare(b.event)
}

// "13:05" -> "1:05 PM"
function formatTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return ''
  const hours = Number(match[1])
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function DegreeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8 7h8m-8 4h6" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function MonthPickerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3m10-3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" />
      <path d="M7.5 13h2m3 0h2m3 0h.5m-10.5 3.5h2m3 0h2" />
    </svg>
  )
}

export default function CalendarApp() {
  // The add-event form still navigates here with ?date=..., which we use only to open the right week.
  const params = new URLSearchParams(window.location.search)
  const eventDate = params.get('date') ?? ''
  const parsedEventDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    ? new Date(`${eventDate}T12:00:00`)
    : null
  const today = new Date()
  const [focusedDate, setFocusedDate] = useState(() => parsedEventDate ?? today)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => (parsedEventDate ?? today).getFullYear())
  const [uin, setUin] = useState(getUin)
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    uin === null ? [] : readEvents(uin)
  )

  const [studentInfo, setStudentInfo] = useState({
    name: '',
    year: '',
    semester: '',
  })

  useEffect(() => {
    const updateFromStorage = () => {
      try {
        const raw = localStorage.getItem('activeLoggedInUser')
        const user = raw ? JSON.parse(raw) : null

        if (
          !user ||
          user.uin === undefined ||
          user.uin === null ||
          user.uin === ''
        ) {
          window.location.href = '/index.html'
          return
        }

        const year = String(user.year || '')

        setUin(user.uin)
        setStudentInfo({
          name: String(user.name || ''),
          year: year.charAt(0).toUpperCase() + year.slice(1),
          semester:
            user.sem !== undefined &&
            user.sem !== null &&
            user.sem !== ''
              ? `Semester ${user.sem}`
              : String(user.semester || ''),
        })

        setEvents(readEvents(user.uin))
      } catch {
        window.location.href = '/index.html'
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === 'activeLoggedInUser' ||
        event.key === eventsKey(getUin() ?? '')
      ) {
        updateFromStorage()
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateFromStorage()
      }
    }

    updateFromStorage()

    window.addEventListener('focus', updateFromStorage)
    window.addEventListener('pageshow', updateFromStorage)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('focus', updateFromStorage)
      window.removeEventListener('pageshow', updateFromStorage)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Events grouped by YYYY-MM-DD and sorted so the earliest start is at the top of each day.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) map.set(event.date, [...(map.get(event.date) ?? []), event])
    for (const list of map.values()) list.sort(byStartTime)
    return map
  }, [events])

  // Checking an event off deletes it from this user's saved events.
  const removeEvent = (target: CalendarEvent) => {
    if (uin === null) return
    // Re-read first so a change made in another tab is not overwritten.
    const remaining = readEvents(uin).filter((event) => !sameEvent(event, target))
    try {
      localStorage.setItem(eventsKey(uin), JSON.stringify(remaining))
    } catch {
      return // could not save, so keep the event on screen
    }
    setEvents(remaining)
  }

  const calendarDays = useMemo(() => {
    const weekStart = new Date(focusedDate)
    weekStart.setDate(focusedDate.getDate() - focusedDate.getDay())
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + index)
      return date
    })
  }, [focusedDate])

  const changeWeek = (amount: number) => {
    setFocusedDate((current) => {
      const next = new Date(current)
      next.setDate(current.getDate() + amount * 7)
      return next
    })
  }

  return (
    <main>
      <header className="calendar-topbar">
        <div className="brand">
          <a className="brand__mark" href="/degree.html" aria-label="Go to degree planner">
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
          </a>
          <a className="calendar-link" href="/degree.html">
            <DegreeIcon />
            <span>Degree</span>
          </a>
        </div>

        <div className="calendar-identity">
          <div className="metric">
            <span className="metric__label">Student</span>
            <strong>{studentInfo.name}</strong>
            <span className="metric__detail">
              UIN {uin}
            </span>
          </div>

          <div className="metric">
            <span className="metric__label">Academic year</span>
            <strong>{studentInfo.year}</strong>
            <span className="metric__detail">
              {studentInfo.semester}
            </span>
          </div>
        </div>

        <a className="add-event-button" href="/add.html">
          <PlusIcon />
          Add event
        </a>
      </header>

      <section className="calendar-shell" aria-labelledby="calendar-title">
        <div className="calendar-toolbar">
          <div>
            <p className="eyebrow">Academic schedule</p>
            <div className="calendar-title-row">
              <h1 id="calendar-title">{monthFormatter.format(focusedDate)}</h1>
              <button
                className="month-picker"
                type="button"
                aria-label="Choose a month"
                aria-expanded={pickerOpen}
                onClick={() => {
                  setPickerYear(focusedDate.getFullYear())
                  setPickerOpen((open) => !open)
                }}
              >
                <MonthPickerIcon />
              </button>
              {pickerOpen && (
                <div className="month-popover">
                  <div className="year-picker">
                    <button type="button" onClick={() => setPickerYear((year) => year - 1)}>
                      ←
                    </button>
                    <strong>{pickerYear}</strong>
                    <button type="button" onClick={() => setPickerYear((year) => year + 1)}>
                      →
                    </button>
                  </div>
                  <div className="month-options">
                    {months.map((monthName, month) => (
                      <button
                        type="button"
                        key={monthName}
                        onClick={() => {
                          const year = pickerYear
                          const isCurrentMonth =
                            year === today.getFullYear() && month === today.getMonth()
                          setFocusedDate(isCurrentMonth ? today : new Date(year, month, 1))
                          setPickerOpen(false)
                        }}
                      >
                        {monthName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="month-controls" aria-label="Calendar navigation">
            <button type="button" onClick={() => changeWeek(-1)} aria-label="Previous week">
              ←
            </button>
            <button
              type="button"
              onClick={() => setFocusedDate(today)}
            >
              Today
            </button>
            <button type="button" onClick={() => changeWeek(1)} aria-label="Next week">
              →
            </button>
          </div>
        </div>

        <div className="calendar-board">
          <div className="weekday-row">
            {weekdays.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="month-grid">
            {calendarDays.map((date) => {
              const key = dateKey(date)
              const outsideMonth = date.getMonth() !== focusedDate.getMonth()
              const isToday = key === dateKey(today)
              const dayEvents = eventsByDate.get(key) ?? []
              return (
                <div
                  className={[
                    'calendar-day',
                    outsideMonth ? 'calendar-day--outside' : '',
                    isToday ? 'calendar-day--today' : '',
                  ].join(' ')}
                  key={key}
                >
                  <span className="day-number">{date.getDate()}</span>
                  {dayEvents.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      {dayEvents.map((event, index) => {
                        const start = formatTime(event.start)
                        const end = formatTime(event.end)
                        const time = start && end ? `${start} – ${end}` : start || (end ? `Ends ${end}` : '')
                        const bg = event.color || DEFAULT_COLOR
                        return (
                          <label
                            className="event-chip"
                            key={event.id ?? `${key}-${index}`}
                            title={[event.event, time, event.notes].filter(Boolean).join('\n')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              background: bg,
                              color: textColorFor(bg),
                              borderRadius: 6,
                              padding: '2px 6px',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => removeEvent(event)}
                              aria-label={`Check off ${event.event}`}
                            />
                            <span>{time && `${time} `}{event.event}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}