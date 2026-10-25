const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const days = Array.from({ length: 35 }, (_, index) => {
  const day = index - 4
  return day > 0 && day <= 31 ? day : null
})

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3m10-3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" />
      <path d="M7.5 13h2m3 0h2m3 0h.5m-10.5 3.5h2m3 0h2" />
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

export default function CalendarApp() {
  return (
    <main>
      <header className="calendar-topbar">
        <div className="brand">
          <a className="brand__mark" href="/degree.html" aria-label="Go to degree planner">
            <span>LOGO</span>
          </a>
          <a className="calendar-link" href="/calendar.html" aria-current="page">
            <CalendarIcon />
            <span>Calendar</span>
          </a>
        </div>

        <div className="calendar-identity">
          <div className="metric">
            <span className="metric__label">Student</span>
            <strong>Daniel Kim</strong>
            <span className="metric__detail">UIN 93535</span>
          </div>
          <div className="metric">
            <span className="metric__label">Academic year</span>
            <strong>Freshman</strong>
            <span className="metric__detail">1st semester</span>
          </div>
        </div>

        <button className="add-event-button" type="button">
          <PlusIcon />
          Add event
        </button>
      </header>

      <section className="calendar-shell" aria-labelledby="calendar-title">
        <div className="calendar-toolbar">
          <div>
            <p className="eyebrow">Academic schedule</p>
            <h1 id="calendar-title">March 2025</h1>
          </div>
          <div className="month-controls" aria-label="Calendar navigation">
            <button type="button" aria-label="Previous month">←</button>
            <button type="button">Today</button>
            <button type="button" aria-label="Next month">→</button>
          </div>
        </div>

        <div className="calendar-board">
          <div className="weekday-row">
            {weekdays.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="month-grid">
            {days.map((day, index) => (
              <div
                className={`calendar-day${day === 18 ? ' calendar-day--today' : ''}`}
                key={index}
              >
                {day && <span className="day-number">{day}</span>}
                {day === 6 && <span className="event-chip">Advising</span>}
                {day === 18 && <span className="event-chip event-chip--gold">Registration</span>}
                {day === 25 && <span className="event-chip">Degree check-in</span>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
