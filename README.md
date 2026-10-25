# TAMU Academic Planner

A React and TypeScript academic planner combining a degree-progress dashboard with a personal calendar. Track Texas A&M coursework, AP credit, University Core Curriculum (UCC) requirements, degree and Aggie Ring credit-hour progress, and upcoming events.

The current implementation calculates progress for the **Computer Science BS (`CPSC_BS`)**, with a configured degree target of **126 credits**. The profile can display another major, but changing that label does not yet change the underlying degree plan.

This README describes the degree planner (`App.tsx`), calendar (`CalendarApp`), and event form (`AddEventApp`). It is a planning aid, not an official degree audit or an ETAM eligibility determination.

## Features

### Degree planner

- AP exam score dropdowns, with alternative awards when supported by the AP data.
- Shared course completion across ETAM, major, and UCC sections.
- Automatic checkmarks for courses covered by AP credit.
- Required-course, choice-group, and elective progress tracking.
- Searchable AP exams and larger UCC course lists.
- Custom complementary electives with course names and credit values.
- Whole-course UCC credit allocation, including hours above a category's minimum.
- Total, degree, and Aggie Ring credit-hour progress.
- Automatic browser-local saving for each student UIN.
- Responsive layout and navigation to the calendar.

### Calendar and events

- Sunday–Saturday weekly view with previous/next week and Today controls.
- Month/year picker for jumping to another date range.
- Events grouped by date and sorted by start time; untimed events appear last.
- Event creation with a required name and date, plus optional start/end times and notes.
- Eight preset colors, a custom color picker, and Aggie maroon as the default.
- Event text color adjusted for light or dark backgrounds.
- Event details, including notes and time range, available in hover tooltips.
- Per-student event storage and navigation between calendar and degree pages.
- Check-off controls that remove events from the calendar and saved storage.

## Required files

Keep `App.tsx` in its existing frontend location so its relative imports resolve.

| File or dependency | Purpose |
| --- | --- |
| `App.tsx` | Planner UI, shared completion state, requirement allocation, and credit calculations |
| `./creditSources.ts` | AP/UCC parsing and evaluation helpers |
| `../../Course_Data/Major.json/CPSC_BS.json` | Required CS courses, credit values, and elective categories |
| `../../Course_Data/UCC.json` | UCC courses, categories, credit values, and cross-listings |
| `../../Course_Data/AP.json` | AP exams, score thresholds, course awards, and alternative awards |
| `../../Course_Data/ETAM.json` | ETAM engineering, science, and math course groups |
| Existing project styles | Styling for the planner's CSS classes |
| `/app-logo.png` | Header logo |
| `/index.html` | Existing entry/login page |
| `/degree.html` | Degree planner page |
| `/calendar.html` | Weekly calendar page rendering `CalendarApp` |
| `/add.html` | Event creation page rendering `AddEventApp` |

Keep the calendar and event-form components in their existing project files. Their source filenames are not assumed here; the routes above come from the supplied code.

`creditSources.ts` must export `AP_SCORES`, `DEFAULT_UCC_TARGETS`, `evaluateAp`, `evaluateUcc`, `parseAp`, `parseUcc`, and the `UccCategoryResult` type.

## Getting started

1. Place the updated `App.tsx` in the existing React/TypeScript project.
2. Ensure the files above are present and the JSON imports resolve.
3. Install dependencies using the project's package manager and lockfile.
4. Run the development script defined in the project's `package.json`.
5. Open the app through its existing login/profile flow, then navigate to the degree planner.

The standalone component does not include a package manifest or build configuration. Use the repository's actual scripts; this README does not assume a particular bundler, port, or script name.

The planner expects a JSON object under `localStorage.activeLoggedInUser`, including a nonempty `uin`. It also reads `name`, `major`, `year`, and `sem` or `semester`. Without a valid session object, it redirects to `/index.html`.

## Using the planner

1. Select the score earned on each AP exam you want represented in the plan.
2. Check completed courses in the ETAM, major, or UCC sections. Matching course entries update together.
3. For AP-covered courses, change or clear the AP score to change the automatic completion state; those course checkboxes are disabled.
4. Add complementary electives using their course code or name and a positive whole-number credit value. Known course codes must use the catalog's credit value.
5. Use the two additional-hours inputs only for hours not already represented by checked courses or AP awards.

