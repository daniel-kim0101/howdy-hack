"""Serve BOTH the existing CS BS routes and the new CS BA routes on port 5000.

Run from repository root: python API/CPSC_BA_API.py
Requires the existing API/CPSC_BS_API.py and Course_Backend/CPSC_BS.py.
Stop the old API process first; do not run two servers on port 5000.
"""

import os
import sys
from pathlib import Path

from flask import jsonify, request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from API.CPSC_BS_API import create_app as create_bs_app  # noqa: E402
from Course_Backend.CPSC_BA import check_major  # noqa: E402


def register_routes(app, catalog_path=None):
    """Attach BA routes to the existing server, sharing its CORS/error handling."""
    catalog = Path(catalog_path) if catalog_path else ROOT / "Course_Data" / "Major.json" / "CPSC_BA.json"

    def evaluate(payload):
        if not isinstance(payload, dict):
            return jsonify(error="Request body must be a JSON object."), 400
        allowed = {"completed_courses", "concentration_courses", "course_credits"}
        if set(payload) - allowed:
            return jsonify(error="Unknown request fields: " + ", ".join(sorted(set(payload) - allowed))), 400
        completed = payload.get("completed_courses", [])
        concentration = payload.get("concentration_courses", [])
        extra = payload.get("course_credits", {})
        if not isinstance(completed, list) or any(not isinstance(c, str) for c in completed):
            return jsonify(error="completed_courses must be a list of course codes."), 400
        if not isinstance(concentration, list) or any(not isinstance(c, dict) for c in concentration):
            return jsonify(error="concentration_courses must be a list of course records."), 400
        if len(completed) > 250 or len(concentration) > 100:
            return jsonify(error="Too many course records."), 400
        if not isinstance(extra, dict):
            return jsonify(error="course_credits must be an object."), 400
        try:
            report = check_major(completed, catalog,
                                 concentration_courses=concentration, course_credits=extra)
        except FileNotFoundError:
            return jsonify(error="Course JSON not found. Check Course_Data/Major.json/CPSC_BA.json."), 500
        except (OSError, UnicodeError):
            app.logger.exception("Could not read BA course JSON")
            return jsonify(error="Unable to read course JSON."), 500
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            return jsonify(error=str(error)), 400
        return jsonify(report)

    @app.get("/api/cpsc-ba/requirements")
    def ba_requirements():
        return evaluate({})

    @app.post("/api/cpsc-ba/check")
    def ba_check():
        return evaluate(request.get_json())

    @app.get("/api/cpsc-ba/health")
    def ba_health():
        return jsonify(status="ok", major="CPSC_BA")


def create_app(catalog_path=None, bs_catalog_path=None):
    app = create_bs_app(bs_catalog_path)
    # Reuse the BS app's existing CORS and JSON error handlers.
    # The current frontend connects through the Vite /api proxy.
    register_routes(app, catalog_path)
    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
