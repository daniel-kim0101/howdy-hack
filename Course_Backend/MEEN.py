"""MEEN major-only checklist using the student's existing MEEN.json.

Save as Course_Backend/MEEN.py. No Flask dependency.
Sources (2026-2027):
https://catalog.tamu.edu/undergraduate/engineering/mechanical/bs/
https://engineering.tamu.edu/mechanical/academics/degrees/undergraduate/curriculum.html

Requirements:
- Technical electives: 12 credits total, with at least three MEEN courses.
- At least one completed, allocated MEEN course from EACH of these areas:
  Mechanical and Manufacturing; Thermo-fluid and Energy; Data Science and
  Experimentation. These are course-count requirements, not three extra totals.
- Non-MEEN technical electives are OPTIONAL and may contribute at most 3 credits
  INSIDE the 12-credit technical requirement; they require advising approval.
- General elective: 3 credits from a 300-499 course, uniquely allocated.
- MEEN399 has zero credits but must be completed.
- Full-degree reference: 128 credits. Full graduation eligibility is not checked.

The supplied JSON has an 82-credit minimum: fixed requirements 64, the Math
choice 3, Technical electives 12 and General elective 3. This excludes UCC and
other full-degree requirements.
All course options, categories and individual credits come from MEEN.json.
The two *_ELECTIVE placeholders are requirements/entry controls, not courses.
MATH251/MATH253 remains a choice; PHYS217/ENGR217 is one cross-listed course.
Special Topics is eligible for the technical total but, under THIS JSON's
classification, is not automatically assigned to one of the three areas.

Custom records:
non_meen_courses and general_courses are lists of records:
  {"course_id":"MATH401", "name":"Advanced Mathematics", "credits":3,
   "completed":true}
A real course_id is required for consistent shared completion and level checks.
General entries must have a 300-499 course number. Non-MEEN technical entries
must not use a MEEN prefix. Advisor approval is not verified by this checker.
A completed 4-credit non-MEEN course cannot enter the strict 3-credit technical
cap; its full credits remain in total and may fill General if otherwise eligible.
No course's credits are truncated. Duplicate names with the same course_id
across input categories still count only once; credit conflicts are rejected.

Frontend contract:
report.requirements_list is the JSON filename stem. Read the card array from
report[report.requirements_list]. Cards expose show_dropdown, multiple,
required_credits, earned_credits, remaining_credits, complete and options.
Single fixed courses use checkboxes; choices and electives use multi-select.
canonical_id synchronizes the same course across all views.
completed is shared completion; applied_here is unique requirement allocation.
The Technical Elective card exposes option_groups and subrequirements.
The three area subrequirements each require one course; their credits are
already included in the 12-credit technical total. Do not sum them again.
The Non-MEEN group has optional=true and allow_custom_courses=true, with a
maximum credit cap; it is NOT a mandatory extra requirement.
The General Elective card also supports custom course entry.
Use input_fields from the custom group/card to render the input controls.
MEEN489 follows the supplied Special Topics classification; topic-specific
approval and area substitutions require advisor review outside this module.

Credit policy:
Each course is allocated once; retain the full credits of the last course
needed to satisfy a minimum. A 12-credit technical requirement can be completed
by three 4-credit MEEN courses if all three areas are covered. Five completed
3-credit technical courses use 12 credits for that requirement; another course
may fill General, otherwise its credits remain total-only.
Zero-credit completion and area coverage still gate major_checklist_complete.
General courses can be any known completed 300-499 course, including extra
technical courses, but cannot reuse required or allocated technical courses.
degree_credits covers only requirements represented by this JSON.
total_credits includes all completed courses with known credits.
total_credits_complete means credit values are known, not that graduation is met.

Function guide:
_progress formats progress; normalize standardizes course identities;
_credits validates credits; _load rejects duplicate JSON keys;
_parse reads course groups; _allocate jointly allocates technical and general
courses with area coverage, MEEN course count and the non-MEEN cap;
check_major validates custom input, evaluates required courses/choices and
returns frontend cards. The CLI block permits direct backend testing.
No UCC/AP, grades, prerequisites, W/C, residency or approval audit is performed.
"""
import argparse
import itertools
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "Course_Data" / "Major.json" / "MEEN.json"
MEEN_TECHNICAL_REQUIRED_CREDITS = 12
MEEN_GENERAL_REQUIRED_CREDITS = 3
MEEN_TECHNICAL_MINIMUM_MEEN_COURSES = 3
MEEN_NON_MEEN_MAX_CREDITS = 3
MEEN_HIGH_IMPACT_REQUIRED_CREDITS = 0
MEEN_DEGREE_TOTAL_REQUIRED_CREDITS = 128
AREA_TYPES = (
    "Technical Elective - Mechanical and Manufacturing Systems",
    "Technical Elective - Thermo-fluid and Energy Systems",
    "Technical Elective - Data Science and Experimentation",
)
SPECIAL_TYPE = "Technical Elective - Special Topics"
NON_MEEN_TYPE = "Non-MEEN Technical Elective"
GENERAL_TYPE = "General Elective"
PLACEHOLDERS = {"NON_MEEN_TECHNICAL_ELECTIVE": MEEN_NON_MEEN_MAX_CREDITS,
                "GENERAL_ELECTIVE": MEEN_GENERAL_REQUIRED_CREDITS}

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
    if not data:
        raise ValueError('Major JSON is empty.')
    aliases={}
    for key,info in data.items():
        if not isinstance(info,dict):
            raise ValueError(f'Invalid entry: {key}')
        if key in PLACEHOLDERS:
            if _credits(info.get('credits'))!=PLACEHOLDERS[key]:
                raise ValueError(f'{key}: placeholder credits conflict with the verified rule.')
            continue
        codes=[normalize(c) for c in key.split('/')]
        if len(codes)>1 and len({re.search(r'\d+$',c).group() for c in codes})==1:
            aliases.update({c:codes[0] for c in codes})
    credits,required,choices,groups={},{},[],{}
    for key,info in data.items():
        if key in PLACEHOLDERS:
            continue
        raw=[normalize(c) for c in key.split('/')]
        codes=sorted({normalize(c,aliases) for c in raw})
        hours=_credits(info.get('credits'))
        for c in codes:
            if c in credits and credits[c]!=hours:
                raise ValueError(f'Conflicting credit values for {c}')
            credits[c]=hours
        if info.get('elective')=='no':
            entry={'id':key,'raw':raw,'codes':codes,'credits':hours,'experience':hours==0}
            if len(codes)==1:
                required[key]=entry
            else:
                choices.append(entry)
        elif info.get('elective')=='yes':
            category=info.get('elective_type')
            if category not in (*AREA_TYPES,SPECIAL_TYPE,NON_MEEN_TYPE,GENERAL_TYPE):
                raise ValueError(f'Unknown elective type for {key}: {category}')
            groups.setdefault(category,set()).update(raw)
        else:
            raise ValueError(f'{key}: elective must be yes or no.')
    return aliases,credits,list(required.values()),choices,groups


