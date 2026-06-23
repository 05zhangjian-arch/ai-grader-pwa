// ============================================
// AI Grader - Intelligent Homework Grading
// Main Application
// ============================================

const APP_VERSION = "1.0.0";

// ---- State ----
let state = {
  assignments: [],
  results: [],
  settings: {
    apiEndpoint: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini"
  },
  _currentPhotoData: null,
  _cameraStream: null,
  _deleteTargetId: null,
  _answerKeyFile: null
};

// ---- Init ----
init();

function init() {
  loadState();
  renderAll();
  setupNav();
  setupPhotoUpload();
  setupDragDrop();
  setupAnswerKeyUpload();
  initProxyCheck();
}

function loadState() {
  try {
    const saved = localStorage.getItem("ai_grader_state");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.assignments) state.assignments = parsed.assignments;
      if (parsed.results) state.results = parsed.results;
      if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
    }
  } catch (e) {}
  // Default to Doubao settings on first load
  var ep = document.getElementById("settingEndpoint");
  var ak = document.getElementById("settingApiKey");
  var mo = document.getElementById("settingModel");
  if (ep) ep.value = state.settings.apiEndpoint;
  if (ak) ak.value = state.settings.apiKey;
  if (mo) mo.value = state.settings.model;
}

function saveState() {
  try {
    localStorage.setItem("ai_grader_state", JSON.stringify({
      assignments: state.assignments,
      results: state.results,
      settings: state.settings
    }));
  } catch (e) {}
}
function navigateTo(tab) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(n => n.classList.remove("active"));
  const pg = document.getElementById("page-" + tab);
  if (pg) pg.classList.add("active");
  const nav = document.querySelector('.nav-link[data-tab="' + tab + '"]');
  if (nav) nav.classList.add("active");
  if (tab === "dashboard" || tab === "assignments" || tab === "history") renderAll();
  if (tab === "grade") populateGradeSelect();
}
function setupNav() {
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.tab));
  });
}

function showToast(msg, type) {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = "toast" + (type ? " " + type : "");
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }
window.closeModal = closeModal;

document.querySelectorAll(".modal-overlay").forEach(el => {
  el.addEventListener("click", e => {
    if (e.target === el) el.style.display = "none";
  });
});

// ---- Assignments ----
function showCreateAssignment() {
  document.getElementById("newAssignName").value = "";
  document.getElementById("newAssignSubject").value = "";
  document.getElementById("newAssignQuestions").value = "";
  openModal("createModal");
}
window.showCreateAssignment = showCreateAssignment;

function createAssignment() {
  const name = document.getElementById("newAssignName").value.trim();
  const subject = document.getElementById("newAssignSubject").value.trim();
  const qText = document.getElementById("newAssignQuestions").value.trim();
  if (!name) { showToast("请输入作业名称", "error"); return; }
  if (!subject) { showToast("请输入科目", "error"); return; }
  const questions = [];
  if (qText) {
    for (const line of qText.split("\n").filter(l => l.trim())) {
    const parts = line.split("|").map(s => s.trim());
    if (parts.length < 2) continue;
    const q = parts[0].replace(/^\d+[.、\s]*/, "").trim();
    const ans = parts[1];
    const pts = parseInt(parts[2]) || 5;
    if (q) questions.push({ question: q, answer: ans, points: pts });
  }
  }
  if (!questions.length) {
    showToast("答案卷已创建（暂未添加题目，可通过上传文件让 AI 提取）", "success");
  } else {
    showToast("答案卷创建成功", "success");
  }
  state.assignments.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, subject, questions,
    createdAt: new Date().toISOString()
  });
  saveState();
  closeModal("createModal");
  renderAll();
  populateGradeSelect();
  showToast("答案卷创建成功", "success");
}
window.createAssignment = createAssignment;
function viewAssignment(id) {
  const a = state.assignments.find(x => x.id === id);
  if (!a) return;
  state._deleteTargetId = id;
  document.getElementById("detailModalTitle").textContent = a.name;
  const totalPts = a.questions.reduce((s, q) => s + q.points, 0);
  let html = "<p style=\"margin-bottom:12px;color:var(--text-secondary);font-size:0.85rem;\">科目：" + a.subject + " | 共 " + a.questions.length + " 题 | 总分：" + totalPts + "</p>";
  html += "<div class=\"detail-q-list\">";
  a.questions.forEach((q, i) => {
    html += "<div class=\"detail-q-item\"><div class=\"q-text\">" + (i+1) + ". " + q.question + "</div><div class=\"q-answer\">答案：" + q.answer + "</div><div class=\"q-points\">" + q.points + " 分</div></div>";
            + "<div class=\"q-explanation\">解题过程：" + (d.explanation || "") + "</div>"
  });
  html += "</div>";
  document.getElementById("detailModalBody").innerHTML = html;
  openModal("detailModal");
}

