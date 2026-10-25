import React, { useState } from 'react';
import { EventEmitter } from 'stream';

export default function AddEventApp() {

  // Creating reader and writer variables for inputs
  const [eventName, setEventName] = useState("")
  const [calendarDate, setCalendarDate] = useState("")
  const [eventStart, setEventStart] = useState("")
  const [eventEnd, setEventEnd] = useState("")
  const [calendarNotes, setCalendarNotes] = useState("")

  // Handling user input
  const handleSubmitButton = () => {
    const newEvent = {
      event : eventName,
      date : calendarDate,
      start : eventStart,
      end : eventEnd,
      notes : calendarNotes
    }
    
  }

  return (
    <main className="add-page">
      <section className="add-card" aria-labelledby="add-title">
        <a className="back-link" href="/calendar.html">← Back to calendar</a>
        <p className="eyebrow">Academic schedule</p>
        <h1 id="add-title">Add an event</h1>
        <p className="add-intro">Enter the event details below to place it on your calendar.</p>

        <form className="event-form" action="/calendar.html" method="get">
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
          <label>
            Notes
            <textarea name="notes" value={calendarNotes} onChange={(e) => setCalendarNotes(e.target.value)} rows={4} placeholder="Optional details" />
          </label>
          <button type="submit" onClick={handleSubmitButton}>Add to calendar</button>
        </form>
      </section>
    </main>
  )
}