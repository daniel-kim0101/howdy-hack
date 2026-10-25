export default function LoginApp() {
  return (
    <main className="index-page">
      <section className="index-card" aria-labelledby="index-title">
        <div className="brand__mark index-logo" aria-label="App logo placeholder">
          <span>LOGO</span>
        </div>
        <p className="eyebrow">Student planning portal</p>
        <h1 id="index-title">Welcome back</h1>
        <p className="signin-intro">Sign in to continue to your degree planner.</p>

        <form className="signin-form">
          <label>
            UIN
            <input
              type="text"
              name="uin"
              inputMode="numeric"
              autoComplete="username"
              placeholder="Enter your UIN"
            />
          </label>
          <button type="button">Sign in</button>
        </form>

        <p className="profile-prompt">
          New user? <a href="/profile.html">Create a profile</a>
        </p>
      </section>
    </main>
  )
}