def _allocate(candidates,credits,technical,non_meen,area_masks,general):
    """Joint exact allocation: (technical credits, area mask, MEEN count,
    non-MEEN credits, general credits). Credit totals are capped only in state;
    selected courses retain their full credits in the returned report.
    """
    zero=(0,0,0,0,0)
    states={zero:(0,())}
    for code in sorted(candidates):
        hours=credits[code]
        if hours<=0:
            continue
        updates=dict(states)
        for state,(cost,assignments) in states.items():
            tech,mask,count,non,general_hours=state
            proposals=[]
            if code in technical:
                new_mask=mask|area_masks.get(code,0)
                new_count=min(MEEN_TECHNICAL_MINIMUM_MEEN_COURSES,
                              count+int(code.startswith('MEEN')))
                new_non=non+(hours if code in non_meen else 0)
                contributes=(tech<MEEN_TECHNICAL_REQUIRED_CREDITS or new_mask!=mask or new_count!=count)
                if contributes and new_non<=MEEN_NON_MEEN_MAX_CREDITS:
                    proposals.append(((min(MEEN_TECHNICAL_REQUIRED_CREDITS,tech+hours),
                                       new_mask,new_count,new_non,general_hours),'Technical Elective'))
            if code in general and general_hours<MEEN_GENERAL_REQUIRED_CREDITS:
                proposals.append(((tech,mask,count,non,min(MEEN_GENERAL_REQUIRED_CREDITS,general_hours+hours)),GENERAL_TYPE))
            for new,bucket in proposals:
                proposal=(cost+hours,assignments+((code,bucket),))
                if new not in updates or proposal<updates[new]:
                    updates[new]=proposal
        states=updates

    def technical_done(state):
        return (state[0]>=MEEN_TECHNICAL_REQUIRED_CREDITS and state[1]==7 and
                state[2]>=MEEN_TECHNICAL_MINIMUM_MEEN_COURSES)

    def score(state):
        return (int(technical_done(state))+int(state[4]>=MEEN_GENERAL_REQUIRED_CREDITS),
                state[1].bit_count(),state[2],state[0]+state[4],-states[state][0])

    best=max(states,key=score)
    result={}
    for bucket,target,done in [('Technical Elective',MEEN_TECHNICAL_REQUIRED_CREDITS,technical_done(best)),
                               (GENERAL_TYPE,MEEN_GENERAL_REQUIRED_CREDITS,best[4]>=MEEN_GENERAL_REQUIRED_CREDITS)]:
        selected=[c for c,b in states[best][1] if b==bucket]
        earned=sum(credits[c] for c in selected)
        result[bucket]={**_progress(target,earned,done),'applied_courses':selected}
    result['Technical Elective'].update(covered_area_mask=best[1],meen_course_count=best[2],non_meen_credits=best[3])
    return result


