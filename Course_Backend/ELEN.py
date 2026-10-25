"""ELEN major-only checklist using the student's ELEN.json.

Save as Course_Backend/ELEN.py. No Flask dependency.
Default catalog: Course_Data/Major.json/ELEN.json.
Rule source (2026-2027):
https://catalog.tamu.edu/undergraduate/engineering/electrical-computer/electrical-bs/

Requirements:
- Approved Elective: 3 credits (called Technical elective in the official plan).
- ECEN Elective: 19 credits total (9 + 10 in the official plan).
- ECEN403 and ECEN404 are BOTH required, unlike the CPEN design alternatives.
- ECEN399 is a zero-credit required experience and still needs completion.
- Full-degree reference: 128 credits; this is not a full graduation audit.

The supplied JSON covers a minimum of 82 credits: fixed requirements 57,
required Math choice 3, Approved 3 and ECEN 19. This is not the full degree.
Course lists and individual credit values are read only from the supplied JSON.
The constants below specify category minimums, not course data.
Cross-listed slash entries in THIS JSON have the same course number under
separate prefixes. MATH251/MATH253 is a choice between distinct courses.
Cross-listed completions share a canonical ID and are counted once.

Function guide:
_progress produces consistent required/earned/remaining/complete fields.
normalize standardizes codes and applies cross-listed identities.
_credits validates nonnegative integer credit values.
_load reads JSON and rejects duplicate keys.
_parse separates required courses, choice groups and elective options.
_allocate assigns electives with exact capped-state dynamic programming.
check_major evaluates completion, generates cards and calculates unique totals.
The command-line block permits testing without running the API.

Frontend contract:
report.requirements_list comes from the JSON filename. The card array is
report[report.requirements_list]. Card kinds: required, choose_one, experience,
elective. show_dropdown is false only for single-option required cards;
multiple is always true so dropdowns may contain multiple checked courses.
options[].canonical_id synchronizes checkboxes for the same course.
options[].completed is shared completion; applied_here is unique allocation.
required_credits, earned_credits, remaining_credits and complete show progress.
Elective dropdowns use JSON options; allow_custom_courses is false.
A zero-credit required course needs a completed course record, or the explicit
high_impact_confirmed flag. The flag is not advisor approval verification.

Credit policy:
Retain each selected course's full credits, then stop filling a satisfied bucket.
For the 3-credit Approved requirement, one completed 4-credit course adds 4 to
degree credits; further courses contribute only to total unless used elsewhere.
For the 19-credit ECEN requirement, five 4-credit courses add 20; eight 3-credit
courses add 21 to degree credits and 24 to total credits.
degree_credits covers only the requirements represented in this JSON.
total_credits includes all completed courses with known credits, allocated or not.
major_checklist_complete does not certify graduation. total_credits_complete
only reports whether completed courses have known credit values.
No UCC/AP, grades, prerequisites, W/C, residency or advisor approval is checked.
"""
import argparse
import itertools
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "Course_Data" / "Major.json" / "ELEN.json"
ELEN_APPROVED_REQUIRED_CREDITS = 3
ELEN_ECEN_REQUIRED_CREDITS = 19
ELEN_HIGH_IMPACT_REQUIRED_CREDITS = 0
ELEN_DEGREE_TOTAL_REQUIRED_CREDITS = 128
TARGETS = {"Approved Elective": ELEN_APPROVED_REQUIRED_CREDITS,
           "ECEN Elective": ELEN_ECEN_REQUIRED_CREDITS}

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


