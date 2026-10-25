export default function ProfileApp() {
  return (
    <main className="index-page">
      <section className="index-card" aria-labelledby="profile-title">
        <div className="brand__mark index-logo" aria-label="App logo placeholder">
          <span>LOGO</span>
        </div>
        <p className="eyebrow">Student planning portal</p>
        <h1 id="profile-title">Create your profile</h1>
        <p className="signin-intro">Enter your information to get started.</p>

        <form className="signin-form">
          <label>
            Full name
            <input
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Enter your full name"
            />
          </label>
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
          <button type="button">Create profile</button>
        </form>

        <p className="profile-prompt">
          Already have an account? <a href="/index.html">Sign in</a>
        </p>
      </section>
    </main>
  )
}
