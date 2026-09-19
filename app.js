const sampleMeetingTurns = [
  { speaker: "Person A", text: "We need to finalize the launch timeline for Wrist Copilot." },
  { speaker: "Person B", text: "Agreed. Security sign-off should be complete by October 10." },
  { speaker: "Person A", text: "I will send onboarding communication for pilot users this week." },
  { speaker: "Person B", text: "Please publish usage metrics in Teams so leadership can track adoption." },
];

const transcriptFeed = document.getElementById("transcriptFeed");
const summaryFeed = document.getElementById("summaryFeed");
const actionsFeed = document.getElementById("actionsFeed");
const watchStatus = document.getElementById("watchStatus");
const watchText = document.getElementById("watchText");
const startDemoBtn = document.getElementById("startDemoBtn");
const resetDemoBtn = document.getElementById("resetDemoBtn");
const simulateMeetingBtn = document.getElementById("simulateMeetingBtn");
const startLiveConversationBtn = document.getElementById("startLiveConversationBtn");
const stopLiveConversationBtn = document.getElementById("stopLiveConversationBtn");
const holdATalkBtn = document.getElementById("holdATalkBtn");
const holdBTalkBtn = document.getElementById("holdBTalkBtn");
const analyzeNowBtn = document.getElementById("analyzeNowBtn");
const clearMeetingBtn = document.getElementById("clearMeetingBtn");
const speakerABtn = document.getElementById("speakerABtn");
const speakerBBtn = document.getElementById("speakerBBtn");
const liveConversationStatus = document.getElementById("liveConversationStatus");
const enableMicBtn = document.getElementById("enableMicBtn");
const micStatus = document.getElementById("micStatus");
const micLevel = document.getElementById("micLevel");
const demoModeBtn = document.getElementById("demoModeBtn");
const liveModeBtn = document.getElementById("liveModeBtn");
const modeHint = document.getElementById("modeHint");
const waveBars = [...document.querySelectorAll(".wave span")];
const clock = document.getElementById("clock");
const assistantFeed = document.getElementById("assistantFeed");
const assistantStatusText = document.getElementById("assistantStatusText");
const simulateAskBtn = document.getElementById("simulateAskBtn");
const watchPushToTalkBtn = document.getElementById("watchPushToTalkBtn");
const connectFitBtn = document.getElementById("connectFitBtn");
const refreshHealthBtn = document.getElementById("refreshHealthBtn");
const playHealthVoiceBtn = document.getElementById("playHealthVoiceBtn");
const healthStatus = document.getElementById("healthStatus");
const healthSteps = document.getElementById("healthSteps");
const healthHeartPoints = document.getElementById("healthHeartPoints");
const healthCalories = document.getElementById("healthCalories");
const healthActiveMinutes = document.getElementById("healthActiveMinutes");
const healthSummaryFeed = document.getElementById("healthSummaryFeed");
const healthSyncVisual = document.getElementById("healthSyncVisual");
const watchSceneIntro = document.getElementById("watchSceneIntro");
const watchSceneSync = document.getElementById("watchSceneSync");
const watchSceneGovernance = document.getElementById("watchSceneGovernance");
const watchSceneEscalation = document.getElementById("watchSceneEscalation");
const runGovernanceBtn = document.getElementById("runGovernanceBtn");
const approveGovernanceBtn = document.getElementById("approveGovernanceBtn");
const governanceStatus = document.getElementById("governanceStatus");
const governanceFeed = document.getElementById("governanceFeed");
const triggerEscalationBtn = document.getElementById("triggerEscalationBtn");
const resolveEscalationBtn = document.getElementById("resolveEscalationBtn");
const escalationStatus = document.getElementById("escalationStatus");
const escalationFeed = document.getElementById("escalationFeed");

