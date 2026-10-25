"""Serve CS BS, CS BA, CPEN, ELEN and MEEN on the existing port 5000.

Save as API/MEEN_API.py, with the matching Course_Backend/MEEN.py.
Keep the existing BS, BA, CPEN and ELEN backend/API files.
Stop the previous Python API process with Control+C, then run from repo root:
    python API/MEEN_API.py
Do not run multiple Python servers on port 5000. Keep the existing Vite process
and /api proxy; the internal 8443 port protocol remains HTTP.

Test from another terminal:
    curl http://127.0.0.1:8443/api/meen/requirements

GET /api/meen/requirements returns initial cards and the current JSON options.
POST /api/meen/check recalculates progress.
GET /api/meen/health reports service availability.
All previous major routes remain registered on this same app.

Example POST body:
{
  "completed_courses": ["MATH253", "MEEN405", "MEEN406", "MEEN404"],
  "high_impact_confirmed": true,
  "non_meen_courses": [
    {"course_id":"MATH401", "name":"Advanced Mathematics", "credits":3,
     "completed":true}
  ],
  "general_courses": [
    {"course_id":"MEEN473", "name":"Agile Technology Leadership", "credits":3,
     "completed":true}
  ],
  "course_credits": {}
}

Only submit successfully completed courses, not planned courses.
non_meen_courses and general_courses may contain unchecked records for display.
Each custom record needs course_id and credits; name defaults to course_id,
and completed defaults to false. Actual codes synchronize completion and prevent
reuse across categories. General electives require 300-499 course numbers.
The optional non-MEEN technical allocation is capped at 3 whole-course credits.
course_credits supplies credit values for other completed courses outside JSON;
known 300-499 courses may fill General if not allocated elsewhere.

register_routes attaches MEEN routes to the existing Flask app.
evaluate validates requests, calls MEEN.check_major and returns JSON.
create_app reuses the ELEN factory (which includes CPEN, BA and BS), then
registers MEEN. Existing CORS, JSON errors and request-size limits are inherited.
The frontend still needs a MEEN selector, area subrequirements and custom inputs
for the optional Non-MEEN group and the General Elective card.
This development API does not persist student records or verify advisor approval.
"""
import os
import sys
from pathlib import Path

from flask import jsonify, request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from API.ELEN_API import create_app as create_elen_app  # noqa: E402
from Course_Backend.MEEN import check_major  # noqa: E402


def register_routes(app, catalog_path=None):
    catalog = Path(catalog_path) if catalog_path else ROOT / 'Course_Data' / 'Major.json' / 'MEEN.json'

    def evaluate(payload):
        if not isinstance(payload, dict):
            return jsonify(error='Request body must be a JSON object.'), 400
        allowed = {'completed_courses', 'high_impact_confirmed', 'course_credits', 'non_meen_courses', 'general_courses'}
        if set(payload) - allowed:
            return jsonify(error='Unknown request fields: '+', '.join(sorted(set(payload)-allowed))), 400
        completed = payload.get('completed_courses', [])
        high_impact = payload.get('high_impact_confirmed', False)
        extra = payload.get('course_credits', {})
        non_meen = payload.get('non_meen_courses', [])
        general = payload.get('general_courses', [])
        if not isinstance(completed, list) or any(not isinstance(c, str) for c in completed):
            return jsonify(error='completed_courses must be a list of course codes.'), 400
        if any(not isinstance(records, list) or any(not isinstance(c, dict) for c in records)
               for records in (non_meen, general)):
            return jsonify(error='Custom course fields must be lists of course objects.'), 400
        if len(completed) > 250 or len(non_meen) > 100 or len(general) > 100:
            return jsonify(error='Too many course records.'), 400
        if not isinstance(high_impact, bool) or not isinstance(extra, dict):
            return jsonify(error='high_impact_confirmed must be boolean; course_credits must be an object.'), 400
        try:
            report = check_major(completed, catalog,
                                 high_impact_confirmed=high_impact, course_credits=extra,
                                 non_meen_courses=non_meen, general_courses=general)
        except FileNotFoundError:
            return jsonify(error='Course JSON not found. Check Course_Data/Major.json/MEEN.json.'), 500
        except (OSError, UnicodeError):
            app.logger.exception('Could not read MEEN course JSON')
            return jsonify(error='Unable to read course JSON.'), 500
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            return jsonify(error=str(error)), 400
        return jsonify(report)

    @app.get('/api/meen/requirements')
    def meen_requirements():
        return evaluate({})

    @app.post('/api/meen/check')
    def meen_check():
        return evaluate(request.get_json())

    @app.get('/api/meen/health')
    def meen_health():
        return jsonify(status='ok', major='MEEN')


def create_app(catalog_path=None, elen_catalog_path=None, cpen_catalog_path=None, ba_catalog_path=None, bs_catalog_path=None):
    app = create_elen_app(elen_catalog_path, cpen_catalog_path, ba_catalog_path, bs_catalog_path)
    register_routes(app, catalog_path)
    return app


app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '5000')), debug=False)