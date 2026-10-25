import { useEffect, useMemo, useState } from 'react'

type StudentProfile = {
  name: string
  uin: string
  major: string
  year: string
  semester: string
}

type ActiveUser = {
  name?: string
  uin?: string | number
  major?: string
  year?: string
  sem?: string | number
  semester?: string
}

const fallbackStudent: StudentProfile = {
  name: 'Daniel Kim',
  uin: '93535',
  major: 'CPSC_BS',
  year: 'Freshman',
  semester: '1st semester',
}

const formatMajor = (major: string) => major.replace(/_/g, ' ')
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const months = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2025, month, 1)),
)
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

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
    </svg>
  )
}

export default function CalendarApp() {
  const [student, setStudent] = useState(fallbackStudent)
  const params = new URLSearchParams(window.location.search)
  const eventDate = params.get('date') ?? ''
  const eventTitle = params.get('event') ?? ''
  const parsedEventDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    ? new Date(`${eventDate}T12:00:00`)
    : null
  const today = new Date()
  const [focusedDate, setFocusedDate] = useState(() => parsedEventDate ?? today)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => (parsedEventDate ?? today).getFullYear())

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('activeLoggedInUser')
      if (!savedUser) return

      const activeUser = JSON.parse(savedUser) as ActiveUser
      setStudent((current) => ({
        name: activeUser.name || current.name,
        uin:
          activeUser.uin === undefined || activeUser.uin === null
            ? current.uin
            : String(activeUser.uin),
        major: activeUser.major || current.major,
        year: activeUser.year ? capitalize(activeUser.year) : current.year,
        semester:
          activeUser.sem !== undefined && activeUser.sem !== ''
            ? `Semester ${activeUser.sem}`
            : activeUser.semester || current.semester,
      }))
    } catch {
      // Keep fallback values if the saved profile is missing or invalid.
    }
  }, [])

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
            <img src="/app-logo.png" alt="" />
          </a>
          <a className="calendar-link" href="/degree.html">
            <DegreeIcon />
            <span>Degree</span>
          </a>
        </div>

        <div className="calendar-identity">
          <div className="metric">
            <span className="metric__label">Student</span>
            <strong>{student.name}</strong>
            <span className="metric__detail">
              UIN {student.uin} · {formatMajor(student.major)}
            </span>
          </div>
          <div className="metric">
            <span className="metric__label">Academic year</span>
            <strong>{student.year}</strong>
            <span className="metric__detail">{student.semester}</span>
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
                  {eventTitle && key === eventDate && (
                    <span className="event-chip">{eventTitle}</span>
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