function deleteAssignment() {
  if (!state._deleteTargetId) return;
  if (!confirm("确定要删除这份答案卷吗？")) return;
  state.assignments = state.assignments.filter(a => a.id !== state._deleteTargetId);
  saveState();
  closeModal("detailModal");
  renderAll();
  populateGradeSelect();
  showToast("已删除", "success");
}
window.deleteAssignment = deleteAssignment;

function populateGradeSelect() {
  const sel = document.getElementById("gradeAssignmentSelect");
  sel.innerHTML = "";
  if (!state.assignments.length) {
    sel.innerHTML = "<option value=\"\">--- 请先创建答案卷 ---</option>";
    return;
  }
  const def = document.createElement("option");
  def.textContent = "-- 不使用答案卷（AI 自主批改） --";
  sel.appendChild(def);
  state.assignments.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name + " (" + a.subject + ")";
    sel.appendChild(opt);
  });
}
// ---- Camera ----
async function startCamera() {
  const video = document.getElementById("cameraPreview");
  const box = document.getElementById("cameraBox");
  const ph = document.getElementById("cameraPlaceholder");
  const startBtn = document.getElementById("cameraStartBtn");
  const captureBtn = document.getElementById("cameraCaptureBtn");
  try {
    if (state._cameraStream) state._cameraStream.getTracks().forEach(t => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    state._cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    box.classList.add("show-video");
    ph.style.display = "none";
    startBtn.disabled = true;
    captureBtn.disabled = false;
    const img = box.querySelector("img");
    if (img) img.remove();
    document.getElementById("cameraRemoveBtn").style.display = "none";
  } catch (err) {
    showToast("无法启动摄像头：请确保已授权摄像头权限", "error");
  }
}
window.startCamera = startCamera;

function capturePhoto() {
  const video = document.getElementById("cameraPreview");
  const box = document.getElementById("cameraBox");
  const canvas = document.getElementById("captureCanvas");
  let w = video.videoWidth || 1280;
  let h = video.videoHeight || 960;
  // Resize image to reduce payload size (max 1024px wide)
  const MW = 1024, MH = 768;
  if (w > MW) { h = Math.round(h * MW / w); w = MW; }
  if (h > MH) { w = Math.round(w * MH / h); h = MH; }
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  state._currentPhotoData = canvas.toDataURL("image/jpeg", 0.8);
  let img = box.querySelector("img");
  if (!img) { img = document.createElement("img"); box.appendChild(img); }
  img.src = state._currentPhotoData;
  box.classList.add("show-img");
  box.classList.remove("show-video");
  if (state._cameraStream) {
    state._cameraStream.getTracks().forEach(t => t.stop());
    state._cameraStream = null;
  }
  document.getElementById("cameraStartBtn").disabled = false;
  document.getElementById("cameraCaptureBtn").disabled = true;
  document.getElementById("cameraRemoveBtn").style.display = "inline-flex";
  showToast("拍照成功", "success");
}
window.capturePhoto = capturePhoto;

function uploadPhoto() { document.getElementById("photoUploadInput").click(); }
function setupPhotoUpload() {
  const puInput = document.getElementById("photoUploadInput");
  if (!puInput) return;
  puInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      state._currentPhotoData = ev.target.result;
      const box = document.getElementById("cameraBox");
      let img = box.querySelector("img");
      if (!img) { img = document.createElement("img"); box.appendChild(img); }
      img.src = state._currentPhotoData;
      box.classList.add("show-img");
      box.classList.remove("show-video");
      document.getElementById("cameraPlaceholder").style.display = "none";
      document.getElementById("cameraRemoveBtn").style.display = "inline-flex";
      if (state._cameraStream) {
        state._cameraStream.getTracks().forEach(t => t.stop());
        state._cameraStream = null;
      }
      document.getElementById("cameraStartBtn").disabled = false;
      document.getElementById("cameraCaptureBtn").disabled = true;
      showToast("图片已上传", "success");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  });
}

