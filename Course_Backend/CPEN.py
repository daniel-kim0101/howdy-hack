"""CPEN major-only checker using the student's existing CPEN.json.

Official rule source (2026-2027):
https://catalog.tamu.edu/undergraduate/engineering/computer-science/computer-engineering-bs/

Save as Course_Backend/CPEN.py. The default catalog is
Course_Data/Major.json/CPEN.json. Course options and individual credits come
from that file; this module does not add or correct catalog courses.

Credit requirements:
- Engineering elective: 3 credits.
- ECEN senior-design route: ECEN403 AND ECEN404, plus 12 Area credits.
- CSCE senior-design route: CSCE483, plus 15 Area credits.
- High-impact experience: zero credits, but completion is mandatory.
- Full degree reference: 128 credits; full graduation is not evaluated here.

The supplied JSON covers a 70-credit minimum: fixed requirements 43,
required choices 6, Engineering 3, and senior design plus Area 18.
Area specialization labels are display groups, not separate credit targets.

Functions:
_load reads JSON and rejects duplicate keys.
normalize standardizes course codes and known cross-listed identities.
_credits validates nonnegative integer credit values.
_progress produces consistent requirement progress fields.
_parse reads required courses, choice groups, experience, design and electives.
_allocate assigns each course to at most one elective requirement using exact
capped-state dynamic programming. The final course retains its full credits.
check_major evaluates required choices and design routes together, then returns
frontend cards, progress and credit totals. Nested options/card functions build
frontend records. The command-line entry point works without Flask.

Frontend contract:
report.requirements_list is derived from the JSON filename; use
report[report.requirements_list] to obtain the cards.
show_dropdown indicates a dropdown; multiple allows multiple checked courses.
Card kinds: required, choose_one, experience, senior_design, elective.
options[].canonical_id synchronizes completion across cross-listed entries.
completed means the course is completed; applied_here means it is allocated to
this requirement. These states are deliberately separate.
The Senior Design card exposes path_options, selected_path and selection_mode.
POST senior_design_path as auto, ecen or csce; auto suggests a route.
In the CSCE route, the design card requires 3 credits and Area requires 15;
in the ECEN route, design requires 6 and Area requires 12. Do not add the
explanatory design_and_area_total subtotal again to the individual totals.
Area option_groups only organize options. Shared courses may appear in several
groups but must be counted once. Elective options come only from the JSON;
allow_custom_courses is false.

Provide a completed CSCE399/ECEN399 record or high_impact_confirmed=True for
the experience requirement. This is a completion claim, not approval validation.

degree_credits counts courses allocated to the represented major requirements.
total_credits counts all completed courses with known credits, including excess.
For a 12-credit Area target, three 4-credit courses contribute 12; five 3-credit
courses contribute 12 to degree and 15 to total. For a 15-credit target, four
4-credit courses contribute 16; six 3-credit courses contribute 15 to degree
and 18 to total. Courses can still fill another eligible unfilled requirement.
major_checklist_complete only describes the supplied JSON, not graduation.
total_credits_complete only means all completed courses have known credit values.

No UCC, AP conversion, ETAM, grades, prerequisites, W/C, residency, advisor
approval or university-wide graduation audit is performed.
Slash conventions are specific to this JSON; update parsing rules if its schema
changes rather than treating every slash as a cross-listing.
"""
import argparse
import itertools
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "Course_Data" / "Major.json" / "CPEN.json"
CPEN_ENGINEERING_REQUIRED_CREDITS = 3
CPEN_AREA_REQUIRED_CREDITS = 12
CPEN_CSCE_DESIGN_EXTRA_AREA_CREDITS = 3
CPEN_SENIOR_DESIGN_REQUIRED_CREDITS = 6  # Aggregate: design + replacement area.
CPEN_HIGH_IMPACT_REQUIRED_CREDITS = 0
CPEN_DEGREE_TOTAL_REQUIRED_CREDITS = 128
# Rule references, not a replacement course catalog: only entries PRESENT in
# the JSON become options. These identify the two official design routes.
DESIGN_PATH_RULES = {"ecen": ("ECEN403", "ECEN404"), "csce": ("CSCE483",)}

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



