import React, { useState } from 'react';

interface StudentProfile {
    name: string;
    uin: string;
    year: string;
    sem: string;
}

interface SavedPlanner {
    completed: string[];
    customCourses: { id: string; name: string; credits: number; completed: boolean }[];
    highImpact: boolean;
    otherTamuHours: number;
    transferHours: number;
    ringHours: number;
    requiredCredits: number;
}

// Set to true to also download a real "<UIN>.json" file to the user's computer on signup.
const DOWNLOAD_JSON_FILE = false;

const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

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
        let accountsDatabase: StudentProfile[] = [];
        try {
            const existingUsersRaw = localStorage.getItem('hackathon_accounts_db');
            accountsDatabase = existingUsersRaw ? JSON.parse(existingUsersRaw) : [];
        } catch {
            accountsDatabase = [];
        }

        // 3. Double-check if this UIN has already registered
        const uinExists = accountsDatabase.some((user: StudentProfile) => user.uin === newUIN);
        if (uinExists) {
            alert("An account with this UIN already exists! Try logging in.");
            return;
        }

        // 4. Save the new account package straight to the browser memory database
        accountsDatabase.push(profileData);
        localStorage.setItem('hackathon_accounts_db', JSON.stringify(accountsDatabase));

        // 5. Create this user's own JSON records (their "UIN.json" equivalents)
        //    profile_<UIN>  -> their profile object
        //    classes_<UIN>  -> their Degree Planner data (only created if it doesn't exist yet)
        localStorage.setItem(`profile_${newUIN}`, JSON.stringify(profileData));
        if (localStorage.getItem(`classes_${newUIN}`) === null) {
            const emptyPlanner: SavedPlanner = {
                completed: [], customCourses: [], highImpact: false,
                otherTamuHours: 0, transferHours: 0, ringHours: 0, requiredCredits: 126,
            };
            localStorage.setItem(`classes_${newUIN}`, JSON.stringify(emptyPlanner));
        }

        // Optional: also download a real file named "<UIN>.json"
        if (DOWNLOAD_JSON_FILE) {
            downloadJson(`${newUIN}.json`, profileData);
        }

        // 6. Automatically mark this user as the active login session
        localStorage.setItem('activeLoggedInUser', JSON.stringify(profileData));

        alert(`Account created successfully for ${newName}! Redirecting...`);
        window.location.href = "/dashboard.html"; // Redirect straight to dashboard
    };

    return (
        <main className="index-page">
            <section className="index-card" aria-labelledby="profile-title">
                <div className="brand__mark index-logo"
                >
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
                    </div>
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