function removePhoto() {
  state._currentPhotoData = null;
  const box = document.getElementById("cameraBox");
  const img = box.querySelector("img");
  if (img) img.remove();
  box.classList.remove("show-img", "show-video");
  document.getElementById("cameraPlaceholder").style.display = "flex";
  document.getElementById("cameraRemoveBtn").style.display = "none";
  document.getElementById("cameraStartBtn").disabled = false;
  document.getElementById("cameraCaptureBtn").disabled = true;
}
window.removePhoto = removePhoto;

function setupDragDrop() {
  const box = document.getElementById("cameraBox");
  if (!box) return;
  box.addEventListener("dragover", e => { e.preventDefault(); box.style.borderColor = "var(--blue-500)"; });
  box.addEventListener("dragleave", () => { box.style.borderColor = ""; });
  box.addEventListener("drop", e => {
    e.preventDefault();
    box.style.borderColor = "";
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) { showToast("请拖入图片文件", "error"); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      state._currentPhotoData = ev.target.result;
      const b2 = document.getElementById("cameraBox");
      let img = b2.querySelector("img");
      if (!img) { img = document.createElement("img"); b2.appendChild(img); }
      img.src = state._currentPhotoData;
      b2.classList.add("show-img");
      b2.classList.remove("show-video");
      document.getElementById("cameraPlaceholder").style.display = "none";
      document.getElementById("cameraRemoveBtn").style.display = "inline-flex";
      showToast("图片已上传", "success");
    };
    reader.readAsDataURL(file);
  });
}
// ---- Grading ----
async function startGrading() {
  const assignId = document.getElementById("gradeAssignmentSelect").value;
  const studentName = document.getElementById("gradeStudentName").value.trim();
  // Assignment is optional - grade without answer key if none selected
  if (!studentName) { showToast("请输入学生姓名", "error"); return; }
  if (!state._currentPhotoData) { showToast("请先拍摄或上传作业照片", "error"); return; }
  if (!state.settings.apiKey) { showToast("请先在设置中配置 API Key", "error"); return; }
  const assignment = assignId ? state.assignments.find(a => a.id === assignId) : null;
  // assignment can be null - grade without answer key
  document.getElementById("gradeIdle").style.display = "none";
  document.getElementById("gradeResultContent").style.display = "none";
  document.getElementById("gradeError").style.display = "none";
  document.getElementById("gradeLoading").style.display = "flex";
  document.getElementById("gradeBtn").disabled = true;
  const steps = document.querySelectorAll(".loading-steps .step");
  steps.forEach((s, i) => {
    setTimeout(() => {
      s.classList.add("active");
      if (i > 0) steps[i-1].classList.remove("active");
      if (i === steps.length - 1) {
        setTimeout(() => s.classList.add("done"), 300);
      } else {
        setTimeout(() => { steps[i-1].classList.add("done"); }, 500);
      }
    }, i * 1200);
  });
  try {
    const result = await callAIGrading(assignment, state._currentPhotoData);
    document.getElementById("gradeLoading").style.display = "none";
    const gr = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      assignmentId: assignId,
      assignmentName: assignment.name,
      subject: assignment.subject,
      studentName: studentName,
      score: result.score,
      total: result.total,
      details: result.details,
      comment: result.comment,
      timestamp: new Date().toISOString()
    };
    state.results.push(gr);
    saveState();
    renderAll();
    showGradeResult(gr);
  } catch (err) {
    document.getElementById("gradeLoading").style.display = "none";
    document.getElementById("gradeError").style.display = "flex";
    document.getElementById("gradeErrorMessage").textContent = err.message || "批改失败，请重试";
  } finally {
    document.getElementById("gradeBtn").disabled = false;
  }
}
window.startGrading = startGrading;
function showGradeResult(r) {
  document.getElementById("gradeIdle").style.display = "none";
  document.getElementById("gradeLoading").style.display = "none";
  document.getElementById("gradeError").style.display = "none";
  document.getElementById("gradeResultContent").style.display = "block";
  const pct = r.total > 0 ? (r.score / r.total) * 100 : 0;
  const circum = 2 * Math.PI * 52;
  const offset = circum - (pct / 100) * circum;
  const ring = document.getElementById("scoreRingFill");
  ring.style.strokeDasharray = circum;
  requestAnimationFrame(() => { ring.style.strokeDashoffset = offset; });
  if (pct >= 80) ring.style.stroke = "#16a34a";
  else if (pct >= 60) ring.style.stroke = "#f59e0b";
  else ring.style.stroke = "#dc2626";
  document.getElementById("resultScore").textContent = r.score;
  document.getElementById("resultTotal").textContent = "/" + r.total;
  document.getElementById("resultAssignment").textContent = r.assignmentName || "无答案卷";
  document.getElementById("resultStudent").textContent = r.studentName;
  document.getElementById("resultTime").textContent = new Date(r.timestamp).toLocaleString("zh-CN");
  document.getElementById("resultComment").textContent = r.comment || "无评价";
  const container = document.getElementById("resultDetails");
  container.innerHTML = "";
  if (r.details && r.details.length) {
    r.details.forEach((d, i) => {
      const div = document.createElement("div");
      const status = d.status === "correct" ? "correct" : d.status === "partial" ? "partial" : "wrong";
      div.className = "detail-item " + status;
      const icon = d.status === "correct"
        ? "<svg class=\"detail-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#16a34a\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg>"
        : d.status === "partial"
        ? "<svg class=\"detail-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#d97706\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"12\"/><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"/></svg>"
        : "<svg class=\"detail-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#dc2626\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg>";
      div.innerHTML = icon
        + "<div class=\"detail-body\"><div class=\"detail-q\">" + (i+1) + ". " + (d.question || d.questionText || "") + "</div><div class=\"detail-student\">学生：" + (d.studentAnswer || "无") + "</div><div class=\"detail-answer\">答案：" + (d.correctAnswer || d.answer || "") + "</div></div><div class=\"detail-points\">" + (d.score || 0) + "/" + (d.points || 0) + "</div>";
        + "<div class=\"detail-explanation\">解题过程：" + (d.explanation || "") + "</div>";
      container.appendChild(div);
    });
  }
  document.getElementById("gradeResultContent").scrollIntoView({ behavior: "smooth", block: "start" });
}

