const DESIRE_AXES = [
  {
    key: "dignity",
    desireType: "自我价值欲",
    positiveName: "尊严",
    positiveLabels: "尊严、自信、担当",
    balance: "知道自己有价值，也承认别人有价值",
    shadow: "傲慢",
    positiveTokens: ["尊严", "自信", "担当", "价值", "尊重", "边界", "confidence", "worth", "respect", "responsibility"],
    shadowTokens: ["傲慢", "面子", "证明自己", "ego", "arrogance", "superior"]
  },
  {
    key: "security",
    desireType: "占有安全欲",
    positiveName: "保障",
    positiveLabels: "积累、保障、经营",
    balance: "合理拥有资源，不被资源奴役",
    shadow: "贪婪",
    positiveTokens: ["积累", "保障", "经营", "稳定", "安全", "资源", "stability", "security", "reserve", "steady"],
    shadowTokens: ["贪婪", "囤积", "匮乏", "greed", "hoard", "scarcity"]
  },
  {
    key: "intimacy",
    desireType: "亲密快感欲",
    positiveName: "爱欲",
    positiveLabels: "爱欲、亲密、生命力",
    balance: "欲望服务于关系，而不是吞噬关系",
    shadow: "色欲",
    positiveTokens: ["爱欲", "爱", "亲密", "生命力", "关系", "connection", "care", "closeness", "affection"],
    shadowTokens: ["色欲", "占有", "吞噬", "lust", "possessive", "consume relationship"]
  },
  {
    key: "ambition",
    desireType: "比较认可欲",
    positiveName: "进取",
    positiveLabels: "进取、欣赏、学习",
    balance: "看见差距，但不否定自己和他人",
    shadow: "嫉妒",
    positiveTokens: ["进取", "欣赏", "学习", "成长", "向上", "ambition", "admire", "learn", "improve"],
    shadowTokens: ["嫉妒", "攀比", "envy", "jealous", "comparison trap"]
  },
  {
    key: "enjoyment",
    desireType: "满足享受欲",
    positiveName: "享受",
    positiveLabels: "滋养、享受、丰盛",
    balance: "能享受，也能停止",
    shadow: "暴食",
    positiveTokens: ["滋养", "享受", "丰盛", "快乐", "美感", "pleasure", "joy", "abundance", "nourish"],
    shadowTokens: ["暴食", "沉迷", "过度", "binge", "excess", "overconsume"]
  },
  {
    key: "justice",
    desireType: "边界公平欲",
    positiveName: "正义",
    positiveLabels: "正义、勇气、守护",
    balance: "能表达愤怒，但不被愤怒控制",
    shadow: "暴怒",
    positiveTokens: ["正义", "勇气", "守护", "公平", "保护", "justice", "courage", "protect", "fairness"],
    shadowTokens: ["暴怒", "愤怒", "攻击", "rage", "resentment", "revenge"]
  },
  {
    key: "rest",
    desireType: "休息安逸欲",
    positiveName: "安息",
    positiveLabels: "安息、恢复、沉潜",
    balance: "会休息，也愿意承担责任",
    shadow: "懒惰",
    positiveTokens: ["安息", "恢复", "沉潜", "平静", "休息", "calm", "recover", "stillness", "depth"],
    shadowTokens: ["懒惰", "拖延", "回避", "lazy", "procrastinate", "avoidance", "freeze"]
  }
];

const ONBOARDING_STEPS = [
  {
    key: "gender",
    prompt: "先告诉我你的性别。",
    parser: parseGender,
    invalid: "我先记标准一点的写法，比如：男、女、male、female。"
  },
  {
    key: "birthDate",
    prompt: "再告诉我你的出生日期，格式像 1991-08-17。",
    parser: parseBirthDate,
    invalid: "出生日期我先按 `YYYY-MM-DD` 记，比如 1991-08-17。"
  },
  {
    key: "birthTime",
    prompt: "出生时间也给我一下，格式像 07:30。",
    parser: parseBirthTime,
    invalid: "出生时间我先按 `HH:MM` 记，比如 07:30。"
  },
  {
    key: "birthLocation",
    prompt: "你出生在哪里？写到城市或医院都可以。",
    parser: parseBirthLocation,
    invalid: "这个我直接记文本，你可以像“上海市浦东新区东方医院”这样告诉我。"
  }
];

