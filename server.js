const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Request payload too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function localAnalyze(turns) {
  const text = turns.map((t) => `${t.speaker}: ${t.text}`).join(" ");
  const summary = [
    "Person A and Person B discussed launch readiness, security sign-off, communication, and adoption tracking.",
    "Main outcome: proceed with secure rollout while assigning concrete follow-up ownership."
  ];

  const actions = [];
  if (/security/i.test(text)) {
    actions.push("Security Team: complete sign-off milestone and circulate evidence.");
  }
  if (/onboarding|communication/i.test(text)) {
    actions.push("Person A: share onboarding communication draft with stakeholders.");
  }
  if (/metrics|dashboard|teams/i.test(text)) {
    actions.push("Person B: publish meeting adoption metrics dashboard in Teams.");
  }
  if (actions.length === 0) {
    actions.push("Assign owners and due dates for all discussed next steps.");
  }

  return { summary, actions, source: "local-fallback" };
}

async function analyzeWithAzureOpenAI(turns) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";

  if (!endpoint || !apiKey || !deployment) {
    return null;
  }

  const meetingText = turns.map((t) => `${t.speaker}: ${t.text}`).join("\n");
  const prompt = [
    "You are an enterprise meeting assistant.",
    "Return strict JSON with this schema: {\"summary\":[\"...\",\"...\"],\"actions\":[\"...\"]}.",
    "Keep summary to 2 lines max and actions to 3-5 concise owner-based tasks.",
    "Meeting transcript:",
    meetingText
  ].join("\n");

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You produce concise structured meeting outputs." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Azure OpenAI failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Azure OpenAI returned empty content");
  }

  const parsed = JSON.parse(content);
  const summary = Array.isArray(parsed.summary) ? parsed.summary : [];
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  return { summary, actions, source: "azure-openai" };
}

function serveStatic(req, res) {
  const cleanPath = decodeURIComponent(req.url.split("?")[0]);
  const relative = cleanPath === "/" ? "/index.html" : cleanPath;
  const absolutePath = path.join(ROOT, relative);

  if (!absolutePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden path" });
    return;
  }

  fs.readFile(absolutePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendJson(res, 500, { error: "Failed to read file" });
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/meeting/analyze") {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const turns = Array.isArray(body.turns) ? body.turns : [];
      if (turns.length === 0) {
        sendJson(res, 400, { error: "No transcript turns supplied" });
        return;
      }

      let result = null;
      try {
        result = await analyzeWithAzureOpenAI(turns);
      } catch (azureError) {
        console.warn("Azure OpenAI unavailable, using local fallback:", azureError.message);
      }
      if (!result) {
        result = localAnalyze(turns);
      }
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error("Unhandled server error:", error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Wrist Copilot prototype running at http://localhost:${PORT}`);
});