def _parse(data):
    if not data:
        raise ValueError('Major JSON is empty.')
    aliases = {}
    for key, info in data.items():
        if not isinstance(info, dict):
            raise ValueError(f'Invalid entry: {key}')
        codes = [normalize(c) for c in key.split('/')]
        # Specific to this JSON's lab, architecture and materials cross-listings.
        # Distinct-number required alternatives remain separate courses.
        if len(codes)>1 and len({re.search(r'\d+$',c).group() for c in codes})==1:
            for code in codes:
                aliases[code] = codes[0]
    credits, required, choices = {}, [], []
    eligible = {name:set() for name in TARGETS}
    raw_options = {name:set() for name in TARGETS}
    for key, info in data.items():
        raw = [normalize(c) for c in key.split('/')]
        codes = sorted({normalize(c,aliases) for c in raw})
        hours = _credits(info.get('credits'))
        for code in codes:
            if code in credits and credits[code]!=hours:
                raise ValueError(f'Conflicting credit values for {code}')
            credits[code] = hours
        if info.get('elective')=='no':
            entry={'id':key,'raw':raw,'codes':codes,'credits':hours,
                   'experience':hours==0}
            if len(codes)==1:
                required.append(entry)
            else:
                choices.append(entry)
        elif info.get('elective')=='yes':
            name=info.get('elective_type')
            if name not in eligible:
                raise ValueError(f'Unknown elective type for {key}: {name}')
            eligible[name].update(codes)
            raw_options[name].update(raw)
        else:
            raise ValueError(f'{key}: elective must be yes or no.')
    return aliases, credits, required, choices, eligible, raw_options