const state = {
  selfModel: null,
  health: null,
  runtimeConfig: null,
  trainingModelStatus: null,
  earningActions: [],
  submitting: false,
  nextMessageId: 1,
  chatMessages: [],
  chatHistory: {
    initialized: false,
    hasMore: true,
    loading: false,
    reachedStart: false,
    error: ""
  },
  onboarding: {
    active: null,
    autoStarted: false
  },
  composerStatus: {
    visible: false,
    tone: "busy",
    text: ""
  }
};

function byId(id) {
  return document.getElementById(id);
}

function createMessageId() {
  const id = state.nextMessageId;
  state.nextMessageId += 1;
  return `msg-${id}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function setWorkspaceStatus(text) {
  byId("workspaceStatus").textContent = text;
}

function setComposerStatus(text = "", tone = "busy") {
  state.composerStatus = {
    visible: Boolean(text),
    tone,
    text
  };

  const root = byId("composerStatus");
  const textNode = byId("composerStatusText");
  if (!root || !textNode) return;

  root.className = text ? `composer-status ${tone}` : "composer-status hidden";
  textNode.textContent = text;
}

function setMood(mood, reason) {
  const moodMap = {
    idle: "空闲",
    listening: "倾听",
    thinking: "推演中",
    delighted: "已接住",
    concerned: "待确认",
    dreaming: "整理中"
  };

  byId("mascot").className = `mascot mood-${mood}`;
  byId("moodBadge").textContent = moodMap[mood] || "空闲";
  byId("moodReason").textContent = reason;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || payload.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function refreshModel() {
  setWorkspaceStatus("正在同步...");

  const [
    selfModelResponse,
    healthResponse,
    runtimeConfigResponse,
    trainingModelStatusResponse,
    earningActionsResponse
  ] = await Promise.all([
    fetch("/api/self-model"),
    fetch("/api/health"),
    fetch("/api/runtime/config"),
    fetch("/api/train/model-status"),
    fetch("/api/earning/actions")
  ]);

  state.selfModel = await selfModelResponse.json();
  state.health = await healthResponse.json();
  state.runtimeConfig = await runtimeConfigResponse.json();
  state.trainingModelStatus = await trainingModelStatusResponse.json();
  const earningActionPayload = await earningActionsResponse.json();
  state.earningActions = Array.isArray(earningActionPayload.actions)
    ? earningActionPayload.actions
    : [];

  byId("modelState").textContent = JSON.stringify(
    {
      selfModel: state.selfModel,
      health: state.health,
      runtimeConfig: state.runtimeConfig
    },
    null,
    2
  );

  hydrateSettings();
  renderDesireChart();
  renderSettingsSummary();
  await ensureChatHistoryLoaded();
  renderChatLog();

  const readyPriors = (state.selfModel.priorSkillOutputs || []).filter((item) => item.status === "ready").length;
  const pending = (state.selfModel.pendingConfirmations || []).length;
  setWorkspaceStatus(`已同步 · ${readyPriors} 先验 · ${pending} 待确认`);

  if (state.chatMessages.length === 0) {
    pushAssistantMessage("你好。", false);
  }

  maybeStartOnboarding();
}

async function loadChatHistory(args = {}) {
  const options = {
    beforeId: undefined,
    preserveScrollPosition: false,
    ...args
  };
  if (state.chatHistory.loading) return;
  if (options.beforeId && !state.chatHistory.hasMore) return;

  state.chatHistory.loading = true;
  state.chatHistory.error = "";
  renderChatLog({ stickToBottom: !options.beforeId });

  const chatLog = byId("chatLog");
  const previousTop = chatLog.scrollTop;
  const previousHeight = chatLog.scrollHeight;
  let shouldRestoreScrollPosition = false;

  try {
    const params = new URLSearchParams({ limit: "100" });
    if (options.beforeId) {
      params.set("beforeId", options.beforeId);
    }

    const response = await fetch(`/api/chat/history?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`history ${response.status}`);
    }

    const payload = await response.json();
    const incoming = Array.isArray(payload.messages) ? payload.messages : [];
    const normalized = incoming.map(normalizeHistoryMessage).filter(Boolean);

    if (options.beforeId) {
      state.chatMessages = [...normalized, ...state.chatMessages];
    } else {
      state.chatMessages = normalized;
    }

    state.chatHistory.initialized = true;
    state.chatHistory.hasMore = Boolean(payload.hasMore);
    state.chatHistory.reachedStart = !payload.hasMore;
    shouldRestoreScrollPosition = Boolean(options.beforeId && options.preserveScrollPosition);
  } catch (error) {
    state.chatHistory.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.chatHistory.loading = false;
    renderChatLog({ stickToBottom: !options.beforeId });
    if (shouldRestoreScrollPosition) {
      chatLog.scrollTop = chatLog.scrollHeight - previousHeight + previousTop;
    }
  }
}

