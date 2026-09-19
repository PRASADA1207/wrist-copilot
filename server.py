import json
import os
import re
import time
import base64
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib import request, error

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3000"))
AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION")
AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY")
GOOGLE_FIT_ACCESS_TOKEN = os.environ.get("GOOGLE_FIT_ACCESS_TOKEN")
AZURE_OPENAI_TTS_ENDPOINT = os.environ.get("AZURE_OPENAI_TTS_ENDPOINT")
AZURE_OPENAI_TTS_KEY = os.environ.get("AZURE_OPENAI_TTS_KEY")


def local_analyze(turns):
    text = " ".join([f"{t.get('speaker', 'Speaker')}: {t.get('text', '')}" for t in turns])
    summary = [
        "Person A and Person B discussed launch readiness, security sign-off, onboarding communication, and adoption metrics.",
        "Decision: proceed with secure rollout and track outcomes through Teams dashboards."
    ]
    actions = []
    if "security" in text.lower():
        actions.append("Security Team: complete sign-off and share validation evidence.")
    if "onboarding" in text.lower() or "communication" in text.lower():
        actions.append("Person A: send onboarding communication draft to pilot stakeholders.")
    if "metrics" in text.lower() or "dashboard" in text.lower() or "teams" in text.lower():
        actions.append("Person B: publish and maintain usage dashboard in Teams.")
    if not actions:
        actions.append("Assign owners and due dates for next steps from the meeting.")
    return {"summary": summary, "actions": actions, "source": "local-fallback"}


