"""HTTP adapter for Course_Backend/CPSC_BS.py; run from the repo root.

    python -m pip install -r requirements-api.txt
    python API/CPSC_BS_API.py

GET /api/cpsc-bs/requirements loads the current JSON options.
POST /api/cpsc-bs/check recalculates progress from completed course state.
This development API does not persist student data or verify advisor approval.
"""

import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from Course_Backend.CPSC_BS import check_major  # noqa: E402


def create_app(catalog_path=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 128 * 1024
    catalog = Path(catalog_path) if catalog_path else ROOT / "Course_Data" / "Major.json" / "CPSC_BS.json"
    allowed_origins = {"http://localhost:5173", "http://127.0.0.1:5173"}
    allowed_origins.update(s.strip().rstrip("/") for s in os.getenv("FRONTEND_ORIGINS", "").split(",") if s.strip())
    codespace = os.getenv("CODESPACE_NAME")
    if codespace:
        domain = os.getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev")
        allowed_origins.add(f"https://{codespace}-5173.{domain}")

    @app.before_request
    def check_origin():
        origin = request.headers.get("Origin")
        # No credentials/cookies are used by this API.
        if origin and origin.rstrip("/") not in allowed_origins:
            return jsonify(error="Frontend origin is not allowed. Add its URL to FRONTEND_ORIGINS."), 403
        if request.method == "OPTIONS":
            return "", 204

    @app.after_request
    def add_headers(response):
        origin = request.headers.get("Origin")
        if origin and origin.rstrip("/") in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.vary.add("Origin")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    def evaluate(payload):
        if not isinstance(payload, dict):
            return jsonify(error="Request body must be a JSON object."), 400
        allowed = {"completed_courses", "complementary_courses", "high_impact_confirmed", "course_credits"}
        if set(payload) - allowed:
            return jsonify(error="Unknown request fields: " + ", ".join(sorted(set(payload) - allowed))), 400
        completed = payload.get("completed_courses", [])
        complementary = payload.get("complementary_courses", [])
        high_impact = payload.get("high_impact_confirmed", False)
        extra = payload.get("course_credits", {})
        if not isinstance(completed, list) or any(not isinstance(c, str) for c in completed):
            return jsonify(error="completed_courses must be a list of course codes."), 400
        if not isinstance(complementary, list) or any(not isinstance(c, dict) for c in complementary):
            return jsonify(error="complementary_courses must be a list of course records."), 400
        if len(completed) > 250 or len(complementary) > 100:
            return jsonify(error="Too many course records."), 400
        if not isinstance(high_impact, bool) or not isinstance(extra, dict):
            return jsonify(error="high_impact_confirmed must be boolean; course_credits must be an object."), 400
        try:
            report = check_major(completed, catalog, complementary_courses=complementary,
                                 high_impact_confirmed=high_impact, course_credits=extra)
        except FileNotFoundError:
            return jsonify(error="Course JSON not found. Check Course_Data/Major.json/CPSC_BS.json."), 500
        except (OSError, UnicodeError):
            app.logger.exception("Could not read course JSON")
            return jsonify(error="Unable to read course JSON."), 500
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            return jsonify(error=str(error)), 400
        return jsonify(report)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", major="CPSC_BS")

    @app.get("/api/cpsc-bs/requirements")
    def requirements():
        return evaluate({})

    @app.post("/api/cpsc-bs/check")
    def check():
        return evaluate(request.get_json())

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