function getApiConfig() {
  const base = state.settings.apiEndpoint.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + state.settings.apiKey
  };
  if (!state._apiProxy) {
    return { url: base + "/chat/completions", headers: headers };
  }
  return { url: window.location.origin + "/api/proxy/chat/completions", headers: { ...headers, "X-Api-Endpoint": base } };
}

async function initProxyCheck() {
  try {
    const r = await fetch(window.location.origin + "/api/proxy/chat/completions", { method: "OPTIONS" });
    state._apiProxy = r.ok;
  } catch (e) {
    state._apiProxy = false;
  }
}

async function callAIGrading(assignment, imageData) {
  const proxyUrl = window.location.origin + "/api/proxy/chat/completions";
  const apiEndpoint = state.settings.apiEndpoint.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  const model = state.settings.model;
  let systemPrompt;
  if (assignment && assignment.questions && assignment.questions.length) {
    const questionsText = assignment.questions.map((q, i) => {
      return (i+1) + ". " + q.question + " | 答案：" + q.answer + " | 分值：" + q.points;
    }).join("\n");
    systemPrompt = "你是一个专业的作业批改AI助手。你的任务是根据提供的标准答案和作业照片，对学生的答案进行评分。优先匹配标准答案。\n\n标准答案：\n" + questionsText + "\n\n请仔细查看作业照片中的学生答案，逐题评分。对每道题给出：\n1. 评分（得分/满分）\n2. 状态：correct（正确）、partial（部分正确）、wrong（错误）\n3. 学生答案内容（从图片中识别）\n4. 详细解题过程（针对每道题给出完整的解法步骤）\n\n最后给出总体评价和建议。\n\n请以JSON格式返回结果，格式如下：\n{\n  \"details\": [\n    {\n      \"question\": \"题目内容\",\n      \"correctAnswer\": \"标准答案\",\n      \"studentAnswer\": \"识别出的学生答案\",\n      \"score\": 得分,\n      \"points\": 满分,\n      \"explanation\": \"详细解题过程\",\n      \"status\": \"correct|partial|wrong\"\n    }\n  ],\n  \"score\": 总得分,\n  \"total\": 总分,\n  \"comment\": \"总体评价\"\n}";
  } else {
    systemPrompt = "你是一个专业的作业批改AI助手。请直接批改这张作业照片中的学生答案，无需匹配标准答案。请自行判断学生答案的正确性，逐题评分。对每道题给出：\n1. 评分（得分/满分，自行设定满分值）\n2. 题目内容（从图片中识别）\n3. 学生答案内容（从图片中识别）\n4. 状态：correct（正确）、partial（部分正确）、wrong（错误）\n5. 详细解题过程（针对每道题给出完整的解法步骤）\n\n最后给出总体评价和建议。\n\n请以JSON格式返回结果，格式如下：\n{\n  \"details\": [\n    {\n      \"question\": \"题目内容\",\n      \"studentAnswer\": \"识别出的学生答案\",\n      \"score\": 得分,\n      \"points\": 满分,\n      \"explanation\": \"详细解题过程\",\n      \"status\": \"correct|partial|wrong\"\n    }\n  ],\n  \"score\": 总得分,\n  \"total\": 总分,\n  \"comment\": \"总体评价\"\n}";
  }
  const body = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: [
        { type: "text", text: "请批改这张作业照片中的答案。" },
        { type: "image_url", image_url: { url: imageData } }
      ]}
    ],
    max_tokens: 4096,
    temperature: 0.2,
  };
    const res = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Endpoint": apiEndpoint,
      "Authorization": "Bearer " + state.settings.apiKey
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let errMsg = "API 请求失败";
    try { const err = await res.json(); errMsg = JSON.stringify(err) || errMsg; } catch (e) {}
    throw new Error(errMsg + " (" + res.status + ")");
  }
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || "";
  let result;
  try {
    result = JSON.parse(content);
  } catch (e) {
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try { result = JSON.parse(m[1]); } catch (e2) { throw new Error("AI 返回格式异常，请重试"); }
    } else {
      throw new Error("AI 返回格式异常，请重试");
    }
  }
  if (!result.details || !Array.isArray(result.details)) {
    throw new Error("AI 返回缺少评分明细");
  }
  result.total = result.total || assignment.questions.reduce((s, q) => s + q.points, 0);
  result.score = result.score || result.details.reduce((s, d) => s + (d.score || 0), 0);
  return result;
}
// ---- Settings ----
function saveSettings() {
  state.settings.apiEndpoint = document.getElementById("settingEndpoint").value.trim() || "https://api.openai.com/v1";
  state.settings.apiKey = document.getElementById("settingApiKey").value.trim();
  state.settings.model = document.getElementById("settingModel").value.trim() || "gpt-4o-mini";
  saveState();
  showToast("设置已保存", "success");
}
window.saveSettings = saveSettings;