def analyze_with_azure_openai(turns):
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")

    if not endpoint or not api_key or not deployment:
        return None

    transcript = "\n".join([f"{t.get('speaker', 'Speaker')}: {t.get('text', '')}" for t in turns])
    prompt = "\n".join(
        [
            "You are an enterprise meeting assistant.",
            "Return strict JSON with this schema: {\"summary\":[\"...\"],\"actions\":[\"...\"]}.",
            "Provide 2 summary lines and 3-5 concise actions with owners.",
            "Transcript:",
            transcript,
        ]
    )

    payload = {
        "messages": [
            {"role": "system", "content": "You produce concise structured meeting outputs."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    payload_bytes = json.dumps(payload).encode("utf-8")

    url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
    req = request.Request(url, data=payload_bytes, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("api-key", api_key)

    with request.urlopen(req, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    summary = parsed.get("summary", [])
    actions = parsed.get("actions", [])
    return {"summary": summary, "actions": actions, "source": "azure-openai"}


def summarize_health_with_azure_openai(metrics):
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
    deployment = os.environ.get("AZURE_OPENAI_HEALTH_DEPLOYMENT") or os.environ.get("AZURE_OPENAI_DEPLOYMENT")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")

    if not endpoint or not api_key or not deployment:
        return None

    prompt = (
        "You are a concise wellness assistant.\n"
        "Return strict JSON with {\"summary\":[\"...\"],\"suggestions\":[\"...\"]}.\n"
        "Use exactly 2 summary lines and 3 short suggestions.\n"
        f"Metrics: steps={metrics.get('steps', 0)}, heartPoints={metrics.get('heartPoints', 0)}, "
        f"calories={metrics.get('calories', 0)}, activeMinutes={metrics.get('activeMinutes', 0)}"
    )
    payload = {
        "messages": [
            {"role": "system", "content": "You produce short wellness summaries."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    payload_bytes = json.dumps(payload).encode("utf-8")

    url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
    req = request.Request(url, data=payload_bytes, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("api-key", api_key)

    with request.urlopen(req, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            raise
        parsed = json.loads(match.group(0))
    return {
        "summary": parsed.get("summary", []),
        "suggestions": parsed.get("suggestions", []),
        "healthModelSource": "azure-openai",
    }


def local_health_summary(metrics):
    steps = int(metrics.get("steps", 0))
    heart_points = int(metrics.get("heartPoints", 0))
    calories = int(metrics.get("calories", 0))
    active_minutes = int(metrics.get("activeMinutes", 0))

    summary = [
        f"Daily activity: {steps:,} steps, {active_minutes} active minutes, and {heart_points} heart points.",
        f"Estimated burn is {calories:,} calories for today.",
    ]
    suggestions = []
    if steps < 6000:
        suggestions.append("Add a short 15-20 minute walk to improve step count.")
    else:
        suggestions.append("Great momentum on steps — maintain this pace through evening.")
    if active_minutes < 30:
        suggestions.append("Target at least 30 active minutes to strengthen consistency.")
    else:
        suggestions.append("Active minutes look strong today — keep hydration steady.")
    suggestions.append("Set Wrist Copilot reminders for movement breaks between meetings.")
    return {"summary": summary, "suggestions": suggestions, "healthModelSource": "local-heuristic-v2"}


def _millis_start_of_day_utc():
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(start.timestamp() * 1000), int(now.timestamp() * 1000)


def _sum_points(points):
    total = 0.0
    for point in points:
        for value in point.get("value", []):
            if "intVal" in value:
                total += value["intVal"]
            elif "fpVal" in value:
                total += value["fpVal"]
    return total


def fetch_google_fit_metrics():
    if not GOOGLE_FIT_ACCESS_TOKEN:
        return None

    start_ms, end_ms = _millis_start_of_day_utc()
    payload = {
        "aggregateBy": [
            {"dataTypeName": "com.google.step_count.delta"},
            {"dataTypeName": "com.google.heart_minutes"},
            {"dataTypeName": "com.google.calories.expended"},
            {"dataTypeName": "com.google.active_minutes"},
        ],
        "bucketByTime": {"durationMillis": 86400000},
        "startTimeMillis": start_ms,
        "endTimeMillis": end_ms,
    }
    payload_bytes = json.dumps(payload).encode("utf-8")

    req = request.Request(
        "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        data=payload_bytes,
        method="POST",
    )
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {GOOGLE_FIT_ACCESS_TOKEN}")

    with request.urlopen(req, timeout=25) as response:
        data = json.loads(response.read().decode("utf-8"))

    metrics = {"steps": 0, "heartPoints": 0, "calories": 0, "activeMinutes": 0}
    for bucket in data.get("bucket", []):
        for dataset in bucket.get("dataset", []):
            source_id = dataset.get("dataSourceId", "")
            points = dataset.get("point", [])
            value = _sum_points(points)
            if "step_count" in source_id:
                metrics["steps"] += int(value)
            elif "heart_minutes" in source_id:
                metrics["heartPoints"] += int(value)
            elif "calories.expended" in source_id:
                metrics["calories"] += int(round(value))
            elif "active_minutes" in source_id:
                metrics["activeMinutes"] += int(value)
    return metrics


def simulated_health_metrics():
    seed = int(time.time() // 3600)
    return {
        "steps": 6500 + (seed % 2800),
        "heartPoints": 18 + (seed % 18),
        "calories": 1400 + (seed % 500),
        "activeMinutes": 24 + (seed % 26),
    }


class WristHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_binary(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            self._send_json(200, {"ok": True})
            return
        if self.path == "/api/config":
            self._send_json(
                200,
                {
                    "speech": {
                        "enabled": bool(AZURE_SPEECH_REGION and AZURE_SPEECH_KEY),
                        "region": AZURE_SPEECH_REGION or None,
                        "locale": os.environ.get("AZURE_SPEECH_LOCALE", "en-US"),
                    },
                    "googleFit": {
                        "enabled": bool(GOOGLE_FIT_ACCESS_TOKEN),
                        "mode": "api" if GOOGLE_FIT_ACCESS_TOKEN else "demo-simulated",
                    },
                    "voiceBriefing": {
                        "enabled": bool(
                            (AZURE_OPENAI_TTS_ENDPOINT or os.environ.get("AZURE_OPENAI_ENDPOINT"))
                            and (AZURE_OPENAI_TTS_KEY or os.environ.get("AZURE_OPENAI_API_KEY"))
                        ),
                    },
                },
            )
            return
        if self.path == "/api/health/summary":
            try:
                source = "demo-simulated"
                metrics = fetch_google_fit_metrics()
                if metrics:
                    source = "google-fit-api"
                else:
                    metrics = simulated_health_metrics()

                insights = None
                try:
                    insights = summarize_health_with_azure_openai(metrics)
                except (error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
                    print(f"Azure health summary unavailable, using local heuristic: {exc}")

                if not insights:
                    insights = local_health_summary(metrics)

                payload = {
                    "source": source,
                    "metrics": metrics,
                    "summary": insights.get("summary", []),
                    "suggestions": insights.get("suggestions", []),
                    "healthModelSource": insights.get("healthModelSource", "local-heuristic-v2"),
                }
                self._send_json(200, payload)
            except Exception as exc:
                print(f"Health summary error: {exc}")
                self._send_json(500, {"error": "Failed to generate health summary"})
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/health/briefing-audio":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(content_length)
                payload = json.loads(raw_body.decode("utf-8") if raw_body else "{}")
                text = (payload.get("text") or "").strip()
                if not text:
                    self._send_json(400, {"error": "Missing text"})
                    return

                endpoint = AZURE_OPENAI_TTS_ENDPOINT
                api_key = AZURE_OPENAI_TTS_KEY or os.environ.get("AZURE_OPENAI_API_KEY")
                tts_deployment = os.environ.get("AZURE_OPENAI_TTS_DEPLOYMENT", "gpt-4o-mini-tts")
                tts_version = os.environ.get("AZURE_OPENAI_TTS_API_VERSION", "2025-03-01-preview")
                tts_voice = os.environ.get("AZURE_OPENAI_TTS_VOICE", "alloy")

                if not endpoint:
                    base_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
                    if base_endpoint:
                        endpoint = (
                            f"{base_endpoint}/openai/deployments/{tts_deployment}/audio/speech"
                            f"?api-version={tts_version}"
                        )

                if not endpoint or not api_key:
                    self._send_json(503, {"error": "TTS is not configured on server"})
                    return

                tts_payload = {
                    "model": tts_deployment,
                    "voice": tts_voice,
                    "input": text[:1200],
                    "format": "mp3",
                }
                tts_req = request.Request(
                    endpoint,
                    data=json.dumps(tts_payload).encode("utf-8"),
                    method="POST",
                )
                tts_req.add_header("Content-Type", "application/json")
                tts_req.add_header("api-key", api_key)

                with request.urlopen(tts_req, timeout=35) as tts_response:
                    audio_bytes = tts_response.read()

                payload = {
                    "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
                    "mimeType": "audio/mpeg",
                    "source": "azure-openai-tts",
                }
                self._send_json(200, payload)
            except json.JSONDecodeError:
                self._send_json(400, {"error": "Invalid JSON body"})
            except error.HTTPError as exc:
                print(f"TTS HTTP error: {exc}")
                if exc.code in (401, 403):
                    self._send_json(502, {"error": "TTS authorization failed. Check TTS key/endpoint."})
                elif exc.code == 404:
                    self._send_json(502, {"error": "TTS deployment endpoint not found. Check deployment name/version."})
                else:
                    self._send_json(502, {"error": "TTS service returned an error"})
            except Exception as exc:
                print(f"TTS error: {exc}")
                self._send_json(500, {"error": "Failed to generate voice briefing"})
            return

        if self.path == "/api/speech/token":
            if not AZURE_SPEECH_REGION or not AZURE_SPEECH_KEY:
                self._send_json(503, {"error": "Azure Speech is not configured on server"})
                return
            try:
                token_url = f"https://{AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
                token_req = request.Request(token_url, method="POST")
                token_req.add_header("Ocp-Apim-Subscription-Key", AZURE_SPEECH_KEY)
                token_req.add_header("Content-Length", "0")
                with request.urlopen(token_req, timeout=20) as response:
                    token = response.read().decode("utf-8")
                self._send_json(200, {"token": token, "region": AZURE_SPEECH_REGION})
            except Exception as exc:
                print(f"Speech token fetch failed: {exc}")
                self._send_json(500, {"error": "Failed to issue speech token"})
            return

        if self.path != "/api/meeting/analyze":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8") if raw_body else "{}")
            turns = payload.get("turns", [])

            if not isinstance(turns, list) or len(turns) == 0:
                self._send_json(400, {"error": "No transcript turns supplied"})
                return

            result = None
            try:
                result = analyze_with_azure_openai(turns)
            except (error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
                print(f"Azure OpenAI unavailable, using fallback: {exc}")

            if not result:
                result = local_analyze(turns)

            self._send_json(200, result)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON body"})
        except Exception as exc:
            print(f"Server error: {exc}")
            self._send_json(500, {"error": "Internal server error"})


def main():
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), WristHandler)
    print(f"Wrist Copilot prototype running at http://localhost:{PORT}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
