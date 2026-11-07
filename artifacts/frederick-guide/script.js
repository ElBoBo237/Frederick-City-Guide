// Keep visitor notes in this page only; nothing is saved between visits.
const likeForm = document.querySelector("#like-form");
const likeInput = document.querySelector("#like-input");
const likeList = document.querySelector("#like-list");
const emptyLikes = document.querySelector("#empty-likes");

likeForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const note = likeInput.value.trim();
  if (!note) {
    likeInput.focus();
    return;
  }

  const listItem = document.createElement("li");
  listItem.textContent = note;
  likeList.appendChild(listItem);
  emptyLikes.hidden = true;
  likeInput.value = "";
  likeInput.focus();
});

// Add the animation class on each tap, then remove it so it can play again.
const birdImage = document.querySelector(".bird");
const birdButton = document.querySelector(".bird-trigger");
let shakeTimer;

birdButton.addEventListener("click", () => {
  window.clearTimeout(shakeTimer);
  birdImage.classList.remove("shake");

  // A layout read restarts the CSS animation after a quick repeat tap.
  void birdImage.offsetWidth;
  birdImage.classList.add("shake");

  shakeTimer = window.setTimeout(() => {
    birdImage.classList.remove("shake");
  }, 700);
});

// Keep Prompt Lab settings in sync with their visible values.
const temperatureInput = document.querySelector("#temperature");
const temperatureValue = document.querySelector("#temperature-value");
const topPInput = document.querySelector("#top-p");
const topPValue = document.querySelector("#top-p-value");
const maxTokensInput = document.querySelector("#max-tokens");
const maxTokensValue = document.querySelector("#max-tokens-value");
const systemPromptOutput = document.querySelector("#system-prompt-output");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSubmit = document.querySelector("#chat-submit");
const chatMessages = document.querySelector("#chat-messages");
const chatStatus = document.querySelector("#chat-status");
const chatHistory = [];

function updatePromptSettings() {
  temperatureValue.value = Number(temperatureInput.value).toFixed(1);
  topPValue.value = Number(topPInput.value).toFixed(2);
  maxTokensValue.value = maxTokensInput.value;
}

temperatureInput.addEventListener("input", updatePromptSettings);
topPInput.addEventListener("input", updatePromptSettings);
maxTokensInput.addEventListener("input", updatePromptSettings);

function addChatMessage({ role, text, settings, usage, model, error = false }) {
  const item = document.createElement("li");
  item.className = `chat-message chat-message-${role}${error ? " chat-message-error" : ""}`;

  const messageText = document.createElement("p");
  messageText.className = "chat-message-text";
  messageText.textContent = text;
  item.appendChild(messageText);

  if (role === "assistant" && settings && usage) {
    const settingsNote = document.createElement("p");
    settingsNote.className = "chat-message-meta";
    settingsNote.textContent = `${model} · temperature ${settings.temperature} · top-p ${settings.topP} · max ${settings.maxOutputTokens} tokens`;
    item.appendChild(settingsNote);

    const usageNote = document.createElement("p");
    usageNote.className = "chat-message-meta";
    usageNote.textContent = `Tokens used: ${usage.promptTokens} prompt · ${usage.outputTokens} answer · ${usage.totalTokens} total`;
    item.appendChild(usageNote);

    if (
      usage.finishReason === "MAX_TOKENS" ||
      usage.outputTokens >= settings.maxOutputTokens
    ) {
      const cutOffNote = document.createElement("p");
      cutOffNote.className = "chat-cutoff-note";
      cutOffNote.textContent = "This answer was cut off at the token limit.";
      item.appendChild(cutOffNote);
    }
  }

  chatMessages.appendChild(item);
  item.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return item;
}

async function loadSystemPrompt() {
  try {
    const response = await fetch("/api/chat/system-prompt");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load the prompt.");
    systemPromptOutput.textContent = data.systemPrompt;
  } catch {
    systemPromptOutput.textContent = "The system prompt could not be loaded right now.";
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || chatSubmit.disabled) return;

  addChatMessage({ role: "user", text: message });
  chatInput.value = "";
  chatSubmit.disabled = true;
  chatStatus.textContent = "The city guide is thinking…";
  const thinkingMessage = addChatMessage({
    role: "assistant",
    text: "One moment while I check my local notes…",
  });

  const settings = {
    temperature: Number(temperatureInput.value),
    topP: Number(topPInput.value),
    maxOutputTokens: Number(maxTokensInput.value),
  };

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: chatHistory.slice(-16),
        settings,
      }),
    });
    const data = await response.json();
    thinkingMessage.remove();

    if (!response.ok) {
      addChatMessage({
        role: "assistant",
        text: data.error || "The city guide could not answer right now.",
        error: true,
      });
      chatStatus.textContent = "The city guide could not answer that question.";
      return;
    }

    addChatMessage({
      role: "assistant",
      text: data.reply,
      settings: data.settings,
      usage: data.usage,
      model: data.model,
    });
    chatHistory.push({ role: "user", content: message });
    chatHistory.push({ role: "assistant", content: data.reply });
    chatStatus.textContent = "Answer received.";
  } catch {
    thinkingMessage.remove();
    addChatMessage({
      role: "assistant",
      text: "The city guide could not connect. Please try again.",
      error: true,
    });
    chatStatus.textContent = "Could not connect to the city guide.";
  } finally {
    chatSubmit.disabled = false;
    chatInput.focus();
  }
});

updatePromptSettings();
loadSystemPrompt();