async function testConnection() {
  const apiEndpoint = (document.getElementById("settingEndpoint").value.trim() || "https://api.openai.com/v1").replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  const apiKey = document.getElementById("settingApiKey").value.trim();
  const model = document.getElementById("settingModel").value.trim() || "gpt-4o-mini";
  const status = document.getElementById("connectionStatus");
  if (!apiKey) { status.className = "connection-status error"; status.textContent = "请先输入 API Key"; status.style.display = "block"; return; }
  status.className = "connection-status"; status.textContent = "测试中..."; status.style.display = "block";
  try {
    const apiCfg = getApiConfig();
    const chatRes = await fetch(apiCfg.url, {
      method: "POST",
      headers: apiCfg.headers,
      body: JSON.stringify({ model: model, messages: [{ role: "user", content: "Hello" }], max_tokens: 5 })
    });
    if (!chatRes.ok) { const err = await chatRes.json().catch(() => ({})); throw new Error(err.error?.message || "连接失败"); }
    const data = await chatRes.json();
    status.className = "connection-status success";
    status.textContent = "连接成功！模型 " + (data.model || model) + "可用";
  } catch (err) {
    status.className = "connection-status error";
    status.textContent = "连接失败：" + (err.message || "未知错误");
  }
}
window.testConnection = testConnection;