def _credits(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError("Credits must be a nonnegative integer.")
    return value



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


def _parse(data):
    """Interpret this CPEN JSON's slash conventions without replacing its data."""
    if not data:
        raise ValueError('Major JSON is empty.')
    aliases = {}
    # Individual Area entries are cross-listings (including three-code entries).
    # Required same-number lab/architecture pairs are cross-listings; the
    # High-Impact alternatives and other required groups remain choices.
    for key, info in data.items():
        if not isinstance(info, dict):
            raise ValueError(f'Invalid entry: {key}')
        codes = [normalize(c) for c in key.split('/')]
        crosslisted = (info.get('elective_type') == 'Area Elective' or
                       (info.get('elective') == 'no' and
                        info.get('type') != 'High-Impact Experience' and
                        len({re.search(r'\d+$', c).group() for c in codes}) == 1))
        if crosslisted and len(codes) > 1:
            for code in codes:
                aliases[code] = codes[0]
    # The long Engineering list mixes independent options and this cross-list.
    # Only link these names if the supplied JSON actually lists both.
    eng_codes = {normalize(c) for key, info in data.items()
                 if info.get('elective_type') == 'Engineering Elective'
                 for c in key.split('/')}
    if {'MEEN222', 'MSEN222'} <= eng_codes:
        aliases['MSEN222'] = 'MEEN222'

    credits, required, choices, experience, design = {}, [], [], [], {}
    eligible = {'Engineering Elective': set(), 'Area Elective': set()}
    raw_options = {k: set() for k in eligible}
    area_groups = {}
    for key, info in data.items():
        raw = [normalize(c) for c in key.split('/')]
        codes = sorted({normalize(c, aliases) for c in raw})
        hours = _credits(info.get('credits'))
        for code in codes:
            if code in credits and credits[code] != hours:
                raise ValueError(f'Conflicting credit values for {code}')
            credits[code] = hours
        flag = info.get('elective')
        if flag == 'no':
            entry = {'id': key, 'raw': raw, 'codes': codes, 'credits': hours}
            if info.get('type') == 'Senior Design':
                if len(codes) != 1:
                    raise ValueError('Senior Design entries must identify individual courses.')
                design[codes[0]] = entry
            elif info.get('type') == 'High-Impact Experience':
                if hours != 0:
                    raise ValueError('High-impact requirement must have zero credits.')
                experience.append(entry)
            elif len(codes) == 1:
                required.append(entry)
            else:
                choices.append(entry)
        elif flag == 'yes':
            name = info.get('elective_type')
            if name not in eligible:
                raise ValueError(f'Unknown elective type for {key}: {name}')
            eligible[name].update(codes)
            raw_options[name].update(raw)
            if name == 'Area Elective':
                label = info.get('type', '')
                if not isinstance(label, str):
                    raise ValueError(f'Invalid Area type for {key}')
                for group in label.split(';'):
                    if group.strip():
                        area_groups.setdefault(group.strip(), set()).update(raw)
        else:
            raise ValueError(f'{key}: elective must be yes or no.')
    supported = set().union(*[set(v) for v in DESIGN_PATH_RULES.values()])
    if set(design) != supported:
        raise ValueError('Senior Design JSON must contain ECEN403, ECEN404 and CSCE483; update path rules if the curriculum changes.')
    if sum(credits[c] for c in DESIGN_PATH_RULES['ecen']) != 6 or credits['CSCE483'] != 3:
        raise ValueError('Senior Design credits conflict with the verified 6-credit route rule.')
    return aliases, credits, required, choices, experience, design, eligible, raw_options, area_groups


def _allocate(completed, eligible, credits, targets):
    """Exact capped-state allocation; each course gets at most one bucket.

    Stop adding to a full bucket, retaining full credits of the final course.
    Maximize completed buckets, then covered credits, then minimize credits used.
    """
    names = list(targets)
    zero = (0,) * len(names)
    states = {zero: (0, ())}
    for code in sorted(completed):
        hours = credits[code]
        if not hours:
            continue
        updates = dict(states)
        for state, (cost, assignments) in states.items():
            for i, name in enumerate(names):
                if code not in eligible[name] or state[i] >= targets[name]:
                    continue
                new = list(state)
                new[i] = min(targets[name], state[i] + hours)
                new = tuple(new)
                proposal = (cost + hours, assignments + ((code, name),))
                if new not in updates or proposal < updates[new]:
                    updates[new] = proposal
        states = updates
    best = max(states, key=lambda st: (sum(st[i] == targets[n] for i,n in enumerate(names)),
                                       sum(st), -states[st][0]))
    result = {}
    for name in names:
        selected = [c for c,n in states[best][1] if n == name]
        earned = sum(credits[c] for c in selected)
        result[name] = {**_progress(targets[name], earned, earned >= targets[name]),
                        'applied_courses': selected}
    return result


def check_major(completed_courses, catalog_path=None, *, high_impact_confirmed=False,
                senior_design_path='auto', course_credits=None):
    """Return CPEN cards and major-only credits, with shared completion IDs.

    senior_design_path: auto, ecen, csce. Explicit choice pins the route; auto
    suggests a route from completed work. This is not an advisor approval.
    course_credits adds credit values for completed courses outside the JSON.
    """
    if isinstance(completed_courses, (str, bytes, dict)):
        raise ValueError('completed_courses must be a list of course codes.')
    if not isinstance(high_impact_confirmed, bool):
        raise ValueError('high_impact_confirmed must be boolean.')
    if senior_design_path not in ('auto', 'ecen', 'csce'):
        raise ValueError('senior_design_path must be auto, ecen or csce.')
    path = Path(catalog_path or DEFAULT_CATALOG)
    data = _load(path)
    (aliases, credits, required, choices, experience, design,
     eligible, raw_options, area_groups) = _parse(data)
    norm = lambda c: normalize(c, aliases)
    completed = {norm(c) for c in completed_courses}
    if course_credits is not None and not isinstance(course_credits, dict):
        raise ValueError('course_credits must be an object.')
    for raw, value in (course_credits or {}).items():
        code, hours = norm(raw), _credits(value)
        if code in credits and credits[code] != hours:
            raise ValueError(f'Conflicting credit values for {code}')
        credits[code] = hours
    # A confirmation is itself completion of the experience requirement.
    # If no actual experience code was supplied, mark its first listed code.
    for entry in experience:
        if high_impact_confirmed and not (set(entry['codes']) & completed):
            completed.add(entry['codes'][0])
    fixed = {e['codes'][0] for e in required}
    fixed_applied = fixed & completed
    choice_options = [sorted(set(e['codes']) & completed) or [None] for e in choices]
    routes = ('ecen', 'csce') if senior_design_path == 'auto' else (senior_design_path,)
    best = None
    # Choice alternatives may also appear as electives. Evaluate each assignment
    # together, instead of greedily consuming a useful elective option.
    for selected in itertools.product(*choice_options):
        chosen = [c for c in selected if c is not None]
        if len(set(chosen)) != len(chosen) or set(chosen) & fixed_applied:
            continue
        core_applied = fixed_applied | set(chosen)
        for route in routes:
            design_codes = DESIGN_PATH_RULES[route]
            design_applied = set(design_codes) & completed
            design_required = sum(credits[c] for c in design_codes)
            design_earned = sum(credits[c] for c in design_applied)
            targets = {'Engineering Elective': CPEN_ENGINEERING_REQUIRED_CREDITS,
                       'Area Elective': CPEN_AREA_REQUIRED_CREDITS +
                       (CPEN_CSCE_DESIGN_EXTRA_AREA_CREDITS if route == 'csce' else 0)}
            candidates = (completed & set().union(*eligible.values())) - core_applied - design_applied
            electives = _allocate(candidates, eligible, credits, targets)
            applied = core_applied | design_applied | set().union(*(set(v['applied_courses']) for v in electives.values()))
            design_done = set(design_codes) <= completed
            score = (sum(v['complete'] for v in electives.values()) + int(design_done) + len(chosen),
                     sum(min(v['earned_credits'],v['required_credits'])/v['required_credits'] for v in electives.values()) + design_earned/design_required,
                     -sum(credits[c] for c in applied))
            candidate = (score, route, selected, design_applied, electives, applied)
            if best is None or score > best[0]:
                best = candidate
    if best is None:
        raise ValueError('Overlapping required groups cannot be assigned uniquely.')
    _, route, selected, design_applied, electives, applied = best

    def options(raw_codes, used):
        return [{'course_id': c, 'canonical_id': norm(c), 'credits': credits[norm(c)],
                 'completed': norm(c) in completed, 'applied_here': norm(c) in used}
                for c in sorted(set(raw_codes))]

    def card(entry, used, kind):
        earned = sum(credits[c] for c in used)
        done = bool(used)
        return {'id': entry['id'], 'kind': kind, 'show_dropdown': len(entry['raw'])>1,
                'multiple': True, 'required_courses': 1,
                **_progress(entry['credits'],earned,done),
                'applied_courses': sorted(used), 'options': options(entry['raw'],used)}

    cards = [card(e, {e['codes'][0]} & completed, 'required') for e in required]
    for e,c in zip(choices, selected):
        cards.append(card(e, {c} if c else set(), 'choose_one'))
    for e in experience:
        used = sorted(set(e['codes']) & completed)[:1]
        applied.update(used)
        cards.append(card(e,set(used),'experience'))
    route_codes = DESIGN_PATH_RULES[route]
    design_earned = sum(credits[c] for c in design_applied)
    design_required = sum(credits[c] for c in route_codes)
    design_done = set(route_codes) <= completed
    route_options = []
    for name,codes in DESIGN_PATH_RULES.items():
        route_options.append({'value': name, 'label': ('ECEN403 + ECEN404' if name=='ecen' else 'CSCE483 + 3 extra Area credits'),
                              'required_courses': list(codes),
                              'design_required_credits': sum(credits[c] for c in codes),
                              'area_required_credits': CPEN_AREA_REQUIRED_CREDITS + (CPEN_CSCE_DESIGN_EXTRA_AREA_CREDITS if name=='csce' else 0)})
    cards.append({'id':'Senior Design','kind':'senior_design','show_dropdown':True,'multiple':True,
                  **_progress(design_required,design_earned,design_done),
                  'selected_path':route,'selection_mode':senior_design_path,
                  'path_options':route_options,'applied_courses':sorted(design_applied),
                  'options':options(design,design_applied),
                  'helper_text':'Choose ECEN403+ECEN404, or CSCE483 with 3 additional Area credits. Area card includes the extra credits.'})
    for name,result in electives.items():
        item = {'id':name,'kind':'elective','show_dropdown':True,'multiple':True,
                **result,'allow_custom_courses':False,
                'options':options(raw_options[name],result['applied_courses'])}
        if name=='Area Elective':
            item.update(advisor_required=True,advisor_approval_verified=False,
                        option_groups=[{'name':label,'is_requirement':False,
                                        'options':options(raw,result['applied_courses'])}
                                       for label,raw in sorted(area_groups.items())])
        cards.append(item)
    fixed_target = sum(credits[c] for c in fixed)
    choice_target = sum(e['credits'] for e in choices)
    fixed_earned = sum(credits[c] for c in fixed_applied)
    choice_earned = sum(credits[c] for c in selected if c)
    high_done = all(c['complete'] for c in cards if c['kind']=='experience')
    # This subtotal is explanatory only; never add it to the credit sum again.
    design_area_earned = design_earned + electives['Area Elective']['earned_credits']
    design_area_target = CPEN_SENIOR_DESIGN_REQUIRED_CREDITS + CPEN_AREA_REQUIRED_CREDITS
    progress = {'fixed_required':_progress(fixed_target,fixed_earned,fixed<=completed),
                'required_choices':_progress(choice_target,choice_earned,all(selected)),
                'high_impact':_progress(0,0,high_done),
                'senior_design':_progress(design_required,design_earned,design_done),
                **electives,
                'design_and_area_total':_progress(design_area_target,design_area_earned,
                                                 design_done and electives['Area Elective']['complete'])}
    unknown = sorted(completed-credits.keys())
    warnings = ['Checks only requirements in the supplied JSON; not a full CPEN graduation audit.',
                'Area courses require advisor consultation; approval and additional advisor-specific restrictions are not verified.',
                'Individual course credits and option lists come from your JSON; they are not corrected from the catalog.']
    if unknown:
        warnings.append('Missing credit values; total_credits is partial: '+', '.join(unknown))
    degree_credits = sum(credits[c] for c in applied)
    return {'major':'CPEN','degree':'BS','catalog_year':'2026-2027','scope':'major_only',
            'source_file':path.name,'requirements_list':path.stem,path.stem:cards,
            'senior_design_path':route,'senior_design_selection':senior_design_path,
            'credit_requirements':{'fixed_required':fixed_target,'required_choices':choice_target,
                                   'Engineering Elective':CPEN_ENGINEERING_REQUIRED_CREDITS,
                                   'Area Elective':electives['Area Elective']['required_credits'],
                                   'senior_design':design_required,'high_impact':0,
                                   'design_and_area_total':design_area_target,
                                   'major_minimum':fixed_target+choice_target+CPEN_ENGINEERING_REQUIRED_CREDITS+design_area_target,
                                   'full_degree_total':CPEN_DEGREE_TOTAL_REQUIRED_CREDITS},
            'requirement_progress':progress,'electives':electives,
            'major_checklist_complete':all(c['complete'] for c in cards),
            'degree_credits':degree_credits,'major_applied_credits':degree_credits,
            'degree_credits_from_this_major':degree_credits,'degree_credits_scope':'major_only',
            'total_credits':sum(credits[c] for c in completed if c in credits),
            'total_credits_complete':not unknown,'courses_missing_credit_values':unknown,
            'applied_courses':sorted(applied),'unapplied_completed_courses':sorted(completed-applied),
            'warnings':warnings,
            'not_evaluated':['UCC','AP conversion','ETAM/first-year requirements','Grades/GPA',
                             'Prerequisites','W/C','Residency','Advisor approval','Full 128-credit graduation eligibility']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=DEFAULT_CATALOG)
    parser.add_argument('--completed', nargs='*', default=[])
    parser.add_argument('--student', type=Path)
    parser.add_argument('--course-credits', type=Path)
    parser.add_argument('--high-impact-confirmed', action='store_true')
    parser.add_argument('--senior-design-path', choices=('auto','ecen','csce'), default='auto')
    args = parser.parse_args()
    try:
        completed = json.loads(args.student.read_text()) if args.student else args.completed
        extra = json.loads(args.course_credits.read_text()) if args.course_credits else {}
        print(json.dumps(check_major(completed,args.catalog,high_impact_confirmed=args.high_impact_confirmed,
                                    senior_design_path=args.senior_design_path,course_credits=extra),indent=2))
    except (ValueError,TypeError,KeyError,OSError) as error:
        parser.exit(1,f'Error: {error}\n')