let timers = [];
let waveTimer = null;
let watchSceneTimer = null;
let watchSceneInterval = null;
let watchScenePhase = "intro";
let watchSceneIndex = 0;
let activeMode = "demo";
let audioContext = null;
let analyser = null;
let sourceNode = null;
let micStream = null;
let micLevelTimer = null;
let currentTurns = [];
let activeSpeaker = "Person A";
let isLiveListening = false;
let recognition = null;
let shouldKeepRecognition = false;
let isStoppingRecognition = false;
let speechProvider = "none";
let speechLocale = "en-US";
let isPushToTalkMode = false;
let liveDraftText = "";
let liveDraftSpeaker = "";
let liveDraftNode = null;
let latestHealthBriefingText = "";
let governanceReadyForApproval = false;
let escalationActive = false;

function setClock() {
  const date = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  clock.textContent = `${hh}:${mm}`;
}

function addAssistantMsg(role, text) {
  const msg = document.createElement("div");
  msg.className = `assistant-msg ${role}`;
  msg.textContent = text;
  assistantFeed.appendChild(msg);
  assistantFeed.scrollTop = assistantFeed.scrollHeight;
}

function addFeedEntry(target, text, speaker) {
  if (!target) {
    return;
  }
  const entry = document.createElement("div");
  entry.className = "feed-entry";
  if (speaker) {
    const speakerTag = document.createElement("span");
    speakerTag.className = "speaker";
    speakerTag.textContent = `${speaker}:`;
    entry.appendChild(speakerTag);
  }
  entry.appendChild(document.createTextNode(text));
  target.appendChild(entry);
}

function addGovernanceEntry(text) {
  addFeedEntry(governanceFeed, text);
}

function addEscalationEntry(text) {
  addFeedEntry(escalationFeed, text);
}

function setWatchScene(scene) {
  watchScenePhase = scene;
  const sceneMap = {
    intro: watchSceneIntro,
    sync: watchSceneSync,
    governance: watchSceneGovernance,
    escalation: watchSceneEscalation,
  };
  Object.values(sceneMap).forEach((node) => {
    if (node) {
      node.classList.remove("active");
    }
  });
  if (sceneMap[scene]) {
    sceneMap[scene].classList.add("active");
  }
}

function stopWatchSceneLoop() {
  if (watchSceneTimer) {
    clearTimeout(watchSceneTimer);
    watchSceneTimer = null;
  }
  if (watchSceneInterval) {
    clearInterval(watchSceneInterval);
    watchSceneInterval = null;
  }
}

function runWatchFeatureTwoSequence() {
  stopWatchSceneLoop();
  const watchScenes = [
    { key: "intro", text: "Meeting Assistant" },
    { key: "governance", text: "Governance Assistant" },
    { key: "escalation", text: "Escalation Assistant" },
    { key: "sync", text: "Health Assistant" },
  ];
  watchSceneIndex = 0;
  setWatchScene(watchScenes[watchSceneIndex].key);
  watchText.textContent = watchScenes[watchSceneIndex].text;
  watchSceneInterval = setInterval(() => {
    watchSceneIndex = (watchSceneIndex + 1) % watchScenes.length;
    setWatchScene(watchScenes[watchSceneIndex].key);
    watchText.textContent = watchScenes[watchSceneIndex].text;
  }, 6000);
}

function clearTimers() {
  timers.forEach((timer) => clearTimeout(timer));
  timers = [];
  if (waveTimer) {
    clearInterval(waveTimer);
    waveTimer = null;
  }
  if (watchSceneTimer) {
    clearTimeout(watchSceneTimer);
    watchSceneTimer = null;
  }
  if (watchSceneInterval) {
    clearInterval(watchSceneInterval);
    watchSceneInterval = null;
  }
}

function animateWave(active) {
  if (!active) {
    waveBars.forEach((bar) => {
      bar.style.height = "8px";
    });
    return;
  }
  waveTimer = setInterval(() => {
    waveBars.forEach((bar) => {
      const next = 6 + Math.floor(Math.random() * 20);
      bar.style.height = `${next}px`;
    });
  }, 220);
}