// ---- History ----
function viewResultDetail(id) {
  const r = state.results.find(x => x.id === id);
  if (!r) return;
  const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
  const color = pct >= 80 ? "var(--green-600)" : pct >= 60 ? "var(--amber-500)" : "var(--red-600)";
  let html = "<div style=\"display:flex;align-items:center;gap:16px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)\">"
    + "<div style=\"font-size:2rem;font-weight:800;color:" + color + "\">" + r.score + "/" + r.total + "</div>"
    + "<div><div style=\"font-weight:600\">" + r.assignmentName + "</div><div style=\"font-size:0.85rem;color:var(--text-secondary)\">" + r.studentName + " | " + new Date(r.timestamp).toLocaleString("zh-CN") + "</div></div>"
    + "</div>";
  if (r.comment) html += "<p style=\"margin-bottom:12px;font-size:0.88rem;color:var(--text)\">" + r.comment + "</p>";
  html += "<div class=\"detail-q-list\">";
  if (r.details && r.details.length) {
    r.details.forEach((d, i) => {
      const red = d.status !== "correct" ? " style=\"color:var(--red-600)\"" : "";
      html += "<div class=\"detail-q-item\">"
        + "<div class=\"q-text\">" + (i+1) + ". " + (d.question || d.questionText || "") + "</div>"
        + "<div class=\"q-answer\">??:" + (d.correctAnswer || d.answer || "") + "</div>"
        + "<div class=\"q-answer\"" + red + ">??" + (d.studentAnswer || "未识别") + "</div>"
        + "<div class=\"q-points\">??:" + (d.score || 0) + "/" + (d.points || 0) + "</div>"
        + "</div>";
    });
  }
  html += "</div>";
  document.getElementById("resultDetailBody").innerHTML = html;
  openModal("resultDetailModal");
}
// ---- Render ----
function renderAll() {
  renderStats();
  renderAssignments();
  renderRecent();
  renderHistory();
}

function renderStats() {
  document.getElementById("statAssignments").textContent = state.assignments.length;
  document.getElementById("statGraded").textContent = state.results.length;
  const scores = state.results.filter(r => r.total > 0).map(r => (r.score / r.total) * 100);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  document.getElementById("statAvgScore").textContent = avg !== null ? avg + "%" : "---";
}

function renderAssignments() {
  const grid = document.getElementById("assignmentGrid");
  const empty = document.getElementById("assignmentsEmpty");
  grid.innerHTML = "";
  if (!state.assignments.length) { empty.style.display = "flex"; return; }
  empty.style.display = "none";
  state.assignments.forEach(a => {
    const card = document.createElement("div");
    card.className = "assignment-card";
    card.onclick = function() { viewAssignment(a.id); };
    const totalPts = a.questions.reduce((s, q) => s + q.points, 0);
    card.innerHTML = "<div class=\"assign-card-title\">" + a.name + "</div><span class=\"assign-card-subject\">" + a.subject + "</span><div class=\"assign-card-meta\"><span>" + a.questions.length + " 题</span><span>共 " + totalPts + " 分</span><span>" + new Date(a.createdAt).toLocaleDateString("zh-CN") + "</span></div>";
    grid.appendChild(card);
  });
}

function renderRecent() {
  const list = document.getElementById("recentList");
  const empty = document.getElementById("recentEmpty");
  list.innerHTML = "";
  const recent = [...state.results].reverse().slice(0, 5);
  if (!recent.length) { empty.style.display = "flex"; return; }
  empty.style.display = "none";
  recent.forEach(r => {
    const item = document.createElement("div");
    item.className = "recent-item";
    item.onclick = function() { navigateTo("history"); };
    item.innerHTML = "<div class=\"recent-item-left\"><span class=\"recent-item-name\">" + r.assignmentName + " - " + r.studentName + "</span><span class=\"recent-item-meta\">" + new Date(r.timestamp).toLocaleString("zh-CN") + "</span></div><span class=\"recent-item-score\">" + r.score + "/" + r.total + "</span>";
    list.appendChild(item);
  });
}

function renderHistory() {
  const tbody = document.getElementById("historyBody");
  const wrap = document.getElementById("historyTableWrap");
  const empty = document.getElementById("historyEmpty");
  tbody.innerHTML = "";
  if (!state.results.length) { empty.style.display = "flex"; wrap.style.display = "none"; return; }
  empty.style.display = "none";
  wrap.style.display = "block";
  [...state.results].reverse().forEach(r => {
    const tr = document.createElement("tr");
    const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
    tr.innerHTML = "<td>" + new Date(r.timestamp).toLocaleString("zh-CN") + "</td><td>" + r.assignmentName + "</td><td>" + r.studentName + "</td><td class=\"score-cell\">" + r.score + "/" + r.total + " (" + pct + "%)</td><td><button class=\"btn btn-sm btn-secondary\" onclick=\"viewResultDetail(\'" + r.id + "\')\">详情</button></td>";
    tbody.appendChild(tr);
  });
}

