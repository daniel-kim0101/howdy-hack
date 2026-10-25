export default function AddEventApp() {
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
            <input name="event" type="text" placeholder="Event name" required />
          </label>
          <label>
            Date
            <input name="date" type="date" required />
          </label>
          <div className="time-fields">
            <label>
              Start time
              <input name="start" type="time" />
            </label>
            <label>
              End time
              <input name="end" type="time" />
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" rows={4} placeholder="Optional details" />
          </label>
          <button type="submit">Add to calendar</button>
        </form>
      </section>
    </main>
  )
}
