"""Serve existing CS BS / CS BA routes and new CPEN routes on port 5000.

Save as API/CPEN_API.py and keep the existing BS and BA backend/API files.
Also save the matching backend as Course_Backend/CPEN.py.
Stop the old Python API process with Control+C, then run from repository root:
    python API/CPEN_API.py
Do not run multiple API processes on port 5000. The existing Vite process,
/api proxy and HTTP protocol for the internal 8443 port remain configured.

Test from another terminal:
    curl http://127.0.0.1:8443/api/cpen/requirements

Existing /api/cpsc-bs/... and /api/cpsc-ba/... routes remain available.
The frontend still needs a CPEN major selector and senior-design route control.

New endpoints:
GET /api/cpen/requirements returns initial cards and current JSON options.
POST /api/cpen/check recalculates progress from completed course state.
GET /api/cpen/health reports service availability.

Example POST body:
{
  "completed_courses": ["CSCE120", "ECEN403", "ECEN404", "ECEN399"],
  "high_impact_confirmed": false,
  "senior_design_path": "ecen",
  "course_credits": {}
}

completed_courses contains successfully completed courses, not planned ones.
high_impact_confirmed is an optional boolean completion claim.
senior_design_path accepts auto, ecen or csce; the default is auto.
course_credits optionally supplies credit values outside the major JSON;
only courses also marked completed contribute to total credits.
The BS complementary_courses and BA concentration_courses fields are not used.

register_routes attaches CPEN endpoints to the existing Flask app.
evaluate validates requests, calls CPEN.check_major and returns JSON.
create_app reuses the BA factory, which includes BS, then registers CPEN.
Existing CORS, request-size limits and JSON error handling are inherited.
app.run starts the development service, using port 5000 unless PORT is set.

This API does not persist student records or verify advisor approval.
"""

import os
import sys
from pathlib import Path

from flask import jsonify, request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from API.CPSC_BA_API import create_app as create_ba_app  # noqa: E402
from Course_Backend.CPEN import check_major  # noqa: E402


def register_routes(app, catalog_path=None):
    """Attach CPEN routes to the existing server, sharing its CORS/error handling."""
    catalog = Path(catalog_path) if catalog_path else ROOT / "Course_Data" / "Major.json" / "CPEN.json"

    def evaluate(payload):
        if not isinstance(payload, dict):
            return jsonify(error="Request body must be a JSON object."), 400
        allowed = {"completed_courses", "high_impact_confirmed", "senior_design_path", "course_credits"}
        if set(payload) - allowed:
            return jsonify(error="Unknown request fields: " + ", ".join(sorted(set(payload) - allowed))), 400
        completed = payload.get("completed_courses", [])
        high_impact = payload.get("high_impact_confirmed", False)
        design_path = payload.get("senior_design_path", "auto")
        extra = payload.get("course_credits", {})
        if not isinstance(completed, list) or any(not isinstance(c, str) for c in completed):
            return jsonify(error="completed_courses must be a list of course codes."), 400
        if not isinstance(high_impact, bool) or not isinstance(design_path, str):
            return jsonify(error="high_impact_confirmed must be boolean; senior_design_path must be a string."), 400
        if len(completed) > 250:
            return jsonify(error="Too many course records."), 400
        if not isinstance(extra, dict):
            return jsonify(error="course_credits must be an object."), 400
        try:
            report = check_major(completed, catalog,
                                 high_impact_confirmed=high_impact, senior_design_path=design_path,
                                 course_credits=extra)
        except FileNotFoundError:
            return jsonify(error="Course JSON not found. Check Course_Data/Major.json/CPEN.json."), 500
        except (OSError, UnicodeError):
            app.logger.exception("Could not read CPEN course JSON")
            return jsonify(error="Unable to read course JSON."), 500
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            return jsonify(error=str(error)), 400
        return jsonify(report)

    @app.get("/api/cpen/requirements")
    def cpen_requirements():
        return evaluate({})

    @app.post("/api/cpen/check")
    def cpen_check():
        return evaluate(request.get_json())

    @app.get("/api/cpen/health")
    def cpen_health():
        return jsonify(status="ok", major="CPEN")


def create_app(catalog_path=None, ba_catalog_path=None, bs_catalog_path=None):
    app = create_ba_app(ba_catalog_path, bs_catalog_path)
    # Reuse the existing app's CORS and JSON error handlers.
    # The current frontend connects through the Vite /api proxy.
    register_routes(app, catalog_path)
    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