async function ensureChatHistoryLoaded() {
  if (state.chatHistory.initialized) return;
  await loadChatHistory();
}

function normalizeHistoryMessage(message) {
  if (!message || typeof message !== "object") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  return {
    id: typeof message.id === "string" ? message.id : createMessageId(),
    role: message.role,
    content: typeof message.content === "string" ? message.content : "",
    timestamp: typeof message.timestamp === "string" ? message.timestamp : new Date().toISOString(),
    status: "sent",
    errorMessage: ""
  };
}

function hydrateSettings() {
  const runtime = state.runtimeConfig || {};
  const training = state.selfModel?.trainingConfig || state.health?.trainingConfig || {};

  byId("runtimeProvider").value = runtime.provider || "qyuanai";
  byId("runtimeModel").value = runtime.model || "";
  byId("runtimeBaseUrl").value = runtime.baseUrl || "";
  byId("runtimeApiKey").value = "";
  byId("runtimeApiKey").placeholder = runtime.apiKeyConfigured
    ? "已配置，留空保持不变"
    : "sk-...";

  byId("trainingModel").value = training.model || "";
  byId("maxDurationSeconds").value = training.maxDurationSeconds || 300;
  byId("windowStartHour").value = training.window?.startHourLocal ?? 1;
  byId("windowEndHour").value = training.window?.endHourLocal ?? 6;
}

function renderSettingsSummary() {
  const profile = state.selfModel?.profile || {};
  const pending = state.selfModel?.pendingConfirmations?.length || 0;
  const readyPriors = (state.selfModel?.priorSkillOutputs || []).filter((item) => item.status === "ready").length;
  const completedFields = ONBOARDING_STEPS.filter((step) => Boolean(profile[step.key])).length;
  const modelStatus = state.trainingModelStatus?.modelStatus;
  const progressHint =
    !modelStatus?.prepared &&
    typeof modelStatus?.downloadPercent === "number" &&
    typeof modelStatus?.actualBytes === "number" &&
    typeof modelStatus?.expectedBytes === "number"
      ? `已下载 ${modelStatus.downloadPercent}% · ${formatBytes(modelStatus.actualBytes)} / ${formatBytes(modelStatus.expectedBytes)}`
      : "";
  byId("settingsMemoryStats").textContent = `${readyPriors} 先验 / ${pending} 待确认`;
  byId("settingsProfileStats").textContent = `${completedFields}/${ONBOARDING_STEPS.length} 已收集`;
  byId("settingsTrainingModelStatus").textContent = modelStatus?.prepared
    ? "训练模型已就绪"
    : progressHint
      ? "训练模型下载中"
      : "训练模型未准备";
  byId("settingsTrainingModelHint").textContent = modelStatus?.prepared
    ? modelStatus.preparedModelPath || ""
    : [progressHint, modelStatus?.reason || "首次训练前需要先准备本地微调模型。"].filter(Boolean).join(" · ");
}