def check_major(completed_courses, catalog_path=None, *, high_impact_confirmed=False,
                course_credits=None):
    """Check completed course records against the supplied major JSON.

    course_credits optionally supplies credits for courses outside that JSON.
    Such courses affect total credits only unless the JSON makes them eligible.
    """
    if isinstance(completed_courses,(str,bytes,dict)):
        raise ValueError('completed_courses must be a list of course codes.')
    if not isinstance(high_impact_confirmed,bool):
        raise ValueError('high_impact_confirmed must be boolean.')
    if course_credits is not None and not isinstance(course_credits,dict):
        raise ValueError('course_credits must be an object.')
    path=Path(catalog_path or DEFAULT_CATALOG)
    data=_load(path)
    aliases, credits, required, choices, eligible, raw_options=_parse(data)
    norm=lambda c: normalize(c,aliases)
    completed={norm(c) for c in completed_courses}
    for raw,value in (course_credits or {}).items():
        code,hours=norm(raw),_credits(value)
        if code in credits and credits[code]!=hours:
            raise ValueError(f'Conflicting credit values for {code}')
        credits[code]=hours
    for entry in required+choices:
        if entry['experience'] and high_impact_confirmed and not set(entry['codes'])&completed:
            completed.add(entry['codes'][0])
    fixed={e['codes'][0] for e in required}
    fixed_applied=fixed&completed
    choice_options=[sorted(set(e['codes'])&completed) or [None] for e in choices]
    best=None
    for selected in itertools.product(*choice_options):
        chosen=[c for c in selected if c]
        if len(chosen)!=len(set(chosen)) or set(chosen)&fixed_applied:
            continue
        core=fixed_applied|set(chosen)
        candidates=(completed&set().union(*eligible.values()))-core
        electives=_allocate(candidates,eligible,credits,TARGETS)
        applied=core|set().union(*(set(v['applied_courses']) for v in electives.values()))
        score=(len(chosen)+sum(v['complete'] for v in electives.values()),
               sum(min(v['earned_credits'],v['required_credits']) for v in electives.values()),
               -sum(credits[c] for c in applied))
        if best is None or score>best[0]:
            best=(score,selected,electives,applied)
    if best is None:
        raise ValueError('Overlapping required groups cannot be assigned uniquely.')
    _,selected,electives,applied=best

    def options(raw,used):
        return [{'course_id':c,'canonical_id':norm(c),'credits':credits[norm(c)],
                 'completed':norm(c) in completed,'applied_here':norm(c) in used}
                for c in sorted(set(raw))]

    def card(entry,used,kind):
        earned=sum(credits[c] for c in used)
        return {'id':entry['id'],'kind':kind,'show_dropdown':len(entry['raw'])>1,
                'multiple':True,'required_courses':1,
                **_progress(entry['credits'],earned,bool(used)),
                'applied_courses':sorted(used),'options':options(entry['raw'],used)}

    cards=[]
    for entry in required:
        used=set(entry['codes'])&completed
        cards.append(card(entry,used,'experience' if entry['experience'] else 'required'))
    for entry,c in zip(choices,selected):
        cards.append(card(entry,{c} if c else set(),'experience' if entry['experience'] else 'choose_one'))
    for name,result in electives.items():
        cards.append({'id':name,'kind':'elective','show_dropdown':True,'multiple':True,
                      **result,'allow_custom_courses':False,
                      'options':options(raw_options[name],result['applied_courses'])})
    fixed_target=sum(credits[c] for c in fixed)
    choice_target=sum(e['credits'] for e in choices)
    fixed_earned=sum(credits[c] for c in fixed_applied)
    choice_earned=sum(credits[c] for c in selected if c)
    high_done=all(c['complete'] for c in cards if c['kind']=='experience')
    progress={'fixed_required':_progress(fixed_target,fixed_earned,fixed<=completed),
              'required_choices':_progress(choice_target,choice_earned,all(selected)),
              'high_impact':_progress(ELEN_HIGH_IMPACT_REQUIRED_CREDITS,0,high_done),
              **electives}
    unknown=sorted(completed-credits.keys())
    warnings=['Checks only requirements represented in your JSON, not a full graduation audit.',
              'Approved Elective corresponds to the official 3-credit Technical elective.',
              'Course options and individual credits come from your JSON and are not corrected from the official catalog.']
    if unknown:
        warnings.append('Missing credit values; total_credits is partial: '+', '.join(unknown))
    earned=sum(credits[c] for c in applied)
    return {'major':'ELEN','degree':'BS','catalog_year':'2026-2027','scope':'major_only',
            'source_file':path.name,'requirements_list':path.stem,path.stem:cards,
            'credit_requirements':{'fixed_required':fixed_target,'required_choices':choice_target,
                                   'choice_groups':{e['id']:e['credits'] for e in choices},
                                   **TARGETS,'high_impact':ELEN_HIGH_IMPACT_REQUIRED_CREDITS,
                                   'major_minimum':fixed_target+choice_target+sum(TARGETS.values()),
                                   'full_degree_total':ELEN_DEGREE_TOTAL_REQUIRED_CREDITS},
            'requirement_progress':progress,'electives':electives,
            'major_checklist_complete':all(c['complete'] for c in cards),
            'degree_credits':earned,'major_applied_credits':earned,
            'degree_credits_from_this_major':earned,'degree_credits_scope':'major_only',
            'total_credits':sum(credits[c] for c in completed if c in credits),
            'total_credits_complete':not unknown,'courses_missing_credit_values':unknown,
            'applied_courses':sorted(applied),'unapplied_completed_courses':sorted(completed-applied),
            'warnings':warnings,
            'not_evaluated':['UCC','AP conversion','ETAM/first-year requirements','Grades/GPA',
                             'Prerequisites','W/C','Residency','Advisor approval','Full 128-credit graduation eligibility']}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog',type=Path,default=DEFAULT_CATALOG)
    parser.add_argument('--completed',nargs='*',default=[])
    parser.add_argument('--student',type=Path)
    parser.add_argument('--course-credits',type=Path)
    parser.add_argument('--high-impact-confirmed',action='store_true')
    args=parser.parse_args()
    try:
        completed=json.loads(args.student.read_text()) if args.student else args.completed
        extra=json.loads(args.course_credits.read_text()) if args.course_credits else {}
        print(json.dumps(check_major(completed,args.catalog,high_impact_confirmed=args.high_impact_confirmed,
                                    course_credits=extra),indent=2))
    except (ValueError,TypeError,KeyError,OSError) as error:
        parser.exit(1,f'Error: {error}\n')