// ---- Answer Key File Upload ----
function setupAnswerKeyUpload() {
  const input = document.getElementById("answerKeyFile");
  if (!input) return;
  input.addEventListener("change", function(e) {
    const newFiles = Array.from(e.target.files);
    if (!newFiles.length) return;
    if (!state._answerKeyFiles) state._answerKeyFiles = [];
    state._answerKeyFiles = state._answerKeyFiles.concat(newFiles);
    document.getElementById("fileUploadPlaceholder").style.display = "none";
    const preview = document.getElementById("fileUploadPreview");
    preview.style.display = "flex";
    const list = document.getElementById("fileList");
    newFiles.forEach(function(file) {
      const item = document.createElement("div");
      item.className = "file-list-item";
      const ext = file.name.split(".").pop().toUpperCase();
      if (file.type.startsWith("image/")) {
        const thumb = document.createElement("img");
        thumb.className = "file-thumb";
        const r = new FileReader();
        r.onload = function(ev) { thumb.src = ev.target.result; };
        r.readAsDataURL(file);
        item.appendChild(thumb);
      } else {
        const icon = document.createElement("div");
        icon.className = "file-type-badge";
        icon.textContent = ext;
        item.appendChild(icon);
      }
      const name = document.createElement("span");
      name.className = "file-name-text";
      name.textContent = file.name;
      item.appendChild(name);
      const badge = document.createElement("span");
      badge.className = "file-type-badge";
      badge.textContent = ext;
      item.appendChild(badge);
      list.appendChild(item);
    });
    e.target.value = "";
  });
}

async function extractFromFile() {
  const files = state._answerKeyFiles;
  if (!files || !files.length) { showToast("请先选择文件", "error"); return; }
  if (!state.settings.apiKey) { showToast("请先在设置中配置 API Key", "error"); return; }
  const status = document.getElementById("extractStatus");
  status.style.display = "block";
  status.className = "connection-status";
  status.textContent = "正在解析 " + files.length + " 个文件并提取题目...";
  try {
    const imageDataUrls = [];
    var extractedText = "";
    for (var f = 0; f < files.length; f++) {
      const file = files[f];
      if (file.type.startsWith("image/")) {
        const dataUrl = await new Promise(function(resolve) {
          var r = new FileReader();
          r.onload = function(e) { resolve(e.target.result); };
          r.onerror = function() { resolve(null); };
          r.readAsDataURL(file);
        });
        if (dataUrl) imageDataUrls.push(dataUrl);
      } else if (file.name.endsWith(".docx") || file.type.indexOf("word") >= 0) {
        if (typeof mammoth === "undefined") {
          status.className = "connection-status error";
          status.textContent = "Word解析库未加载，请检查网络连接或刷新页面";
          return;
        }
        var arrBuf = await file.arrayBuffer();
        var docResult = await mammoth.extractRawText({ arrayBuffer: arrBuf });
        extractedText += docResult.value + "\n";
      } else if (file.name.endsWith(".pdf") || file.type.indexOf("pdf") >= 0) {
        if (typeof pdfjsLib === "undefined") {
          status.className = "connection-status error";
          status.textContent = "PDF解析库未加载，请检查网络连接或刷新页面";
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        var arrBuf = await file.arrayBuffer();
        var pdf = await pdfjsLib.getDocument({ data: arrBuf }).promise;
        for (var p = 1; p <= pdf.numPages; p++) {
          var page = await pdf.getPage(p);
          var tc = await page.getTextContent();
          extractedText += tc.items.map(function(item) { return item.str; }).join(" ") + "\n";
        }
      }
    }
    if (imageDataUrls.length > 0) {
      var result = await extractQAFromImage(imageDataUrls);
      fillExtractedQuestions(result);
      status.className = "connection-status success";
      status.textContent = "提取完成！请确认题目后创建";
    } else if (extractedText.trim()) {
      var result = await extractQAFromText(extractedText);
      fillExtractedQuestions(result);
      status.className = "connection-status success";
      status.textContent = "提取完成！请确认题目后创建";
    } else {
      status.className = "connection-status error";
      status.textContent = "未能从文件中提取到内容";
    }
  } catch (err) {
    status.className = "connection-status error";
    status.textContent = "提取失败：" + (err.message || "未知错误");
  }
}
window.extractFromFile = extractFromFile;

async function extractQAFromImage(imageDataArray) {
  var model = state.settings.model;
  var prompt = "请从这些图片中提取所有题目和对应的答案，以及每道题的分值（如果可见）。如果图片中包含标准答案，请一并提取。以JSON数组格式返回，每个元素包含question, answer, points字段。如果未提供分值，默认每道题5分。只返回JSON，不要其他文字。";
  if (!Array.isArray(imageDataArray)) { imageDataArray = [imageDataArray]; }
  var contentParts = [{ type: "text", text: prompt }];
  imageDataArray.forEach(function(imgData) { contentParts.push({ type: "image_url", image_url: { url: imgData } }); });
  var apiCfg = getApiConfig();
  var res = await fetch(apiCfg.url, {
    method: "POST",
    headers: apiCfg.headers,
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: "你是一个专业的题目提取助手，从图片中提取题目和答案。" },
        { role: "user", content: contentParts }
      ],
      max_tokens: 4096,
      temperature: 0.1,
    })
  });
  if (!res.ok) { var errMsg = "API请求失败"; try { var e = await res.json(); errMsg = e.error?.message || errMsg; } catch(ex) {} throw new Error(errMsg + " (" + res.status + ")"); }
  var data = await res.json();
  var content = data.choices?.[0]?.message?.content || "";
  try {
    var parsed = JSON.parse(content);
    return parsed.questions || parsed.details || parsed;
  } catch(ee) {
    var m = content.match(/\[([\s\S]*?)\]/);
    if (m) try { return JSON.parse("[" + m[1] + "]"); } catch(ex) {}
    throw new Error("AI返回格式异常");
  }
}