function setMode(mode) {
  activeMode = mode;
  demoModeBtn.classList.toggle("chip-active", mode === "demo");
  liveModeBtn.classList.toggle("chip-active", mode === "live");
  if (mode === "demo") {
    modeHint.textContent = "Safe for offline challenge demos.";
    assistantStatusText.textContent = "Demo mode: simulated AI outputs for stage presentations.";
    addAssistantMsg("assistant", "Switched to Demo mode. I will use deterministic, stage-safe outputs.");
    return;
  }
  modeHint.textContent = "Shows production architecture intent with Copilot services.";
  assistantStatusText.textContent = "Live AI mode: backend API integration for secure processing.";
  addAssistantMsg("assistant", "Switched to Live AI mode. I will call the backend API for analysis.");
}

function setActiveSpeaker(speaker) {
  activeSpeaker = speaker;
  speakerABtn.classList.toggle("chip-active", speaker === "Person A");
  speakerBBtn.classList.toggle("chip-active", speaker === "Person B");
}

function stopMicMeter() {
  if (micLevelTimer) {
    clearInterval(micLevelTimer);
    micLevelTimer = null;
  }
  micLevel.style.width = "0%";
}

function startMicMeter() {
  if (!analyser) {
    return;
  }
  const data = new Uint8Array(analyser.frequencyBinCount);
  stopMicMeter();
  micLevelTimer = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const normalized = (data[i] - 128) / 128;
      sum += Math.abs(normalized);
    }
    const percent = Math.min(100, Math.round((sum / data.length) * 220));
    micLevel.style.width = `${percent}%`;
  }, 70);
}

async function enableMicrophone() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    micStatus.textContent = "This browser does not support microphone access.";
    return;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (!audioContext) {
      audioContext = new window.AudioContext();
    }
    sourceNode = audioContext.createMediaStreamSource(micStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(analyser);
    startMicMeter();
    micStatus.textContent = "Microphone enabled. Audio capture is active.";
    enableMicBtn.textContent = "Microphone Enabled";
    enableMicBtn.disabled = true;
  } catch (err) {
    micStatus.textContent = "Microphone permission denied or unavailable.";
    console.error("Mic enable failed:", err);
  }
}

function clearMeetingData() {
  currentTurns = [];
  transcriptFeed.innerHTML = "";
  summaryFeed.innerHTML = "";
  actionsFeed.innerHTML = "";
  clearLiveDraft();
}

function addLiveTurn(text) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }
  const turn = { speaker: activeSpeaker, text: normalized };
  currentTurns.push(turn);
  addFeedEntry(transcriptFeed, turn.text, turn.speaker);
}

function ensureLiveDraftNode() {
  if (!liveDraftNode) {
    liveDraftNode = document.createElement("div");
    liveDraftNode.className = "feed-entry";
    transcriptFeed.appendChild(liveDraftNode);
  }
  return liveDraftNode;
}

function updateLiveDraft(speaker, text) {
  const normalized = text.trim();
  if (!normalized) {
    clearLiveDraft();
    return;
  }
  liveDraftSpeaker = speaker;
  liveDraftText = normalized;
  const node = ensureLiveDraftNode();
  node.innerHTML = "";
  const speakerTag = document.createElement("span");
  speakerTag.className = "speaker";
  speakerTag.textContent = `${speaker} (listening):`;
  node.appendChild(speakerTag);
  node.appendChild(document.createTextNode(normalized));
}

function clearLiveDraft() {
  liveDraftText = "";
  liveDraftSpeaker = "";
  if (liveDraftNode) {
    liveDraftNode.remove();
    liveDraftNode = null;
  }
}

async function fetchSpeechConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
}

function handleRecognitionEnded() {
  if (isStoppingRecognition) {
    isStoppingRecognition = false;
    return;
  }
  if (shouldKeepRecognition && isLiveListening) {
    startRecognitionSession().catch(() => {
      liveConversationStatus.textContent = "Live restart failed.";
    });
  }
}

