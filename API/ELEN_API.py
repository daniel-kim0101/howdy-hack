"""Serve CS BS, CS BA, CPEN and ELEN on the existing port 5000.

Save as API/ELEN_API.py, with the matching Course_Backend/ELEN.py.
Keep the existing BS, BA and CPEN backend/API files.
Stop the previous Python server with Control+C, then run from repository root:
    python API/ELEN_API.py
Do not run several Python servers on port 5000. Keep the existing Vite server
and /api proxy running. The internal 8443 port protocol remains HTTP.

Test from a separate terminal:
    curl http://127.0.0.1:8443/api/elen/requirements

GET /api/elen/requirements returns initial cards and current JSON options.
POST /api/elen/check recalculates completion and credits.
GET /api/elen/health reports service availability.

Example POST body:
{
  "completed_courses": ["MATH253", "CSCE350", "ECEN399", "CSCE313"],
  "high_impact_confirmed": false,
  "course_credits": {}
}

Send only completed courses, not planned courses. Optional course_credits
supplies values for extra completed courses outside the major JSON. An optional
high_impact_confirmed boolean also marks the zero-credit experience complete.
ELEN does not use senior_design_path, concentration_courses or complementary_courses.

register_routes attaches ELEN endpoints to an existing Flask app.
evaluate validates requests and returns the ELEN.check_major report as JSON.
create_app reuses the CPEN factory (including BS/BA), then registers ELEN.
Existing CORS, JSON error handling and request-size limits are inherited.
The frontend needs a separate ELEN selection/display change to use these routes.
This development API does not persist student records or verify advisor approval.
"""
import os
import sys
from pathlib import Path

from flask import jsonify, request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from API.CPEN_API import create_app as create_cpen_app  # noqa: E402
from Course_Backend.ELEN import check_major  # noqa: E402


def register_routes(app, catalog_path=None):
    catalog = Path(catalog_path) if catalog_path else ROOT / 'Course_Data' / 'Major.json' / 'ELEN.json'

    def evaluate(payload):
        if not isinstance(payload, dict):
            return jsonify(error='Request body must be a JSON object.'), 400
        allowed = {'completed_courses', 'high_impact_confirmed', 'course_credits'}
        if set(payload) - allowed:
            return jsonify(error='Unknown request fields: '+', '.join(sorted(set(payload)-allowed))), 400
        completed = payload.get('completed_courses', [])
        high_impact = payload.get('high_impact_confirmed', False)
        extra = payload.get('course_credits', {})
        if not isinstance(completed, list) or any(not isinstance(c, str) for c in completed):
            return jsonify(error='completed_courses must be a list of course codes.'), 400
        if len(completed) > 250:
            return jsonify(error='Too many course records.'), 400
        if not isinstance(high_impact, bool) or not isinstance(extra, dict):
            return jsonify(error='high_impact_confirmed must be boolean; course_credits must be an object.'), 400
        try:
            report = check_major(completed, catalog,
                                 high_impact_confirmed=high_impact, course_credits=extra)
        except FileNotFoundError:
            return jsonify(error='Course JSON not found. Check Course_Data/Major.json/ELEN.json.'), 500
        except (OSError, UnicodeError):
            app.logger.exception('Could not read ELEN course JSON')
            return jsonify(error='Unable to read course JSON.'), 500
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            return jsonify(error=str(error)), 400
        return jsonify(report)

    @app.get('/api/elen/requirements')
    def elen_requirements():
        return evaluate({})

    @app.post('/api/elen/check')
    def elen_check():
        return evaluate(request.get_json())

    @app.get('/api/elen/health')
    def elen_health():
        return jsonify(status='ok', major='ELEN')


def create_app(catalog_path=None, cpen_catalog_path=None, ba_catalog_path=None, bs_catalog_path=None):
    app = create_cpen_app(cpen_catalog_path, ba_catalog_path, bs_catalog_path)
    register_routes(app, catalog_path)
    return app


app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '5000')), debug=False)