async function extractQAFromText(text) {
  var proxyUrl = window.location.origin + "/api/proxy/chat/completions";
  var apiEndpoint = state.settings.apiEndpoint.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  var model = state.settings.model;
  var prompt = "请从以下内容中提取所有题目和对应的答案，以及每道题的分值（如果提供）。\n\n" + text + "\n\n以JSON格式返回，格式：\{\"questions\": [\{\"question\": \"题目\", \"answer\": \"答案\", \"points\": 分值\}]\}，如果未提供分值，默认每道题5分。只返回JSON。";
  var res = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Endpoint": apiEndpoint, "Authorization": "Bearer " + state.settings.apiKey },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: "你是一个专业的题目提取助手。" },
        { role: "user", content: prompt }
      ],
      max_tokens: 4096,
      temperature: 0.1,
    })
  });
  if (!res.ok) { var errMsg = "API请求失败"; try { var e = await res.json(); errMsg = e.error?.message || errMsg; } catch(ex) {} throw new Error(errMsg + " (" + res.status + ")"); }
  var data = await res.json();
  var content = data.choices?.[0]?.message?.content || "";
  try { var parsed = JSON.parse(content); return parsed.questions || parsed.details || parsed; } catch(ee) { throw new Error("AI返回格式异常"); }
}

function fillExtractedQuestions(questions) {
  if (!questions || !Array.isArray(questions) || !questions.length) { showToast("未提取到题目", "error"); return; }
  var lines = questions.map(function(q, i) { return (i+1) + ". " + q.question + " | " + (q.answer || "") + " | " + (q.points || 5); });
  document.getElementById("newAssignQuestions").value = lines.join("\n");
  showToast("已提取 " + questions.length + " 道题目", "success");
}

function clearFile() {
  state._answerKeyFiles = [];
  document.getElementById("fileUploadPlaceholder").style.display = "flex";
  document.getElementById("fileUploadPreview").style.display = "none";
  document.getElementById("answerKeyFile").value = "";
  document.getElementById("extractStatus").style.display = "none";
  var img = document.querySelector("#fileUploadPreview .file-preview-img");
  if (img) img.remove();
}
window.clearFile = clearFile;

// ---- Presets ----
function setPreset(name) {
  var presets = {
    openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    doubao: { endpoint: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seed-2-1-pro-260628" },
    ollama: { endpoint: "http://localhost:11434/v1", model: "llama3.2-vision" }
  };
  var p = presets[name];
  if (!p) return;
  document.getElementById("settingEndpoint").value = p.endpoint;
  document.getElementById("settingModel").value = p.model;
  var labels = { openai: "OpenAI", doubao: "豆包 (Doubao-Seed)", ollama: "Ollama" };
  showToast("已填入" + (labels[name] || name) + "预设", "success");
}
window.setPreset = setPreset;