async function buildAzureRecognition() {
  if (!window.SpeechSDK) {
    return false;
  }
  const tokenResponse = await fetch("/api/speech/token", { method: "POST" });
  if (!tokenResponse.ok) {
    return false;
  }
  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload.token || !tokenPayload.region) {
    return false;
  }
  const speechConfig = window.SpeechSDK.SpeechConfig.fromAuthorizationToken(tokenPayload.token, tokenPayload.region);
  speechConfig.speechRecognitionLanguage = speechLocale || "en-US";
  const audioConfig = window.SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const sdkRecognizer = new window.SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  sdkRecognizer.recognizing = (_, event) => {
    if (event.result && event.result.text) {
      updateLiveDraft(activeSpeaker, event.result.text);
    }
  };
  sdkRecognizer.recognized = (_, event) => {
    if (event.result && event.result.reason === window.SpeechSDK.ResultReason.RecognizedSpeech && event.result.text) {
      addLiveTurn(event.result.text);
      clearLiveDraft();
    }
  };
  sdkRecognizer.canceled = (_, event) => {
    liveConversationStatus.textContent = `Live error: ${event.errorDetails || event.reason}`;
  };
  sdkRecognizer.sessionStopped = () => handleRecognitionEnded();

  recognition = {
    start: () => new Promise((resolve, reject) => sdkRecognizer.startContinuousRecognitionAsync(resolve, reject)),
    stop: () => new Promise((resolve, reject) => sdkRecognizer.stopContinuousRecognitionAsync(resolve, reject)),
    close: () => sdkRecognizer.close(),
  };
  speechProvider = "azure";
  return true;
}

function buildBrowserRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return false;
  }
  const browserRecognition = new SpeechRecognition();
  browserRecognition.continuous = true;
  browserRecognition.interimResults = true;
  browserRecognition.lang = speechLocale || "en-US";
  browserRecognition.onresult = (event) => {
    let interimCombined = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        addLiveTurn(result[0].transcript);
        clearLiveDraft();
      } else {
        interimCombined += ` ${result[0].transcript}`;
      }
    }
    if (interimCombined.trim()) {
      updateLiveDraft(activeSpeaker, interimCombined);
    }
  };
  browserRecognition.onerror = (event) => {
    liveConversationStatus.textContent = `Live error: ${event.error}`;
  };
  browserRecognition.onend = () => handleRecognitionEnded();
  recognition = browserRecognition;
  speechProvider = "browser";
  return true;
}

async function ensureRecognition() {
  if (recognition) {
    return true;
  }
  if (speechProvider === "azure") {
    try {
      if (await buildAzureRecognition()) {
        return true;
      }
    } catch (error) {
      console.warn("Azure speech unavailable. Falling back to browser speech.", error);
    }
  }
  return buildBrowserRecognition();
}

async function startRecognitionSession() {
  if (!recognition) {
    return;
  }
  const result = recognition.start();
  if (result && typeof result.then === "function") {
    await result;
  }
}

async function stopRecognitionSession() {
  if (!recognition) {
    return;
  }
  const result = recognition.stop();
  if (result && typeof result.then === "function") {
    await result;
  }
}

function resetWatchState() {
  watchStatus.textContent = "Idle";
  watchStatus.style.background = "#1f3f2f";
  watchStatus.style.color = "#b3f5cf";
  runWatchFeatureTwoSequence();
}

async function startLiveConversation() {
  if (!(await ensureRecognition())) {
    liveConversationStatus.textContent = "Live conversation unsupported in this browser.";
    return;
  }
  if (!micStream) {
    await enableMicrophone();
  }
  if (isLiveListening) {
    return;
  }
  try {
    stopWatchSceneLoop();
    shouldKeepRecognition = true;
    isLiveListening = true;
    await startRecognitionSession();
    watchStatus.textContent = "Recording";
    watchStatus.style.background = "#4a2333";
    watchStatus.style.color = "#ffc2d7";
    watchText.textContent = "Listening...";
    liveConversationStatus.textContent = `Live conversation active. Tagging as ${activeSpeaker}.`;
    animateWave(true);
  } catch (error) {
    isLiveListening = false;
    shouldKeepRecognition = false;
    liveConversationStatus.textContent = "Unable to start live conversation.";
    console.error("Start live conversation failed:", error);
  }
}

function stopLiveConversation() {
  isPushToTalkMode = false;
  shouldKeepRecognition = false;
  if (recognition && isLiveListening) {
    isStoppingRecognition = true;
    stopRecognitionSession().catch(() => null);
  }
  isLiveListening = false;
  liveConversationStatus.textContent = "Live conversation stopped.";
  animateWave(false);
  resetWatchState();
}

