import React, { useState } from 'react';

interface StudentProfile {
  name: string;
  uin: string;
  year: string;
  sem: string;
}

export default function LoginApp() {
  const [loginUIN, setLoginUIN] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleUinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numbersOnly = e.target.value.replace(/[^0-9]/g, '');
    if (numbersOnly.length <= 9) {
      setLoginUIN(numbersOnly);
    }
  };

  const handleSignInSubmit = (e: React.FormEvent) => {
    e.preventDefault(); 
    setErrorMessage("");

    const rawDatabase = localStorage.getItem('hackathon_accounts_db');
    const accountsDatabase = rawDatabase ? JSON.parse(rawDatabase) : [];

    const matchedProfile = accountsDatabase.find((user: StudentProfile) => user.uin === loginUIN);

    if (matchedProfile) {
      localStorage.setItem('activeLoggedInUser', JSON.stringify(matchedProfile));
      alert(`Welcome back, ${matchedProfile.name}!`);
      
      // 🚀 Redirects directly to your degree page layout on success
      window.location.href = "/degree.html"; 
    } else {
      setErrorMessage("UIN not found. Please check your number or create a new profile.");
    }
  };

  return (
    <main className="index-page">
      <section className="index-card" aria-labelledby="index-title">
        <div className="brand__mark index-logo" aria-label="App logo placeholder">
          <span>LOGO</span>
        </div>
        <p className="eyebrow">Student planning portal</p>
        <h1 id="index-title">Welcome back</h1>
        <p className="signin-intro">Sign in to continue to your degree planner.</p>

        <form className="auth-form" onSubmit={handleSignInSubmit}>
          <label className="auth-field">
            UIN
            <input
              className="auth-control"
              type="text"
              name="uin"
              inputMode="numeric"
              value={loginUIN}
              onChange={handleUinChange}
              autoComplete="username"
              placeholder="Enter your UIN"
              required
            />
          </label>

          {errorMessage && (
            <p style={{ color: '#ff4d4d', fontSize: '14px', margin: '5px 0 0 0', fontWeight: '500' }}>
              {errorMessage}
            </p>
          )}

          <button className="auth-submit" type="submit">Sign in</button>
        </form>

        <p className="profile-prompt">
          New user? <a href="/profile.html">Create a profile</a>
        </p>
      </section>
    </main>
  );
}