def check_major(completed_courses,catalog_path=None,*,non_meen_courses=None,
                general_courses=None,high_impact_confirmed=False,course_credits=None):
    if isinstance(completed_courses,(str,bytes,dict)):
        raise ValueError('completed_courses must be a list of course codes.')
    if not isinstance(high_impact_confirmed,bool):
        raise ValueError('high_impact_confirmed must be boolean.')
    if course_credits is not None and not isinstance(course_credits,dict):
        raise ValueError('course_credits must be an object.')
    path=Path(catalog_path or DEFAULT_CATALOG)
    data=_load(path)
    aliases,credits,required,choices,groups=_parse(data)
    norm=lambda c: normalize(c,aliases)
    completed={norm(c) for c in completed_courses}
    for raw,value in (course_credits or {}).items():
        code,hours=norm(raw),_credits(value)
        if code in credits and credits[code]!=hours:
            raise ValueError(f'Conflicting credit values for {code}')
        credits[code]=hours
    custom={NON_MEEN_TYPE:[],GENERAL_TYPE:[]}
    for records,category,placeholder in [(non_meen_courses,NON_MEEN_TYPE,'NON_MEEN_TECHNICAL_ELECTIVE'),
                                        (general_courses,GENERAL_TYPE,'GENERAL_ELECTIVE')]:
        if records is None:
            records=[]
        if not isinstance(records,list) or any(not isinstance(x,dict) for x in records):
            raise ValueError(f'{category}: records must be a list of objects.')
        if records and placeholder not in data:
            raise ValueError(f'{placeholder} is absent from the supplied JSON.')
        seen=set()
        for record in records:
            code=norm(record.get('course_id',''))
            if code in seen:
                raise ValueError(f'Duplicate {category} record: {code}')
            seen.add(code)
            name=record.get('name',code)
            if not isinstance(name,str) or not name.strip():
                raise ValueError('Custom courses need a nonempty name.')
            hours=_credits(record.get('credits'))
            if not hours:
                raise ValueError('Custom courses must have positive credits.')
            checked=record.get('completed',False)
            if not isinstance(checked,bool):
                raise ValueError('Custom course completed must be boolean.')
            if category==NON_MEEN_TYPE and code.startswith('MEEN'):
                raise ValueError('Non-MEEN technical entries must not have a MEEN prefix.')
            if category==GENERAL_TYPE and not 300<=int(re.search(r'\d+$',code).group())<=499:
                raise ValueError('General electives must be 300-499 courses.')
            if code in credits and credits[code]!=hours:
                raise ValueError(f'Conflicting credit values for {code}')
            credits[code]=hours
            if checked:
                completed.add(code)
            custom[category].append({'course_id':code,'canonical_id':code,'name':name.strip(),'credits':hours})
    for entry in required+choices:
        if entry['experience'] and high_impact_confirmed and not set(entry['codes'])&completed:
            completed.add(entry['codes'][0])
    area_masks={}
    technical=set()
    for i,category in enumerate(AREA_TYPES):
        for raw in groups.get(category,set()):
            code=norm(raw)
            if not code.startswith('MEEN'):
                raise ValueError(f'{category} must contain MEEN courses.')
            area_masks[code]=area_masks.get(code,0)|(1<<i)
            technical.add(code)
    technical.update(norm(c) for c in groups.get(SPECIAL_TYPE,set()))
    non_meen={r['course_id'] for r in custom[NON_MEEN_TYPE]}
    non_meen.update(norm(c) for c in groups.get(NON_MEEN_TYPE,set()))
    technical.update(non_meen)
    # The official general elective rule is any 300-499 course; options come
    # from this JSON and supplied student records, without a separate catalog.
    general={c for c,h in credits.items() if h>0 and 300<=int(re.search(r'\d+$',c).group())<=499}
    fixed={e['codes'][0] for e in required}
    fixed_applied=fixed&completed
    choice_options=[sorted(set(e['codes'])&completed) or [None] for e in choices]
    best=None
    for selected in itertools.product(*choice_options):
        chosen=[c for c in selected if c]
        if len(chosen)!=len(set(chosen)) or set(chosen)&fixed_applied:
            continue
        core=fixed_applied|set(chosen)
        electives=_allocate((completed&credits.keys())-core,credits,technical,non_meen,area_masks,general)
        applied=core|set().union(*(set(v['applied_courses']) for v in electives.values()))
        tech=electives['Technical Elective']
        score=(len(chosen)+sum(v['complete'] for v in electives.values()),
               tech['covered_area_mask'].bit_count(),tech['meen_course_count'],
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

    def custom_options(category,used):
        return [{**r,'completed':r['course_id'] in completed,'applied_here':r['course_id'] in used}
                for r in custom[category]]

    def card(entry,used,kind):
        earned=sum(credits[c] for c in used)
        return {'id':entry['id'],'kind':kind,'show_dropdown':len(entry['raw'])>1,'multiple':True,
                'required_courses':1,**_progress(entry['credits'],earned,bool(used)),
                'applied_courses':sorted(used),'options':options(entry['raw'],used)}

    cards=[card(e,set(e['codes'])&completed,'experience' if e['experience'] else 'required') for e in required]
    cards.extend(card(e,{c} if c else set(),'experience' if e['experience'] else 'choose_one') for e,c in zip(choices,selected))
    tech=electives['Technical Elective']
    tech_used=set(tech['applied_courses'])
    subrequirements=[]
    option_groups=[]
    for category in (*AREA_TYPES,SPECIAL_TYPE):
        raw=groups.get(category,set())
        used={norm(c) for c in raw}&tech_used
        mandatory=category in AREA_TYPES
        group={'id':category,'name':category,'is_requirement':mandatory,'optional':not mandatory,
               'options':options(raw,used)}
        option_groups.append(group)
        if mandatory:
            subrequirements.append({'id':category,'required_courses':1,'completed_courses':len(used),
                                    'remaining_courses':max(0,1-len(used)),'complete':bool(used),
                                    'applied_courses':sorted(used),'options':options(raw,used),
                                    'credits_included_in_parent':True})
    non_group={'id':NON_MEEN_TYPE,'name':NON_MEEN_TYPE,'is_requirement':False,'optional':True,
               'max_credits':MEEN_NON_MEEN_MAX_CREDITS,'earned_credits':tech['non_meen_credits'],
               'show_dropdown':True,'multiple':True,'allow_custom_courses':'NON_MEEN_TECHNICAL_ELECTIVE' in data,
               'input_fields':['course_id','name','credits','completed'],
               'advisor_required':True,'advisor_approval_verified':False,
               'options':options(groups.get(NON_MEEN_TYPE,set()),tech_used)+custom_options(NON_MEEN_TYPE,tech_used)}
    option_groups.append(non_group)
    tech_raw=set().union(*(groups.get(c,set()) for c in (*AREA_TYPES,SPECIAL_TYPE,NON_MEEN_TYPE)))
    cards.append({'id':'Technical Elective','kind':'elective','show_dropdown':True,'multiple':True,
                  **tech,'minimum_meen_courses':MEEN_TECHNICAL_MINIMUM_MEEN_COURSES,
                  'subrequirements':subrequirements,'option_groups':option_groups,
                  'allow_custom_courses':False,
                  'options':options(tech_raw,tech_used)+custom_options(NON_MEEN_TYPE,tech_used),
                  'helper_text':'12 credits total; at least one MEEN course from each required area. Optional non-MEEN credits are capped at 3.'})
    gen=electives[GENERAL_TYPE]
    gen_used=set(gen['applied_courses'])
    gen_options=options(general,gen_used)
    display={r['course_id']:r for r in custom[GENERAL_TYPE]}
    gen_options=[{**o,**({'name':display[o['canonical_id']]['name']} if o['canonical_id'] in display else {})} for o in gen_options]
    cards.append({'id':GENERAL_TYPE,'kind':'elective','show_dropdown':True,'multiple':True,**gen,
                  'allow_custom_courses':'GENERAL_ELECTIVE' in data,
                  'input_fields':['course_id','name','credits','completed'],
                  'options':gen_options,'helper_text':'Any 300-499 course, counted once across degree requirements.'})
    fixed_target=sum(credits[c] for c in fixed)
    choice_target=sum(e['credits'] for e in choices)
    high_done=all(c['complete'] for c in cards if c['kind']=='experience')
    progress={'fixed_required':_progress(fixed_target,sum(credits[c] for c in fixed_applied),fixed<=completed),
              'required_choices':_progress(choice_target,sum(credits[c] for c in selected if c),all(selected)),
              'high_impact':_progress(0,0,high_done),**electives}
    unknown=sorted(completed-credits.keys())
    warnings=['Checks only the supplied JSON requirements, not full graduation eligibility.',
              'Advisor approval, special-topic area substitutions and non-MEEN technical suitability are not verified.',
              'Individual course credits and lists are read from your JSON. General eligibility uses the official 300-499 rule.']
    if any(r['credits']>MEEN_NON_MEEN_MAX_CREDITS for r in custom[NON_MEEN_TYPE]):
        warnings.append('Non-MEEN entries above 3 credits cannot be allocated under the strict technical cap; full credits remain in total when completed.')
    if unknown:
        warnings.append('Missing credit values; total_credits is partial: '+', '.join(unknown))
    earned=sum(credits[c] for c in applied)
    return {'major':'MEEN','degree':'BS','catalog_year':'2026-2027','scope':'major_only',
            'source_file':path.name,'requirements_list':path.stem,path.stem:cards,
            'credit_requirements':{'fixed_required':fixed_target,'required_choices':choice_target,
                                   'choice_groups':{e['id']:e['credits'] for e in choices},
                                   'Technical Elective':MEEN_TECHNICAL_REQUIRED_CREDITS,
                                   GENERAL_TYPE:MEEN_GENERAL_REQUIRED_CREDITS,'high_impact':0,
                                   'minimum_meen_technical_courses':MEEN_TECHNICAL_MINIMUM_MEEN_COURSES,
                                   'non_meen_technical_maximum':MEEN_NON_MEEN_MAX_CREDITS,
                                   'major_minimum':fixed_target+choice_target+MEEN_TECHNICAL_REQUIRED_CREDITS+MEEN_GENERAL_REQUIRED_CREDITS,
                                   'full_degree_total':MEEN_DEGREE_TOTAL_REQUIRED_CREDITS},
            'requirement_progress':progress,'electives':electives,
            'technical_area_requirements':subrequirements,
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
    parser.add_argument('--non-meen',type=Path)
    parser.add_argument('--general',type=Path)
    parser.add_argument('--high-impact-confirmed',action='store_true')
    args=parser.parse_args()
    try:
        read=lambda p: json.loads(p.read_text()) if p else []
        completed=read(args.student) if args.student else args.completed
        extra=read(args.course_credits) if args.course_credits else {}
        print(json.dumps(check_major(completed,args.catalog,non_meen_courses=read(args.non_meen),
                                    general_courses=read(args.general),high_impact_confirmed=args.high_impact_confirmed,
                                    course_credits=extra),indent=2))
    except (ValueError,TypeError,KeyError,OSError) as error:
        parser.exit(1,f'Error: {error}\n')
