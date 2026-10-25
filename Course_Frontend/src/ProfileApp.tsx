import React, { useState } from 'react';

interface StudentProfile {
    name: string;
    uin: string;
    year: string;
    sem: string;
}

export default function ProfileApp() {
    const [newName, setNewName] = useState("");
    const [newUIN, setNewUIN] = useState("");
    const [currYear, setCurrYear] = useState("");
    const [currSem, setCurrSem] = useState("");

    // 🔒 Enforce numbers-only and 9 digits maximum for the UIN string
    const handleUinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const cleaned = e.target.value.replace(/[^0-9]/g, '');
        if (cleaned.length <= 9) {
            setNewUIN(cleaned);
        }
    };

    const handleCreateProfileSubmit = (e: React.FormEvent) => {
        e.preventDefault(); // Prevents page reload

        if (newUIN.length !== 9) {
            alert("A valid TAMU UIN must be exactly 9 digits long!");
            return;
        }

        // 1. Bundle input data
        const profileData: StudentProfile = {
            name: newName,
            uin: newUIN,
            year: currYear,
            sem: currSem
        };

        // 2. Fetch existing database array or create an empty one if new
        const existingUsersRaw = localStorage.getItem('hackathon_accounts_db');
        const accountsDatabase = existingUsersRaw ? JSON.parse(existingUsersRaw) : [];

        // 3. Double-check if this UIN has already registered
        const uinExists = accountsDatabase.some((user: StudentProfile) => user.uin === newUIN);
        if (uinExists) {
            alert("An account with this UIN already exists! Try logging in.");
            return;
        }

        // 4. Save the new account package straight to the browser memory database
        accountsDatabase.push(profileData);
        localStorage.setItem('hackathon_accounts_db', JSON.stringify(accountsDatabase));

        // 5. Automatically mark this user as the active login session
        localStorage.setItem('activeLoggedInUser', JSON.stringify(profileData));

        alert(`Account created successfully for ${newName}! Redirecting...`);
        window.location.href = "/dashboard.html"; // Redirect straight to dashboard
    };

    return (
        <main className="index-page">
            <section className="index-card" aria-labelledby="profile-title">
                <div className="brand__mark index-logo"><span>LOGO</span></div>
                <p className="eyebrow">Student planning portal</p>
                <h1 id="profile-title">Create your profile</h1>
                <p className="signin-intro">Enter your information to get started.</p>

                {/* 🔄 Connected onSubmit to our new local database saver */}
                <form className="auth-form" onSubmit={handleCreateProfileSubmit}>
                    <label className="auth-field">
                        Full name
                        <input
                            className="auth-control"
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            required
                            placeholder="Enter your full name"
                        />
                    </label>
                    <label className="auth-field">
                        UIN
                        <input
                            className="auth-control"
                            type="text"
                            inputMode="numeric"
                            value={newUIN}
                            onChange={handleUinChange}
                            required
                            placeholder="Enter your 9-digit UIN"
                        />
                    </label>
                    <div className="auth-row">
                        <label className="auth-field">
                            Current year
                            <select className="auth-control" name="year" value={currYear} onChange={(e) => setCurrYear(e.target.value)} required>
                                <option value="" disabled>Select your year</option>
                                <option value="freshman">Freshman</option>
                                <option value="sophomore">Sophomore</option>
                                <option value="junior">Junior</option>
                                <option value="senior">Senior</option>
                            </select>
                        </label>
                        <label className="auth-field">
                            Semester
                            <select className="auth-control" name="semester" value={currSem} onChange={(e) => setCurrSem(e.target.value)} required>
                                <option value="" disabled>Select semester</option>
                                <option value="1">Semester 1</option>
                                <option value="2">Semester 2</option>
                            </select>
                        </label>
                    </div>
                    {/* 🔄 Changed to type="submit" so it fires the form action */}
                    <button className="auth-submit" type="submit">Create profile</button>
                </form>

                <p className="profile-prompt">
                    Already have an account? <a href="/index.html">Sign in</a>
                </p>
            </section>
        </main>
    );
}
