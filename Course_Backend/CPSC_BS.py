"""CS BS major-only checklist using the student's existing course JSON.

No Flask dependency. Import check_major() from a future Flask route.
Does NOT evaluate UCC, AP conversions, ETAM eligibility, GPA, prerequisites,
residency, W/C, or university-wide graduation eligibility.
The supplied elective lists are used as data, not certified as approved lists.

Run from the repository root:
    python Course_Backend/CPSC_BS.py --completed CSCE120 STAT211
Or supply a JSON file containing a list of completed course codes:
    python Course_Backend/CPSC_BS.py --student completed.json

Complementary courses are student-entered names, credits and completed flags.
Advisor approval is handled outside this app, not verified by the checker.
High-impact completion needs confirmation.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "Course_Data" / "Major.json" / "CPSC_BS.json"

# CS BS, 2026-2027. These are requirements, not the student's earned credits.
# UCC/first-year requirements are outside this module's checked scope.
CS_BS_SYSTEMS_REQUIRED_CREDITS = 3
CS_BS_SOFTWARE_LANGUAGES_REQUIRED_CREDITS = 3
CS_BS_INFORMATION_APPLICATIONS_REQUIRED_CREDITS = 3
CS_BS_UPPER_LEVEL_REQUIRED_CREDITS = 9
CS_BS_CS_ELECTIVES_REQUIRED_CREDITS = (
    CS_BS_SYSTEMS_REQUIRED_CREDITS + CS_BS_SOFTWARE_LANGUAGES_REQUIRED_CREDITS
    + CS_BS_INFORMATION_APPLICATIONS_REQUIRED_CREDITS + CS_BS_UPPER_LEVEL_REQUIRED_CREDITS
)  # 18; subtotal, never added again on top of its four parts.
CS_BS_SCIENCE_REQUIRED_CREDITS = 7
CS_BS_COMPLEMENTARY_REQUIRED_CREDITS = 9
CS_BS_HIGH_IMPACT_REQUIRED_CREDITS = 0  # Still requires completion.
CS_BS_DEGREE_TOTAL_REQUIRED_CREDITS = 126  # Full degree; not checked here.

TARGETS = {
    "Systems Electives": CS_BS_SYSTEMS_REQUIRED_CREDITS,
    "Software and Languages Electives": CS_BS_SOFTWARE_LANGUAGES_REQUIRED_CREDITS,
    "Information and Applications Electives": CS_BS_INFORMATION_APPLICATIONS_REQUIRED_CREDITS,
    "Upper-level Computer Science and Engineering Electives": CS_BS_UPPER_LEVEL_REQUIRED_CREDITS,
    "Science Elective": CS_BS_SCIENCE_REQUIRED_CREDITS,
    "Complementary Elective": CS_BS_COMPLEMENTARY_REQUIRED_CREDITS,
}


def _progress(required, earned, complete):
    return {"required_credits": required, "earned_credits": earned,
            "remaining_credits": max(0, required - earned), "complete": complete}


def normalize(code, aliases=None):
    """CSCE 120, csce120 -> CSCE120; known cross-listings share one ID."""
    if not isinstance(code, str):
        raise ValueError("Course codes must be strings.")
    code = re.sub(r"\s+", "", code).upper()
    if not re.fullmatch(r"[A-Z]+[0-9]{3}", code):
        raise ValueError(f"Use one actual course code, not a group: {code!r}")
    return (aliases or {}).get(code, code)


def _aliases_from_data(data):
    """Read cross-listed pairs from the user's individual upper-level entries.

    This matches THIS JSON's convention: two-code upper-level entries are
    cross-listings; long track lists and required choice groups are choices.
    No independent course list is stored in Python.
    """
    aliases = {}
    for key, info in data.items():
        if not isinstance(info, dict):
            raise ValueError(f"Invalid entry: {key}")
        if (info.get("elective") == "yes" and
                info.get("elective_type") == "Upper-level Computer Science and Engineering Electives"):
            codes = key.split("/")
            if len(codes) == 2:
                first = normalize(codes[0])
                for code in codes:
                    aliases[normalize(code)] = first
    return aliases


def _credits(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError("Credits must be a nonnegative integer.")
    return value


def _custom_id(record, aliases=None):
    if record.get("course_id"):
        return normalize(record["course_id"], aliases)
    name = record.get("name", "")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Custom complementary courses need a name.")
    try:
        return normalize(name, aliases)
    except ValueError:
        identity = " ".join(name.casefold().split())
        return "CUSTOM:" + hashlib.sha256(identity.encode()).hexdigest()[:20]


def _load(path):
    # Reject duplicate keys: ordinary json.load would silently discard data.
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    with Path(path).open(encoding="utf-8") as file:
        data = json.load(file, object_pairs_hook=unique_pairs)
    if not isinstance(data, dict):
        raise ValueError("Major JSON must be an object keyed by course/group.")
    return data


def _parse(data, aliases=None):
    required, choices, credits = [], [], {}
    eligible = {name: set() for name in TARGETS}
    for key, info in data.items():
        if key == "COMPLEMENTARY_ELECTIVE":
            continue  # Requirement, not a nine-credit course.
        if not isinstance(info, dict):
            raise ValueError(f"Invalid entry: {key}")
        codes = sorted({normalize(code, aliases) for code in key.split("/")})
        hours = _credits(info.get("credits"))
        for code in codes:
            if code in credits and credits[code] != hours:
                raise ValueError(f"Conflicting credit values for {code}")
            credits[code] = hours
        flag = info.get("elective")
        if flag == "no":
            if len(codes) == 1:
                required.append(codes[0])
            else:
                choices.append((key, codes))
        elif flag == "yes":
            name = info.get("elective_type")
            if name not in eligible:
                raise ValueError(f"Unknown elective type for {key}: {name}")
            eligible[name].update(codes)
        else:
            raise ValueError(f"{key}: elective must be 'yes' or 'no'.")
    return sorted(set(required)), choices, credits, eligible


def _allocate(candidates, eligible, credits):
    """Exact capped-state DP: each course is used at most once across buckets.

    Handles overlapping eligibility without greedy assignment failures.
    A bucket needs a minimum, and retains full credits of selected courses.
    Prefers most completed buckets, then most covered credits, then least
    actual credit used. Result is a deterministic suggestion, not an audit.
    """
    names = list(eligible)
    targets = tuple(TARGETS[name] for name in names)
    zero = (0,) * len(names)
    states = {zero: (0, ())}
    for code in sorted(candidates):
        hours = credits[code]
        if not hours:
            continue
        updates = dict(states)
        for state, (cost, assignments) in states.items():
            for i, name in enumerate(names):
                if code not in eligible[name] or state[i] >= targets[i]:
                    continue
                new = list(state)
                new[i] = min(targets[i], state[i] + hours)
                new = tuple(new)
                proposal = (cost + hours, assignments + ((code, name),))
                old = updates.get(new)
                if old is None or proposal < old:
                    updates[new] = proposal
        states = updates
    best = max(states, key=lambda state: (
        sum(a == b for a, b in zip(state, targets)),
        sum(state), -states[state][0]
    ))
    result = {}
    assignments = states[best][1]
    for i, name in enumerate(names):
        selected = [code for code, bucket in assignments if bucket == name]
        result[name] = {
            "required_credits": targets[i],
            "earned_credits": sum(credits[code] for code in selected),
            "remaining_credits": targets[i] - best[i],
            "complete": best[i] == targets[i],
            "applied_courses": selected,
        }
    return result


def check_major(completed_courses, catalog_path=None, *,
                complementary_courses=None, high_impact_confirmed=False,
                course_credits=None):
    """Return a JSON-compatible major-only progress report.

    completed_courses: iterable of actual course codes, e.g. ['CSCE 120'].
    Pass ONLY successfully completed/credited courses, not planned courses.
    complementary_courses: student-entered records, for example
      [{'name': 'Abstract Algebra', 'credits': 3, 'completed': True}].
    Optional course_id (e.g. MATH401) links a custom entry to shared course
    completion and prevents reuse elsewhere. Advisor approval is not verified.
    course_credits: optional mapping for courses outside the major JSON,
      e.g. {'HIST105': 3}; these can contribute to total_credits without
    satisfying a major requirement. Only completed courses are totaled.
    degree_credits is scoped to the major requirements checked here.
    """
    if isinstance(completed_courses, (str, bytes, dict)):
        raise ValueError("completed_courses must be a list of course codes.")
    if not isinstance(high_impact_confirmed, bool):
        raise ValueError("high_impact_confirmed must be a boolean.")
    catalog_path = Path(catalog_path or DEFAULT_CATALOG)
    data = _load(catalog_path)
    if not data:
        raise ValueError("Major JSON is empty.")
    aliases = _aliases_from_data(data)
    normalize_code = lambda code: normalize(code, aliases)
    completed = {normalize_code(code) for code in completed_courses}
    required, choices, credits, eligible = _parse(data, aliases)
    warnings = []
    # Course lists and individual credits come ONLY from the input JSON.
    fixed_required_credits = sum(credits[c] for c in required)
    choice_required_credits = {label: min(credits[c] for c in options)
                               for label, options in choices}
    math_choice_required_credits = sum(choice_required_credits.values())
    experience_courses = {
        normalize_code(c) for key, info in data.items()
        if info.get("type") == "High-Impact Experience" and info.get("elective") == "no"
        for c in key.split("/")
    }
    major_minimum_required_credits = (
        fixed_required_credits + math_choice_required_credits + sum(TARGETS.values())
    )

    for raw_code, value in (course_credits or {}).items():
        code, hours = normalize_code(raw_code), _credits(value)
        if code in credits and credits[code] != hours:
            raise ValueError(f"Conflicting credit values for {code}")
        credits[code] = hours

    # A known course checked inside the custom UI must update shared completion
    # before required courses/choice groups are evaluated.
    for record in complementary_courses or []:
        if record.get("completed") is True:
            completed.add(_custom_id(record, aliases))

    required_results = []
    applied = set()
    for code in sorted(required):
        done = (bool(high_impact_confirmed) if code in experience_courses
                else code in completed)
        required_results.append({"course_id": code, "complete": done})
        if done:
            applied.add(code)

    choice_results = []
    for label, options in choices:
        available = sorted(set(options) & completed - applied,
                           key=lambda code: (credits[code], code))
        selected = available[:1]
        applied.update(selected)
        choice_results.append({
            "id": label, "options": options, "complete": bool(selected),
            "applied_courses": selected,
            **_progress(choice_required_credits[label],
                        sum(credits[c] for c in selected), bool(selected)),
        })

    # Custom course entry; a completion check is not advisor approval.
    complementary_ids = set()
    custom_courses = []
    seen = set()
    for record in complementary_courses or []:
        name = record.get("name", record.get("course_id", ""))
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Custom complementary courses need a name.")
        name = name.strip()
        code = _custom_id(record, aliases)
        hours = _credits(record["credits"])
        if hours == 0:
            raise ValueError("Custom complementary courses need positive credits.")
        checked = record.get("completed", False)
        if not isinstance(checked, bool):
            raise ValueError("Custom course completed must be a boolean.")
        if code in seen:
            raise ValueError(f"Duplicate complementary record: {code}")
        seen.add(code)
        if checked:
            completed.add(code)
        if code in applied:
            warnings.append(f"{code} already used for a required course; not reused as complementary.")
        if code in credits and credits[code] != hours:
            raise ValueError(f"Conflicting credit values for {code}")
        credits[code] = hours
        complementary_ids.add(code)
        custom_courses.append({"course_id": code, "name": name,
                               "credits": hours, "completed": code in completed})

    # Allocate ALL elective buckets together to prevent cross-bucket reuse.
    all_eligible = dict(eligible)
    all_eligible["Complementary Elective"] = complementary_ids
    candidates = (set().union(*all_eligible.values()) & completed) - applied
    electives = _allocate(candidates, all_eligible, credits)
    for result in electives.values():
        applied.update(result["applied_courses"])

    # Frontend contract: report[JSON filename without extension] is the list
    # of requirement cards. Options always refer to actual individual courses.
    # completed is shared across cards; applied_here is the unique allocation.
    def options_for(raw_codes, selected):
        return [
            {"course_id": raw, "canonical_id": normalize_code(raw),
             "credits": credits[normalize_code(raw)],
             "completed": normalize_code(raw) in completed,
             "applied_here": normalize_code(raw) in selected}
            for raw in sorted(set(raw_codes))
        ]

    cards = []
    for item in required_results:
        code = item["course_id"]
        raw_options = set()
        for key, info in data.items():
            if info.get("elective") == "no":
                raw = key.split("/")
                if {normalize_code(c) for c in raw} == {code}:
                    raw_options.update(c.replace(" ", "").upper() for c in raw)
        raw_options = raw_options or {code}
        cards.append({
            "id": code, "kind": "experience" if code in experience_courses else "required",
            "show_dropdown": len(raw_options) > 1, "multiple": True,
            "required_credits": credits[code],
            "earned_credits": credits[code] if item["complete"] else 0,
            "remaining_credits": 0 if item["complete"] else credits[code],
            "complete": item["complete"],
            "applied_courses": [code] if item["complete"] else [],
            "options": options_for(raw_options, {code} if item["complete"] else set()),
        })
    for item in choice_results:
        raw_options = item["id"].split("/")
        selected = item["applied_courses"]
        cards.append({
            "id": item["id"], "kind": "choose_one",
            "show_dropdown": len(set(raw_options)) > 1, "multiple": True,
            "required_courses": 1, "complete": item["complete"],
            "required_credits": item["required_credits"],
            "remaining_credits": item["remaining_credits"],
            "earned_credits": sum(credits[c] for c in selected),
            "applied_courses": selected, "options": options_for(raw_options, selected),
        })
    for name, result in electives.items():
        raw_options = set()
        for key, info in data.items():
            if key != "COMPLEMENTARY_ELECTIVE" and info.get("elective_type") == name:
                raw_options.update(c.replace(" ", "").upper() for c in key.split("/"))
        is_custom = name == "Complementary Elective"
        card = {
            "id": name, "kind": "elective", "show_dropdown": True,
            "multiple": True, **result,
            "allow_custom_courses": is_custom,
            "options": ([{**course, "applied_here": course["course_id"] in result["applied_courses"]}
                         for course in custom_courses] if is_custom
                        else options_for(raw_options, result["applied_courses"])),
        }
        if is_custom:
            card.update({
                "input_fields": ["name", "credits", "completed"],
                "advisor_required": True,
                "advisor_approval_verified": False,
                "helper_text": "Add courses agreed with your advisor; check courses you have completed.",
            })
        cards.append(card)

    unknown = sorted(completed - credits.keys())
    if unknown:
        warnings.append("Missing credit values; total_credits is partial and these courses are not counted: " + ", ".join(unknown))
    warnings.append("Elective approval lists and choice substitutions are taken from your JSON and still need verification.")
    fixed_earned = sum(credits[c] for c in required if c in applied)
    cs_names = list(TARGETS)[:4]
    progress = {
        "fixed_required": _progress(fixed_required_credits, fixed_earned,
                                    all(x["complete"] for x in required_results)),
        "math_choice": _progress(math_choice_required_credits,
                                 sum(x["earned_credits"] for x in choice_results),
                                 all(x["complete"] for x in choice_results)),
        **electives,
        "cs_electives_total": _progress(
            CS_BS_CS_ELECTIVES_REQUIRED_CREDITS,
            sum(electives[n]["earned_credits"] for n in cs_names),
            all(electives[n]["complete"] for n in cs_names)),
        "high_impact": _progress(CS_BS_HIGH_IMPACT_REQUIRED_CREDITS, 0,
                                 high_impact_confirmed if experience_courses else True),
    }
    credit_requirements = {
        "fixed_required": fixed_required_credits,
        "math_choice": math_choice_required_credits,
        **TARGETS,
        "cs_electives_total": CS_BS_CS_ELECTIVES_REQUIRED_CREDITS,
        "high_impact": CS_BS_HIGH_IMPACT_REQUIRED_CREDITS,
        "major_minimum": major_minimum_required_credits,
        "full_degree_total": CS_BS_DEGREE_TOTAL_REQUIRED_CREDITS,
    }
    return {
        "major": "CPSC", "degree": "BS", "catalog_year": "2026-2027",
        "scope": "major_only",
        "credit_requirements": credit_requirements,
        "requirement_progress": progress,
        "source_file": catalog_path.name,
        "requirements_list": catalog_path.stem,
        catalog_path.stem: cards,
        "required_courses": required_results,
        "choice_groups": choice_results,
        "electives": electives,
        "major_checklist_complete": (
            all(item["complete"] for item in required_results)
            and all(item["complete"] for item in choice_results)
            and all(item["complete"] for item in electives.values())
        ),
        "major_applied_credits": sum(credits[code] for code in applied),
        "degree_credits_from_this_major": sum(credits[code] for code in applied),
        "degree_credits": sum(credits[code] for code in applied),
        "degree_credits_scope": "major_only",
        "total_credits": sum(credits[code] for code in completed if code in credits),
        "total_credits_complete": not unknown,
        "courses_missing_credit_values": unknown,
        "applied_courses": sorted(applied),
        "unapplied_completed_courses": sorted(completed - applied),
        "warnings": warnings,
        "not_evaluated": [
            "UCC", "AP conversion", "ETAM and first-year requirements",
            "University graduation requirements", "GPA and minimum grades",
            "Prerequisites", "W/C", "Residency", "126-credit degree total",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--completed", nargs="*", default=[])
    parser.add_argument("--student", type=Path,
                        help="JSON list of completed course codes")
    parser.add_argument("--complementary", type=Path,
                        help="JSON list of complementary course approval records")
    parser.add_argument("--high-impact-confirmed", action="store_true")
    parser.add_argument("--course-credits", type=Path,
                        help="Optional JSON mapping of additional course codes to credits")
    args = parser.parse_args()
    try:
        student = (json.loads(args.student.read_text(encoding="utf-8"))
                   if args.student else args.completed)
        complementary = (json.loads(args.complementary.read_text(encoding="utf-8"))
                         if args.complementary else [])
        extra_credits = (json.loads(args.course_credits.read_text(encoding="utf-8"))
                         if args.course_credits else {})
        report = check_major(student, args.catalog,
                             complementary_courses=complementary,
                             high_impact_confirmed=args.high_impact_confirmed,
                             course_credits=extra_credits)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(1, f"Error: {error}\n")