async function startPushToTalkSession(speaker) {
  if (!(await ensureRecognition())) {
    return;
  }
  if (speaker) {
    setActiveSpeaker(speaker);
  }
  if (!micStream) {
    await enableMicrophone();
  }
  if (!micStream || isLiveListening) {
    return;
  }
  try {
    stopWatchSceneLoop();
    isPushToTalkMode = true;
    shouldKeepRecognition = false;
    isLiveListening = true;
    watchPushToTalkBtn.classList.add("active");
    await startRecognitionSession();
    watchStatus.textContent = "Recording";
    watchStatus.style.background = "#4a2333";
    watchStatus.style.color = "#ffc2d7";
    watchText.textContent = `${activeSpeaker} speaking...`;
    animateWave(true);
  } catch (error) {
    isLiveListening = false;
    isPushToTalkMode = false;
    watchPushToTalkBtn.classList.remove("active");
    console.error("Push-to-talk start failed:", error);
  }
}

function stopPushToTalkSession() {
  if (liveDraftText.trim()) {
    addLiveTurn(liveDraftText);
  }
  clearLiveDraft();
  if (!isLiveListening) {
    return;
  }
  isPushToTalkMode = false;
  watchPushToTalkBtn.classList.remove("active");
  shouldKeepRecognition = false;
  if (recognition) {
    isStoppingRecognition = true;
    stopRecognitionSession().catch(() => null);
  }
  isLiveListening = false;
  animateWave(false);
  resetWatchState();
}

function bindHoldToTalk(element, speaker) {
  const start = (event) => {
    event.preventDefault();
    startPushToTalkSession(speaker);
  };
  const stop = (event) => {
    event.preventDefault();
    stopPushToTalkSession();
  };
  element.addEventListener("pointerdown", start);
  element.addEventListener("pointerup", stop);
  element.addEventListener("pointercancel", stop);
  element.addEventListener("pointerleave", stop);
}

function renderLocalSummaryAndActions() {
  summaryFeed.innerHTML = "";
  actionsFeed.innerHTML = "";
  addFeedEntry(summaryFeed, "Person A and Person B aligned on launch timeline, security sign-off, and adoption tracking.");
  addFeedEntry(summaryFeed, "Meeting intent: secure rollout with clear ownership and measurable outcomes.");
  addFeedEntry(actionsFeed, "Complete security sign-off by Oct 10.");
  addFeedEntry(actionsFeed, "Send onboarding communication draft by Friday.");
  addFeedEntry(actionsFeed, "Publish usage dashboard in Teams for leadership visibility.");
}

async function analyzeTranscriptViaApi() {
  if (currentTurns.length === 0) {
    addAssistantMsg("assistant", "No transcript yet. Run simulation or start live conversation first.");
    return;
  }
  summaryFeed.innerHTML = "";
  actionsFeed.innerHTML = "";
  addFeedEntry(summaryFeed, "Analyzing transcript via backend API...");
  try {
    const response = await fetch("/api/meeting/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns: currentTurns, mode: activeMode }),
    });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    const result = await response.json();
    summaryFeed.innerHTML = "";
    actionsFeed.innerHTML = "";
    (result.summary || []).forEach((line) => addFeedEntry(summaryFeed, line));
    (result.actions || []).forEach((line) => addFeedEntry(actionsFeed, typeof line === "string" ? line : `${line.owner}: ${line.task}`));
    addAssistantMsg("assistant", `API analysis complete (${result.source || "backend"}).`);
  } catch (error) {
    summaryFeed.innerHTML = "";
    actionsFeed.innerHTML = "";
    renderLocalSummaryAndActions();
    addAssistantMsg("assistant", "API unavailable. I used local fallback analysis for this demo.");
    console.error("Analyze transcript failed:", error);
  }
}