AP-derived completion is calculated separately from manually recorded completion. Removing an AP award should leave a course checked if it was independently recorded as completed.

## Using the calendar

1. Open **Calendar** from the degree planner.
2. Move between weeks with the arrows, return to the current week with **Today**, or choose a month and year.
3. Select **Add event** to open `/add.html`.
4. Enter a name and date, optionally add times and notes, and select a color.
5. Submit the form. It saves the event for the active UIN and navigates to the calendar, opening the week containing the event date.
6. Hover over an event for its full details. Check it off to delete it.

**Checking off an event deletes it; there is no completed-event archive or undo.** The current calendar does not implement event editing, recurring events, reminders, or external calendar synchronization.

The calendar uses local browser dates and times. Events are stored in `localStorage`; the `date` query parameter selects the displayed week rather than acting as the event database.

## Credit-counting rules

### Degree credits

Degree progress sums unique course hours applied to configured major or UCC requirements. Unmatched AP awards do not automatically increase degree progress.

A course may satisfy both a major requirement and a UCC requirement, but its hours contribute only once to the degree total. Course codes are normalized for spacing and capitalization, and known aliases share a canonical ID.

The major elective allocator assigns a course to at most one major elective bucket. Its allocation policy is separate from the UCC policy below.

### Whole-course UCC allocation

For each UCC category with a configured target:

1. Collect completed eligible courses and deduplicate canonical course IDs.
2. Sort by descending credit hours, breaking ties by course code.
3. Select whole courses until the accumulated hours meet or exceed the target.
4. Keep the full credit value of the final selected course.
5. Leave additional completed courses checked, but unapplied to that category.

| Required hours | Completed course hours | Applied hours |
| --- | --- | --- |
| 6 | 4, 4, 3 | 8 |
| 6 | 4, 3, 3 | 7 |
| 6 | 3, 3, 3 | 6 |
| 6 | 4 | 4, with 2 remaining |

The UCC cards and degree calculation use the same selection helper, `applyWholeCourseUcc`. Categories without configured targets do not add degree hours through the UCC allocation path.

Highest-credit-first selection is this planner's chosen policy; it is not presented as a verified TAMU degree-audit allocation algorithm. Major-specific course restrictions and approved substitutions still need to be represented in the data and rules.

### AP, total hours, and residency

AP awards contribute to the planner's total completed hours. Matching courses can satisfy configured degree requirements, but AP hours do not count as hours earned at Texas A&M.

The current Ring-hour configuration checks 90 total hours and 45 Texas A&M hours. GPA and standing are not evaluated. Reaching these hour targets does not establish Ring eligibility.

| Input | Total/Ring hours | Texas A&M hours | Degree hours |
| --- | --- | --- | --- |
| Manually checked course | Yes, when its credits are known | Assumed yes | Only when applied to a requirement |
| AP award | Yes, through AP evaluation | No | Only matching applied courses |
| Other TAMU hours | Yes | Yes | No |
| Other transfer/exam hours | Yes | No | No |

The manual-hours inputs lack course identities, so the app cannot validate their applicability or detect overlap with courses entered elsewhere.

### ETAM

ETAM entries share course completion with the rest of the planner. In ETAM labels, `/` separates alternatives and `&` requires all courses in a combination. The CHEM 107 + CHEM 117 combination is split into 3 and 1 credits when fallback credit values are needed.

ETAM adds fallback credit values for courses missing from the major/UCC catalogs. Merely appearing in ETAM does not make a course an applied degree requirement. The checklist tracks coursework, not ETAM admission eligibility or GPA.

## Saved data

Both modules use the active profile in `activeLoggedInUser`.

| Storage key | Contents |
| --- | --- |
| `activeLoggedInUser` | Active profile, including UIN |
| `classes_${uin}` | Degree planner selections and hours |
| `events_${uin}` | Calendar events for that UIN |

### Degree planner

Planner data is stored in browser `localStorage` under `classes_${uin}`. Saved fields include:

- Manually completed course IDs and custom courses.
- High-impact experience completion.
- Other TAMU and transfer hours.
- AP scores and alternative-award selections.
- Calculated Ring hours and required degree credits for convenience.

Calculated values are recomputed when the planner loads.

### Calendar events

New events have this shape:

```ts
type CalendarEvent = {
  id: string       // generated with crypto.randomUUID()
  event: string    // trimmed event name
  date: string     // YYYY-MM-DD
  start: string    // HH:mm, or an empty string
  end: string      // HH:mm, or an empty string
  notes: string
  color: string    // hex color; default #500000
}
```

The calendar also reads older events without IDs or colors. Deletion matches by ID when available, falling back to the event fields for older records. Before deletion, it re-reads saved events to reduce the risk of overwriting changes from another tab; this is not live cross-tab synchronization.

Browser-local storage does not provide server synchronization or secure account isolation. Clearing site data removes the saved planner state.

## Known limitations and next steps

- **Major and catalog selection:** select the actual requirement dataset and catalog year from the student profile instead of using the hardcoded CPSC plan.
- **First-year requirements:** ensure required first-year courses are explicitly represented in degree allocation. ETAM-only courses can currently contribute total hours without contributing degree hours.
- **Transfer equivalencies:** store course-level transfer sources and equivalencies instead of relying only on aggregate hours.
- **Grades and prerequisites:** completion flags do not enforce minimum grades, GPA, or prerequisite sequences.
- **Elective approval:** custom complementary electives are accepted by the app without verification of departmental approval.
- **Graduation requirements:** degree residency, upper-level residency, foreign-language requirements, and writing/communication designations are not fully modeled.
- **Cross-category policies:** review UCC and ICD/CD overlap rules against the selected catalog. Unique degree-hour counting does not itself validate whether every shared requirement is permissible.
- **Data maintenance:** AP awards, course credits, aliases, and approved elective lists depend on the supplied JSON files and helper implementation.

A full degree-credit meter or a completed major checklist does not mean all graduation requirements have been met.

### Calendar limitations

- The displayed student identity is currently hardcoded even though event storage uses the active UIN.
- The event form redirects to the entry page when no active UIN exists; the calendar itself displays an empty event list without that redirect.
- Start/end ordering and scheduling conflicts are not validated.
- If saving a new event fails, the form still navigates to the calendar without showing an error.
- The form uses a GET submission, so named event fields, including notes, appear in the destination URL. A future update should navigate with only the date after saving successfully.
- Changes from other tabs are not automatically refreshed on screen.

## Validation

The latest calculation changes passed 19 focused scenarios using fixture data. Coverage included whole-course UCC overflow, descending-credit selection, duplicate course IDs, major/UCC overlap, AP hours, and ETAM fallback credits.

These were isolated development checks, not a full application build or end-to-end test against the actual JSON catalogs and `creditSources.ts`.

Before merging into the full project, run its build/type checks and verify:

- AP Calculus BC awards check the corresponding MATH 151/152 entries everywhere.
- Clearing an AP score removes only AP-derived completion.
- Two eligible 4-credit UCC courses show 8 applied hours for a 6-hour target.
- Surplus courses remain completed without increasing the category's applied hours.
- A course shared by the major and UCC adds its hours once to degree progress.
- Reloading restores the correct student's selections.
- Calendar navigation handles weeks spanning months and years.
- New events retain their date, times, notes, and selected color after a reload.
- Events for one UIN do not appear under another UIN's storage key.
- Timed events sort before untimed events.
- Checking off an event removes it from saved storage.
- Degree/calendar navigation remains intact.

Calendar behavior above was documented from the supplied source; it has not been verified through an end-to-end browser run.

## Reference material

Use the catalog applicable to the student when validating rules:

- [Texas A&M Computer Science BS requirements](https://catalog.tamu.edu/undergraduate/engineering/computer-science/bs/)
- [Texas A&M University Core Curriculum](https://catalog.tamu.edu/undergraduate/general-information/university-core-curriculum/)
- [Texas A&M Degree and Program Information](https://catalog.tamu.edu/undergraduate/general-information/degree-information/)