function renderChatLog(options = {}) {
  const settings = {
    stickToBottom: true,
    ...options
  };
  if (!state.chatMessages.length) {
    byId("chatLog").innerHTML = '<div class="empty">还没有对话。</div>';
    return;
  }

  const historyBanner = renderHistoryBanner();
  byId("chatLog").innerHTML =
    historyBanner +
    state.chatMessages
      .map(
      (message) => `
        <div class="chat-message-row ${message.role}">
          <div class="chat-message ${message.role} ${message.status ? `status-${message.status}` : ""}">
            <div class="chat-role">${message.role === "user" ? "你" : "xiaoxian AI"}</div>
            <div class="chat-content">${escapeHtml(message.content)}</div>
            ${message.role === "assistant" ? renderEarningActions(message) : ""}
            ${
              message.role === "user" && message.status === "failed"
                ? `<div class="chat-meta error">${escapeHtml(message.errorMessage || "发送失败，可重新发送。")}</div>`
                : ""
            }
            ${
              message.role === "user" && message.status === "retrying"
                ? '<div class="chat-meta">正在重新发送...</div>'
                : ""
            }
          </div>
          ${
            message.role === "user" && message.status === "failed"
              ? `
                <div class="chat-actions">
                  <button
                    class="retry-button"
                    type="button"
                    data-action="retry-message"
                    data-message-id="${escapeHtml(message.id || "")}"
                    aria-label="重新发送这条消息"
                    title="重新发送"
                  >↻</button>
                </div>
              `
              : ""
          }
        </div>
      `
      )
      .join("");

  if (settings.stickToBottom) {
    byId("chatLog").scrollTop = byId("chatLog").scrollHeight;
  }
}

function renderHistoryBanner() {
  if (state.chatHistory.loading && state.chatMessages.length > 0) {
    return '<div class="history-indicator">正在加载更早记录...</div>';
  }

  if (state.chatHistory.error) {
    return `<div class="history-indicator error">历史记录加载失败：${escapeHtml(state.chatHistory.error)}</div>`;
  }

  if (state.chatHistory.reachedStart && state.chatMessages.length > 0) {
    return '<div class="history-indicator">前面没有记录了</div>';
  }

  return "";
}

function pushAssistantMessage(content, render = true, options = {}) {
  const last = state.chatMessages.at(-1);
  if (last?.role === "assistant" && last.content === content) return;

  state.chatMessages.push({
    id: options.id || createMessageId(),
    sourceLogId: options.sourceLogId,
    role: "assistant",
    content,
    timestamp: new Date().toISOString()
  });
  if (render) renderChatLog();
}