function runMeetingSimulation(autoAnalyze) {
  stopLiveConversation();
  clearTimers();
  clearMeetingData();
  runWatchFeatureTwoSequence();
  startDemoBtn.disabled = true;
  startDemoBtn.textContent = "Demo Running...";
  watchStatus.textContent = "Recording";
  watchStatus.style.background = "#4a2333";
  watchStatus.style.color = "#ffc2d7";
  animateWave(true);

  sampleMeetingTurns.forEach((turn, index) => {
    const timer = setTimeout(() => {
      currentTurns.push(turn);
      addFeedEntry(transcriptFeed, turn.text, turn.speaker);
      if (index === sampleMeetingTurns.length - 1) {
        watchStatus.textContent = "Processing";
        watchStatus.style.background = "#383829";
        watchStatus.style.color = "#ffe8a5";
      }
    }, 2100 * (index + 1));
    timers.push(timer);
  });

  const doneTimer = setTimeout(async () => {
    if (autoAnalyze) {
      if (activeMode === "live") {
        await analyzeTranscriptViaApi();
      } else {
        renderLocalSummaryAndActions();
      }
    }
    watchStatus.textContent = "Completed";
    watchStatus.style.background = "#173e2f";
    watchStatus.style.color = "#9bf4c7";
    watchText.textContent = "Done.";
    startDemoBtn.disabled = false;
    startDemoBtn.textContent = "Replay Demo";
    animateWave(false);
    addAssistantMsg("assistant", "Meeting processing completed with summary and actions.");
  }, 2100 * (sampleMeetingTurns.length + 1));
  timers.push(doneTimer);
}

function setHealthSyncState(isSyncing) {
  if (healthSyncVisual) {
    healthSyncVisual.classList.toggle("syncing", isSyncing);
  }
  connectFitBtn.disabled = isSyncing;
  refreshHealthBtn.disabled = isSyncing;
  playHealthVoiceBtn.disabled = isSyncing;
}

function renderHealthSummary(result) {
  const metrics = result.metrics || {};
  healthSteps.textContent = Number(metrics.steps || 0).toLocaleString();
  healthHeartPoints.textContent = Number(metrics.heartPoints || 0).toLocaleString();
  healthCalories.textContent = Number(metrics.calories || 0).toLocaleString();
  healthActiveMinutes.textContent = Number(metrics.activeMinutes || 0).toLocaleString();
  healthSummaryFeed.innerHTML = "";
  (result.summary || []).forEach((line) => addFeedEntry(healthSummaryFeed, line));
  (result.suggestions || []).forEach((line) => addFeedEntry(healthSummaryFeed, `• ${line}`));
  latestHealthBriefingText = [...(result.summary || []), ...(result.suggestions || [])].join(" ");
  const modeText = result.source === "google-fit-api" ? "Google Fit API connected." : "Demo health data mode.";
  const modelText = result.healthModelSource ? ` ${result.healthModelSource}.` : "";
  healthStatus.textContent = `${modeText}${modelText}`;
}

async function refreshHealthSummary() {
  setHealthSyncState(true);
  healthStatus.textContent = "Syncing health data...";
  runWatchFeatureTwoSequence();
  try {
    const response = await fetch("/api/health/summary");
    if (!response.ok) {
      throw new Error(`Health API returned ${response.status}`);
    }
    renderHealthSummary(await response.json());
  } catch (error) {
    healthStatus.textContent = "Health sync unavailable right now.";
    healthSummaryFeed.innerHTML = "";
    addFeedEntry(healthSummaryFeed, "Unable to fetch health summary right now.");
    console.error("Health summary failed:", error);
  } finally {
    setHealthSyncState(false);
  }
}

async function playHealthVoiceBriefing() {
  if (!latestHealthBriefingText) {
    addAssistantMsg("assistant", "Sync health data first, then I can narrate the briefing.");
    return;
  }
  setHealthSyncState(true);
  healthStatus.textContent = "Generating AI voice briefing...";
  try {
    const response = await fetch("/api/health/briefing-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: latestHealthBriefingText }),
    });
    if (!response.ok) {
      throw new Error(`Voice briefing API returned ${response.status}`);
    }
    const payload = await response.json();
    const binary = atob(payload.audioBase64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: payload.mimeType || "audio/mpeg" });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    await audio.play();
    healthStatus.textContent = `Voice briefing played (${payload.source || "audio model"}).`;
  } catch (error) {
    healthStatus.textContent = "Voice briefing unavailable right now.";
    console.error("Voice briefing failed:", error);
  } finally {
    setHealthSyncState(false);
  }
}

