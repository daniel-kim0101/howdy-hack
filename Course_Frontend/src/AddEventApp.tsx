import React, { useState } from 'react';

type CalendarEvent = {
  id: string
  event: string
  date: string
  start: string
  end: string
  notes: string
  color: string
}

const DEFAULT_COLOR = '#500000' // Aggie maroon
const COLOR_CHOICES = ['#500000', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#0891b2', '#475569']

// Same per-user convention as classes_${uin} in the degree planner.
const eventsKey = (uin: string | number) => `events_${uin}`

export default function AddEventApp() {
  const [eventName, setEventName] = useState("")
  const [calendarDate, setCalendarDate] = useState("")
  const [eventStart, setEventStart] = useState("")
  const [eventEnd, setEventEnd] = useState("")
  const [calendarNotes, setCalendarNotes] = useState("")
  const [eventColor, setEventColor] = useState(DEFAULT_COLOR)

  const handleSubmit = (e: React.FormEvent) => {
    let uin: string | number | null = null
    try {
      const raw = localStorage.getItem('activeLoggedInUser')
      const user = raw ? JSON.parse(raw) : null
      if (user && user.uin !== undefined && user.uin !== null && user.uin !== '') uin = user.uin
    } catch { uin = null }

    if (uin === null) {
      e.preventDefault()
      window.location.href = '/index.html'
      return
    }

    const newEvent: CalendarEvent = {
      id: crypto.randomUUID(),
      event: eventName.trim(),
      date: calendarDate,
      start: eventStart,
      end: eventEnd,
      notes: calendarNotes,
      color: eventColor,
    }

    try {
      const saved = localStorage.getItem(eventsKey(uin))
      const parsed = saved ? JSON.parse(saved) : []
      const events: CalendarEvent[] = Array.isArray(parsed) ? parsed : []
      events.push(newEvent)
      localStorage.setItem(eventsKey(uin), JSON.stringify(events))
    } catch { /* storage full or unavailable: still continue to the calendar */ }
  }

  return (
    <main className="add-page">
      <section className="add-card" aria-labelledby="add-title">
        <a className="back-link" href="/calendar.html">← Back to calendar</a>
        <p className="eyebrow">Academic schedule</p>
        <h1 id="add-title">Add an event</h1>
        <p className="add-intro">Enter the event details below to place it on your calendar.</p>

        <form className="event-form" action="/calendar.html" method="get" onSubmit={handleSubmit}>
          <label>
            Event name
            <input name="event" type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Event name" required />
          </label>
          <label>
            Date
            <input name="date" type="date" value={calendarDate} onChange={(e) => setCalendarDate(e.target.value)} required />
          </label>
          <div className="time-fields">
            <label>
              Start time
              <input name="start" type="time" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
            </label>
            <label>
              End time
              <input name="end" type="time" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
            </label>
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ padding: 0, marginBottom: 6 }}>Color</legend>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {COLOR_CHOICES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setEventColor(c)}
                  aria-label={`Use color ${c}`}
                  aria-pressed={eventColor === c}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    padding: 0,
                    border: eventColor === c ? '3px solid #111' : '2px solid #fff',
                    boxShadow: '0 0 0 1px #aaa',
                  }}
                />
              ))}
              {/* Custom color */}
              <input
                type="color"
                value={eventColor}
                onChange={(e) => setEventColor(e.target.value)}
                aria-label="Pick a custom color"
                style={{ width: 36, height: 30, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
              />
            </div>
          </fieldset>

          <label>
            Notes
            <textarea name="notes" value={calendarNotes} onChange={(e) => setCalendarNotes(e.target.value)} rows={4} placeholder="Optional details" />
          </label>
          <button type="submit">Add to calendar</button>
        </form>
      </section>
    </main>
  )
}