function renderEarningActions(message) {
  const sourceLogId =
    message.sourceLogId ||
    (typeof message.id === "string" && message.id.endsWith(":assistant")
      ? message.id.slice(0, -":assistant".length)
      : "");
  if (!sourceLogId) return "";

  const actions = state.earningActions.filter((action) => action.sourceLogId === sourceLogId);
  if (!actions.length) return "";

  const kindLabels = {
    publish_offer: "发布服务",
    contact_prospect: "联系潜在客户",
    purchase: "购买",
    open_account: "开户",
    move_money: "转账"
  };
  const statusLabels = {
    pending_approval: "待你授权",
    approved: "已授权，等待工具执行",
    rejected: "已拒绝",
    completed: "已有工具证据，已完成",
    failed: "执行失败"
  };

  return `
    <div class="earning-actions">
      ${actions
        .map(
          (action) => `
            <div class="earning-action">
              <div class="earning-action-head">
                <strong>${escapeHtml(action.title)}</strong>
                <span class="earning-action-status status-${escapeHtml(action.status)}">
                  ${escapeHtml(statusLabels[action.status] || action.status)}
                </span>
              </div>
              <div class="earning-action-kind">${escapeHtml(kindLabels[action.kind] || action.kind)}</div>
              <p>${escapeHtml(action.description)}</p>
              <p class="earning-action-metric">验证标准：${escapeHtml(action.successMetric)}</p>
              <p class="earning-action-cost">预计成本：¥${escapeHtml(action.estimatedCostCny ?? 0)}</p>
              ${
                action.status === "pending_approval"
                  ? `
                    <div class="earning-action-buttons">
                      <button
                        type="button"
                        data-action="decide-earning-action"
                        data-action-id="${escapeHtml(action.id)}"
                        data-decision="approved"
                      >授权</button>
                      <button
                        type="button"
                        class="secondary"
                        data-action="decide-earning-action"
                        data-action-id="${escapeHtml(action.id)}"
                        data-decision="rejected"
                      >拒绝</button>
                    </div>
                  `
                  : ""
              }
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function pushUserMessage(content) {
  const id = createMessageId();
  state.chatMessages.push({
    id,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    status: "queued",
    errorMessage: ""
  });
  renderChatLog();
  return id;
}

function getChatMessage(messageId) {
  return state.chatMessages.find((message) => message.id === messageId) || null;
}

function updateChatMessage(messageId, patch, render = true) {
  const message = getChatMessage(messageId);
  if (!message) return null;
  Object.assign(message, patch);
  if (render) renderChatLog();
  return message;
}

function getMissingOnboardingStep() {
  const profile = state.selfModel?.profile || {};
  return ONBOARDING_STEPS.find((step) => !profile[step.key]) || null;
}

function maybeStartOnboarding() {
  const next = getMissingOnboardingStep();
  if (!next) {
    state.onboarding.active = null;
    if (!state.onboarding.autoStarted) {
      pushAssistantMessage("你可以直接和我聊你正在面对的事。");
      state.onboarding.autoStarted = true;
    }
    setMood("idle", "等你开口。");
    return;
  }

  state.onboarding.active = next.key;
  if (!state.onboarding.autoStarted || !hasAskedFor(next.key)) {
    pushAssistantMessage(next.prompt);
    state.onboarding.autoStarted = true;
  }
  setMood("listening", "先通过对话把必要的信息收进来。");
}

function hasAskedFor(key) {
  const prompt = ONBOARDING_STEPS.find((step) => step.key === key)?.prompt;
  return state.chatMessages.some((message) => message.role === "assistant" && message.content === prompt);
}

async function saveProfilePatch(patch) {
  const current = state.selfModel?.profile || {};
  await postJson("/api/intake/profile", {
    ...current,
    ...patch
  });
}

async function handleOnboardingReply(message) {
  const currentStep = ONBOARDING_STEPS.find((step) => step.key === state.onboarding.active);
  if (!currentStep) return false;

  const parsed = currentStep.parser(message);
  if (!parsed.ok) {
    pushAssistantMessage(currentStep.invalid);
    setMood("concerned", "这个字段我还没记稳，想再确认一下。");
    return true;
  }

  await saveProfilePatch({ [currentStep.key]: parsed.value });
  await refreshModel();

  if (getMissingOnboardingStep()) {
    pushAssistantMessage("收到。");
    maybeStartOnboarding();
  } else {
    pushAssistantMessage("好，我先记下这些。后面我们就在聊天里继续了解你。");
    setMood("delighted", "必要信息先收住了。");
    if (!(state.selfModel?.priorSkillOutputs || []).some((item) => item.status === "ready")) {
      await generatePriors(true);
    }
  }

  return true;
}

async function generatePriors(silent = false) {
  try {
    if (!silent) {
      setWorkspaceStatus("正在更新先验...");
    }
    setMood("thinking", "在整理一版新的低权重先验。");
    await postJson("/api/priors/generate", {});
    await refreshModel();
    if (!silent) {
      pushAssistantMessage("我已经根据现有资料更新了一版先验。");
    }
    setMood("delighted", "先验已经刷新。");
  } catch (error) {
    handleError(error, "更新先验失败");
  }
}

async function saveRuntimeConfig() {
  try {
    setWorkspaceStatus("正在保存模型配置...");
    const apiKey = byId("runtimeApiKey").value.trim();
    const payload = {
      provider: byId("runtimeProvider").value,
      model: byId("runtimeModel").value.trim(),
      baseUrl: byId("runtimeBaseUrl").value.trim()
    };
    if (apiKey) payload.apiKey = apiKey;
    await postJson("/api/runtime/config", payload);
    await refreshModel();
    setWorkspaceStatus("模型配置已保存");
  } catch (error) {
    handleError(error, "保存模型配置失败");
  }
}

async function saveTrainingConfig() {
  try {
    setWorkspaceStatus("正在保存微调配置...");
    await postJson("/api/train/config", {
      model: byId("trainingModel").value,
      maxDurationSeconds: Number(byId("maxDurationSeconds").value || 300),
      window: {
        startHourLocal: Number(byId("windowStartHour").value || 1),
        endHourLocal: Number(byId("windowEndHour").value || 6)
      }
    });
    await refreshModel();
    setWorkspaceStatus("微调配置已保存");
  } catch (error) {
    handleError(error, "保存微调配置失败");
  }
}

async function prepareTrainingModelNow() {
  try {
    setWorkspaceStatus("正在准备训练模型...");
    setMood("dreaming", "先把本地微调模型准备好。");
    const durationSeconds = Number(byId("maxDurationSeconds").value || 300);
    const payload = await postJson("/api/train/prepare-model", {
      maxDurationSeconds: durationSeconds
    });
    await refreshModel();
    if (payload.preparation?.status === "prepared") {
      setWorkspaceStatus("训练模型已准备");
      setMood("delighted", "后面的夜间快训就不会顺手再去下载模型了。");
    } else {
      setWorkspaceStatus(`训练模型继续下载中 · 本轮 ${durationSeconds} 秒`);
      setMood("dreaming", payload.preparation?.reason || "这一轮已经向前推进了一些。");
    }
  } catch (error) {
    handleError(error, "准备训练模型失败");
  }
}

async function runTraining(respectWindow) {
  try {
    setWorkspaceStatus(respectWindow ? "正在检查时段..." : "正在训练...");
    setMood("dreaming", "它在整理今天的线索。");
    const payload = await postJson("/api/train/nightly", { respectWindow });
    const status = payload.trainingRun?.status || "unknown";
    await refreshModel();
    setWorkspaceStatus(`训练结果 · ${status}`);
    setMood(
      status === "skipped_window" ? "idle" : "dreaming",
      status === "skipped_window" ? "现在不在训练时段里。" : "这一轮训练已经写入记录。"
    );
  } catch (error) {
    handleError(error, "训练失败");
  }
}

async function submitUserMessage(messageId, { retry = false } = {}) {
  const currentMessage = getChatMessage(messageId);
  if (!currentMessage || currentMessage.role !== "user") return;
  if (currentMessage.status === "sending" || currentMessage.status === "retrying") return;
  if (state.submitting) return;

  state.submitting = true;
  byId("sendMessage").disabled = true;

  updateChatMessage(messageId, {
    status: retry ? "retrying" : "sending",
    errorMessage: ""
  });

  const message = currentMessage.content;
  try {
    setComposerStatus(retry ? "已收到，正在重新处理这条消息..." : "已收到，正在处理中...", "busy");
    if (state.onboarding.active) {
      const consumed = await handleOnboardingReply(message);
      if (consumed) {
        updateChatMessage(messageId, {
          status: "sent",
          errorMessage: ""
        });
        setComposerStatus("", "busy");
        return;
      }
    }

    setWorkspaceStatus(retry ? "正在重新发送..." : "正在回复...");
    setMood("thinking", "我在想。");

    const payload = await postJson("/api/chat", { message });
    updateChatMessage(messageId, {
      status: "sent",
      errorMessage: ""
    });
    setComposerStatus("正在整理回复...", "busy");
    if (Array.isArray(payload.earningActions) && payload.earningActions.length > 0) {
      const byActionId = new Map(state.earningActions.map((action) => [action.id, action]));
      for (const action of payload.earningActions) byActionId.set(action.id, action);
      state.earningActions = [...byActionId.values()];
    }
    pushAssistantMessage(payload.reply, true, {
      id: payload.logEntryId ? `${payload.logEntryId}:assistant` : undefined,
      sourceLogId: payload.logEntryId
    });

    const [mood, reason] = classifyReplyMood(payload.reply || "");
    setMood(mood, reason);

    await refreshModel();
    setWorkspaceStatus("已同步最新对话");
    setComposerStatus("", "busy");
  } catch (error) {
    updateChatMessage(messageId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    setComposerStatus("发送失败，请重试。", "error");
    handleError(error, retry ? "重发失败" : "发送失败");
  } finally {
    state.submitting = false;
    byId("sendMessage").disabled = false;
  }
}

async function sendMessage() {
  if (state.submitting) return;
  const input = byId("message");
  const message = input.value.trim();
  if (!message) return;

  const messageId = pushUserMessage(message);
  input.value = "";
  await submitUserMessage(messageId);
}

async function retryMessage(messageId) {
  if (state.submitting) return;
  const message = getChatMessage(messageId);
  if (!message || message.role !== "user" || message.status !== "failed") return;

  await submitUserMessage(messageId, { retry: true });
}

async function decideEarningAction(actionId, decision) {
  if (decision !== "approved" && decision !== "rejected") return;
  setComposerStatus(decision === "approved" ? "正在记录授权..." : "正在记录拒绝...", "busy");
  await postJson(`/api/earning/actions/${encodeURIComponent(actionId)}/decision`, { decision });
  await refreshModel();
  setComposerStatus(
    decision === "approved" ? "已授权；只有工具返回证据后才会标记完成。" : "已拒绝该动作。",
    "busy"
  );
}

function handleChatAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.dataset.action === "retry-message") {
    const { messageId } = button.dataset;
    if (!messageId) return;
    retryMessage(messageId).catch((error) => handleError(error, "重发失败"));
    return;
  }

  if (button.dataset.action === "decide-earning-action") {
    const { actionId, decision } = button.dataset;
    if (!actionId || !decision) return;
    decideEarningAction(actionId, decision).catch((error) =>
      handleError(error, "记录赚钱动作授权失败")
    );
  }
}

function handleComposerKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function handleChatScroll(event) {
  const target = event.currentTarget;
  if (!target || target.scrollTop > 32) return;
  if (!state.chatHistory.initialized || state.chatHistory.loading || !state.chatHistory.hasMore) return;

  const oldestMessage = state.chatMessages[0];
  if (!oldestMessage?.id) return;

  loadChatHistory({
    beforeId: oldestMessage.id,
    preserveScrollPosition: true
  }).catch((error) => {
    state.chatHistory.error = error instanceof Error ? error.message : String(error);
    renderChatLog({ stickToBottom: false });
  });
}

function renderDesireChart() {
  const persisted = state.selfModel?.desireState;
  const outputs = persisted?.axes?.length
    ? persisted.axes.map((axis) => ({ ...axis, score: axis.displayScore }))
    : deriveDesireScores();
  byId("desireEvidence").textContent = persisted
    ? `${persisted.turnsSinceBaseline}/${10}`
    : `${(state.selfModel?.priorSkillOutputs || []).filter((item) => item.status === "ready").length}先验`;

  byId("desireChart").innerHTML = outputs
    .map((axis) => {
      const scoreText =
        axis.score > 0.28 ? "偏正向" : axis.score < -0.28 ? "阴影拉扯" : "接近平衡";
      return `
        <div class="axis">
          <div class="axis-top">
            <div class="info-wrap">
              <span class="axis-name">${escapeHtml(axis.positiveName)}</span>
              <button class="info-button" type="button" aria-label="${escapeHtml(axis.positiveName)}解释">?</button>
              <div class="tooltip">
                <strong>${escapeHtml(axis.desireType)}</strong>
                <p><b>正向发展：</b>${escapeHtml(axis.positiveLabels)}</p>
                <p><b>平衡状态：</b>${escapeHtml(axis.balance)}</p>
                <p><b>失控后：</b>${escapeHtml(axis.shadow)}</p>
              </div>
            </div>
          </div>
          <div class="axis-track">
            <div class="axis-line"></div>
            <div class="axis-marker" style="--score-pos:${scoreToPosition(axis.score)}%; --axis-color:${axis.score < -0.28 ? "#d23f57" : axis.score > 0.28 ? "#18a36d" : "#2d6df6"};"></div>
          </div>
          <div class="axis-bottom">
            <div class="axis-shadow">${escapeHtml(axis.shadow)}</div>
            <div class="axis-score">${escapeHtml(scoreText)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function deriveDesireScores() {
  const sources = [];
  const selfModel = state.selfModel || {};

  for (const output of selfModel.priorSkillOutputs || []) {
    if (output.status !== "ready") continue;
    sources.push({
      text: [output.summary, ...(output.structuredSignals || []), ...(output.suggestedQuestions || [])].join(" "),
      weight: 0.85
    });
  }

  for (const facet of selfModel.currentProjection?.facets || []) {
    sources.push({
      text: `${facet.label} ${facet.summary}`,
      weight: 1.1
    });
  }

  for (const pending of selfModel.pendingConfirmations || []) {
    sources.push({
      text: `${pending.type} ${pending.statement}`,
      weight: 0.9
    });
  }

  for (const message of state.chatMessages.slice(-6)) {
    sources.push({
      text: message.content,
      weight: message.role === "user" ? 1 : 0.55
    });
  }

  return DESIRE_AXES.map((axis) => {
    let positive = 0;
    let shadow = 0;

    for (const source of sources) {
      const text = source.text.toLowerCase();
      positive += countWeightedHits(text, axis.positiveTokens, source.weight);
      shadow += countWeightedHits(text, axis.shadowTokens, source.weight);

      if (axis.key === "security" && /(赚钱|收入|cash|money|income)/i.test(source.text)) {
        positive += 0.22 * source.weight;
      }
      if (axis.key === "ambition" && /(成长|学习|skill|growth|learn)/i.test(source.text)) {
        positive += 0.22 * source.weight;
      }
      if (axis.key === "intimacy" && /(关系|亲密|表达情感|emotion|relationship)/i.test(source.text)) {
        positive += 0.22 * source.weight;
      }
      if (axis.key === "rest" && /(恢复|休息|太累|burnout|rest|sleep)/i.test(source.text)) {
        positive += 0.22 * source.weight;
      }
    }

    const totalSignal = positive + shadow;
    const score = totalSignal < 0.2 ? 0 : clamp((positive - shadow * 1.12) / 3.2, -1, 1);

    return { ...axis, score };
  });
}

function countWeightedHits(text, tokens, weight) {
  return tokens.reduce((sum, token) => sum + (text.includes(token.toLowerCase()) ? weight : 0), 0);
}

function scoreToPosition(score) {
  return 50 - score * 36;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function classifyReplyMood(text) {
  if (/(需要确认|不确定|还需要|可能还要|需要更多)/.test(text)) {
    return ["concerned", "这里可能还要再确认一下。"];
  }
  if (/(第一步|建议你先|马上可以|可以先做|优先)/.test(text)) {
    return ["delighted", "我已经给到可执行的下一步了。"];
  }
  return ["idle", "等你继续。"];
}

function handleError(error, prefix) {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  setWorkspaceStatus(`${prefix} · ${message}`);
  setMood("concerned", "这里出错了，先看下设置。");
}

function openSettings() {
  byId("settingsBackdrop").classList.add("open");
  byId("settingsDrawer").classList.add("open");
  byId("settingsDrawer").setAttribute("aria-hidden", "false");
}

function closeSettings() {
  byId("settingsBackdrop").classList.remove("open");
  byId("settingsDrawer").classList.remove("open");
  byId("settingsDrawer").setAttribute("aria-hidden", "true");
}

function parseGender(text) {
  const value = text.trim().toLowerCase();
  if (["男", "男性", "male", "man"].includes(value)) {
    return { ok: true, value: "male" };
  }
  if (["女", "女性", "female", "woman"].includes(value)) {
    return { ok: true, value: "female" };
  }
  return { ok: false };
}

function parseBirthDate(text) {
  const match = text.trim().match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return { ok: false };
  const year = match[1];
  const month = String(match[2]).padStart(2, "0");
  const day = String(match[3]).padStart(2, "0");
  return { ok: true, value: `${year}-${month}-${day}` };
}

function parseBirthTime(text) {
  const match = text.trim().match(/(\d{1,2})[:：点](\d{1,2})?/);
  if (!match) return { ok: false };
  const hour = String(match[1]).padStart(2, "0");
  const minute = String(match[2] || "00").padStart(2, "0");
  return { ok: true, value: `${hour}:${minute}` };
}

function parseBirthLocation(text) {
  const value = text.trim();
  if (!value) return { ok: false };
  return { ok: true, value };
}

byId("sendMessage").addEventListener("click", sendMessage);
byId("refreshModel").addEventListener("click", refreshModel);
byId("openSettings").addEventListener("click", openSettings);
byId("closeSettings").addEventListener("click", closeSettings);
byId("settingsBackdrop").addEventListener("click", closeSettings);
byId("saveRuntimeConfig").addEventListener("click", saveRuntimeConfig);
byId("saveTrainingConfig").addEventListener("click", saveTrainingConfig);
byId("prepareTrainingModel").addEventListener("click", prepareTrainingModelNow);
byId("runTraining").addEventListener("click", () => runTraining(false));
byId("runScheduledTraining").addEventListener("click", () => runTraining(true));
byId("generatePriors").addEventListener("click", () => generatePriors(false));
byId("chatLog").addEventListener("click", handleChatAction);
byId("chatLog").addEventListener("scroll", handleChatScroll);
byId("message").addEventListener("keydown", handleComposerKeydown);

refreshModel().catch((error) => handleError(error, "初始化失败"));