function resetDemo() {
  clearTimers();
  stopLiveConversation();
  clearMeetingData();
  resetWatchState();
  governanceReadyForApproval = false;
  if (governanceFeed) {
    governanceFeed.innerHTML = "";
    addGovernanceEntry("Awaiting governance check.");
  }
  if (governanceStatus) {
    governanceStatus.textContent = "Ready: waiting to validate policy, sensitivity, and approvals.";
  }
  escalationActive = false;
  if (escalationFeed) {
    escalationFeed.innerHTML = "";
    addEscalationEntry("No active incidents. Escalation Assistant is on standby.");
  }
  if (escalationStatus) {
    escalationStatus.textContent = "Ready: monitoring incident signals and awaiting escalation trigger.";
  }
  startDemoBtn.disabled = false;
  startDemoBtn.textContent = "Start 60s Demo";
  assistantFeed.innerHTML = "";
  addAssistantMsg("assistant", "Hello! I am your Wrist Copilot Assistant. I can summarize meetings and extract tasks.");
  animateWave(false);
}

function triggerEscalationFlow() {
  if (!escalationFeed || !escalationStatus) {
    return;
  }
  escalationFeed.innerHTML = "";
  escalationActive = true;
  escalationStatus.textContent = "Escalation in progress: Sev-2 incident workflow started.";

  const steps = [
    "Sev-2 classification confirmed from service health anomaly.",
    "On-call engineer paged and incident commander assigned.",
    "Teams war room created and key stakeholders invited.",
    "Work item + timeline entry created with SLA timers started.",
    "Status update drafted for leadership and affected users.",
  ];

  steps.forEach((step, index) => {
    const timer = setTimeout(() => {
      addEscalationEntry(step);
      if (index === steps.length - 1) {
        escalationStatus.textContent = "Sev-2 bridge active. Awaiting mitigation updates.";
        addAssistantMsg("assistant", "Escalation Assistant routed the incident, opened bridge, and started SLA tracking.");
      }
    }, 850 * (index + 1));
    timers.push(timer);
  });
}

function resolveEscalationFlow() {
  if (!escalationFeed || !escalationStatus) {
    return;
  }
  if (!escalationActive) {
    escalationStatus.textContent = "No active escalation to resolve.";
    addAssistantMsg("assistant", "No active escalation found. Trigger incident workflow first.");
    return;
  }
  addEscalationEntry("Mitigation validated and customer impact cleared.");
  addEscalationEntry("Incident marked resolved. Post-incident review task scheduled.");
  escalationStatus.textContent = "Incident resolved. PIR and follow-up actions queued.";
  escalationActive = false;
  addAssistantMsg("assistant", "Escalation closed with full timeline and post-incident actions recorded.");
}

function runGovernanceCheck() {
  if (!governanceFeed || !governanceStatus) {
    return;
  }
  governanceFeed.innerHTML = "";
  governanceReadyForApproval = false;
  governanceStatus.textContent = "Running enterprise governance checks...";

  const events = [
    "Step 1: Sensitivity label set to Confidential (tenant-only scope).",
    "Step 2: DLP/PII scan passed for generated summary and actions.",
    "Step 3: External recipient check passed (no public share targets).",
    "Step 4: Manager approval request created in Teams Approvals.",
    "Step 5: Security approval required before task commit.",
  ];

  events.forEach((eventText, index) => {
    const timer = setTimeout(() => {
      addGovernanceEntry(eventText);
      if (index === events.length - 1) {
        governanceReadyForApproval = true;
        governanceStatus.textContent = "Governance check complete. Ready for approved task creation.";
        addAssistantMsg("assistant", "Governance Assistant finished checks. You can approve and commit the enterprise action.");
      }
    }, 900 * (index + 1));
    timers.push(timer);
  });
}

function approveGovernanceAction() {
  if (!governanceFeed || !governanceStatus) {
    return;
  }
  if (!governanceReadyForApproval) {
    governanceStatus.textContent = "Run Governance Check first.";
    addAssistantMsg("assistant", "Please run Governance Check before approving.");
    return;
  }
  addGovernanceEntry("Approval recorded: Manager + Security sign-off completed.");
  addGovernanceEntry("Action committed: Planner task created and linked to audit trail.");
  governanceStatus.textContent = "Approved and committed with audit log.";
  governanceReadyForApproval = false;
  addAssistantMsg("assistant", "Enterprise action committed with full governance and audit tracking.");
}

async function initializeSpeechProvider() {
  const config = await fetchSpeechConfig();
  if (config && config.speech) {
    speechLocale = config.speech.locale || "en-US";
    if (config.speech.enabled && window.SpeechSDK) {
      speechProvider = "azure";
      liveConversationStatus.textContent = "Azure Speech ready. Use hold-to-talk for stable live transcript.";
      return;
    }
  }
  if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    speechProvider = "browser";
    liveConversationStatus.textContent = "Browser speech mode active. For stable demo, configure Azure Speech.";
    return;
  }
  speechProvider = "none";
  liveConversationStatus.textContent = "No speech provider detected. Configure Azure Speech or supported browser API.";
}

startDemoBtn.addEventListener("click", () => runMeetingSimulation(true));
simulateMeetingBtn.addEventListener("click", () => runMeetingSimulation(false));
startLiveConversationBtn.addEventListener("click", startLiveConversation);
stopLiveConversationBtn.addEventListener("click", stopLiveConversation);
analyzeNowBtn.addEventListener("click", analyzeTranscriptViaApi);
clearMeetingBtn.addEventListener("click", clearMeetingData);
speakerABtn.addEventListener("click", () => {
  setActiveSpeaker("Person A");
  liveConversationStatus.textContent = "Speaker switched to Person A.";
});
speakerBBtn.addEventListener("click", () => {
  setActiveSpeaker("Person B");
  liveConversationStatus.textContent = "Speaker switched to Person B.";
});
bindHoldToTalk(holdATalkBtn, "Person A");
bindHoldToTalk(holdBTalkBtn, "Person B");
bindHoldToTalk(watchPushToTalkBtn);
resetDemoBtn.addEventListener("click", resetDemo);
enableMicBtn.addEventListener("click", enableMicrophone);
demoModeBtn.addEventListener("click", () => setMode("demo"));
liveModeBtn.addEventListener("click", () => setMode("live"));
simulateAskBtn.addEventListener("click", () => {
  addAssistantMsg("user", "Give me the top actions from Person A and Person B meeting.");
  if (actionsFeed.children.length > 0) {
    addAssistantMsg("assistant", "I extracted the action list in the Action Items panel.");
  } else {
    addAssistantMsg("assistant", "Run the meeting simulation first, then I can provide actions.");
  }
});
connectFitBtn.addEventListener("click", refreshHealthSummary);
refreshHealthBtn.addEventListener("click", refreshHealthSummary);
playHealthVoiceBtn.addEventListener("click", playHealthVoiceBriefing);
if (runGovernanceBtn) {
  runGovernanceBtn.addEventListener("click", runGovernanceCheck);
}
if (approveGovernanceBtn) {
  approveGovernanceBtn.addEventListener("click", approveGovernanceAction);
}
if (triggerEscalationBtn) {
  triggerEscalationBtn.addEventListener("click", triggerEscalationFlow);
}
if (resolveEscalationBtn) {
  resolveEscalationBtn.addEventListener("click", resolveEscalationFlow);
}

setClock();
setInterval(setClock, 1000 * 30);
setActiveSpeaker("Person A");
resetDemo();
initializeSpeechProvider();
refreshHealthSummary();

window.addEventListener("beforeunload", () => {
  stopLiveConversation();
  if (recognition && typeof recognition.close === "function") {
    recognition.close();
  }
  stopMicMeter();
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
  }
  if (audioContext) {
    audioContext.close();
  }
});
