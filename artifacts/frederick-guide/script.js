// Keep visitor notes in this page only; nothing is saved between visits.
const likeForm = document.querySelector("#like-form");
const likeInput = document.querySelector("#like-input");
const likeList = document.querySelector("#like-list");
const emptyLikes = document.querySelector("#empty-likes");

const dishUploadForm = document.querySelector("#dish-upload-form");
const dishTitleInput = document.querySelector("#dish-title");
const dishCaptionInput = document.querySelector("#dish-caption");
const dishImageInput = document.querySelector("#dish-image");
const dishUploadSubmit = document.querySelector("#dish-upload-submit");
const dishUploadStatus = document.querySelector("#dish-upload-status");
const dishGalleryGrid = document.querySelector("#dish-gallery-grid");
const dishGalleryEmpty = document.querySelector("#dish-gallery-empty");
const inspirationGrid = document.querySelector("#inspiration-grid");
const inspirationStatus = document.querySelector("#inspiration-status");
const inspirationRefresh = document.querySelector("#inspiration-refresh");
const inspirationDialog = document.querySelector("#inspiration-dialog");
const inspirationDialogClose = document.querySelector("#inspiration-dialog-close");
const inspirationDialogImage = document.querySelector("#inspiration-dialog-image");
const inspirationDialogCredit = document.querySelector("#inspiration-dialog-credit");
const inspirationDialogStatus = document.querySelector("#inspiration-dialog-status");
const inspirationDialogSave = document.querySelector("#inspiration-dialog-save");
const maxDishImageBytes = 3 * 1024 * 1024;
const allowedDishImageTypes = ["image/jpeg", "image/png", "image/webp"];
let dishGalleryRequest = 0;
let inspirationRequest = 0;

// Both preview and published pages reach the API through the shared proxy.
const apiOrigin = "";

async function fetchApi(path, options) {
  try {
    return await fetch(`${apiOrigin}${path}`, options);
  } catch (error) {
    throw new Error(
      "Couldn't connect to the photo service. Please try again in a moment.",
    );
  }
}

async function readApiJson(response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      `The photo service is unavailable (HTTP ${response.status}). Please try again in a moment.`,
    );
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error("The API returned invalid JSON. Please try again or check the API server logs.");
  }
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This browser could not prepare the photo for upload."));
    }, mimeType, quality);
  });
}

async function resizeDishImage(file) {
  if (!allowedDishImageTypes.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP photo. GIFs are not supported.");
  }
  if (file.size > maxDishImageBytes) {
    throw new Error("Photos must be 3 MB or smaller. Please choose a smaller file.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("We couldn't read that photo. Try a JPEG, PNG, or WebP image.");
  }

  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the photo for upload.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let blob = await canvasToBlob(canvas, file.type, 0.86);
    if (blob.size > maxDishImageBytes) {
      for (const quality of [0.78, 0.65, 0.52, 0.4]) {
        blob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (blob.size <= maxDishImageBytes) break;
      }
    }
    if (blob.size > maxDishImageBytes) {
      throw new Error("This photo is still larger than 3 MB after resizing. Choose a smaller image.");
    }
    if (!allowedDishImageTypes.includes(blob.type)) {
      throw new Error("This browser could not convert the photo to a supported image format.");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Could not read the resized photo.")));
    reader.readAsDataURL(blob);
  });
}

function makeDishCard(dish) {
  const card = document.createElement("article");
  card.className = "dish-card";

  const image = document.createElement("img");
  image.className = "dish-card-image";
  image.src = `${apiOrigin}${dish.imageUrl}`;
  image.alt = dish.title;
  image.loading = "lazy";
  card.appendChild(image);

  const details = document.createElement("div");
  details.className = "dish-card-details";
  const title = document.createElement("h3");
  title.textContent = dish.title;
  details.appendChild(title);

  if (dish.caption) {
    const caption = document.createElement("p");
    caption.className = "dish-card-caption";
    caption.textContent = dish.caption;
    details.appendChild(caption);
  }

  if (dish.inspectorNote) {
    const inspectorNote = document.createElement("p");
    inspectorNote.className = "dish-card-inspector";
    inspectorNote.textContent = dish.inspectorNote;
    details.appendChild(inspectorNote);
  }

  const date = document.createElement("time");
  date.className = "dish-card-date";
  date.dateTime = dish.createdAt;
  date.textContent = new Date(dish.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  details.appendChild(date);
  card.appendChild(details);
  return card;
}

async function recordUnsplashDownload(downloadLocation) {
  const response = await fetchApi("/api/unsplash/dish-inspiration/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadLocation }),
  });
  if (!response.ok) {
    const result = await readApiJson(response);
    throw new Error(result.error || "We couldn't record this Unsplash view.");
  }
}

function showInspirationPhoto(photo) {
  inspirationDialogImage.src = photo.imageUrl;
  inspirationDialogImage.alt = photo.altText;
  inspirationDialogCredit.replaceChildren();

  const creditLabel = document.createTextNode("Photo by ");
  const photographer = document.createElement("a");
  photographer.href = photo.photographerProfileUrl;
  photographer.target = "_blank";
  photographer.rel = "noopener noreferrer";
  photographer.textContent = photo.photographerName;
  inspirationDialogCredit.append(creditLabel, photographer);

  inspirationDialogSave.href = photo.rawUrl;
  inspirationDialogSave.onclick = () => {
    recordUnsplashDownload(photo.downloadLocation).catch((error) => {
      inspirationDialogStatus.textContent = error instanceof Error
        ? error.message
        : "We couldn't record this Unsplash view.";
    });
  };
  inspirationDialogStatus.textContent = "Recording this photo view with Unsplash…";
  inspirationDialog.showModal();
  recordUnsplashDownload(photo.downloadLocation)
    .then(() => {
      inspirationDialogStatus.textContent = "Photo view recorded.";
    })
    .catch((error) => {
      inspirationDialogStatus.textContent = error instanceof Error
        ? error.message
        : "We couldn't record this Unsplash view.";
    });
}

function makeInspirationCard(photo) {
  const card = document.createElement("article");
  card.className = "inspiration-card";

  const expand = document.createElement("button");
  expand.className = "inspiration-expand";
  expand.type = "button";
  expand.setAttribute("aria-label", `Expand photo by ${photo.photographerName}`);

  const image = document.createElement("img");
  image.className = "inspiration-image";
  image.src = photo.imageUrl;
  image.alt = photo.altText;
  image.loading = "lazy";
  expand.appendChild(image);
  expand.addEventListener("click", () => showInspirationPhoto(photo));
  card.appendChild(expand);

  const credit = document.createElement("p");
  credit.className = "inspiration-credit";
  credit.appendChild(document.createTextNode("Photo by "));

  const photographer = document.createElement("a");
  photographer.href = photo.photographerProfileUrl;
  photographer.target = "_blank";
  photographer.rel = "noopener noreferrer";
  photographer.textContent = photo.photographerName;
  credit.appendChild(photographer);
  card.appendChild(credit);

  return card;
}

async function loadDishInspiration() {
  const requestId = ++inspirationRequest;
  inspirationRefresh.disabled = true;
  inspirationStatus.textContent = "Loading food inspiration…";

  try {
    const response = await fetchApi("/api/unsplash/dish-inspiration");
    const photos = await readApiJson(response);
    if (!response.ok) {
      throw new Error(photos.error || "Food inspiration could not be loaded.");
    }
    if (!Array.isArray(photos)) {
      throw new Error("The food inspiration response was invalid.");
    }

    if (requestId !== inspirationRequest) return;
    inspirationGrid.replaceChildren(...photos.slice(0, 6).map(makeInspirationCard));
    inspirationStatus.textContent = photos.length
      ? `Showing ${Math.min(photos.length, 6)} Unsplash photos.`
      : "No inspiration photos were found. Try refreshing.";
  } catch (error) {
    if (requestId !== inspirationRequest) return;
    inspirationStatus.textContent = error instanceof Error
      ? error.message
      : "Food inspiration could not be loaded. Please try again.";
  } finally {
    if (requestId === inspirationRequest) inspirationRefresh.disabled = false;
  }
}

async function loadDishGallery() {
  const requestId = ++dishGalleryRequest;
  try {
    const response = await fetchApi("/api/dishes");
    const dishes = await readApiJson(response);
    if (!response.ok) throw new Error(dishes.error || "Could not load the dish gallery.");
    if (!Array.isArray(dishes)) throw new Error("The dish gallery response was invalid.");

    if (requestId !== dishGalleryRequest) return false;
    dishGalleryGrid.replaceChildren(...dishes.map(makeDishCard));
    dishGalleryEmpty.hidden = dishes.length > 0;
    return true;
  } catch (error) {
    if (requestId !== dishGalleryRequest) return false;
    dishGalleryGrid.replaceChildren();
    dishGalleryEmpty.hidden = true;
    dishUploadStatus.textContent = error instanceof Error
      ? error.message
      : "The dish gallery could not be loaded. Please try again later.";
    return false;
  }
}

dishUploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = dishImageInput.files[0];
  if (!file) {
    dishUploadStatus.textContent = "Choose a photo to share.";
    return;
  }

  dishUploadSubmit.disabled = true;
  dishUploadStatus.textContent = "Preparing your photo…";
  try {
    const image = await blobToDataUrl(await resizeDishImage(file));
    const response = await fetchApi("/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: dishTitleInput.value.trim(),
        caption: dishCaptionInput.value.trim(),
        image,
      }),
    });
    const result = await readApiJson(response);
    if (!response.ok) {
      const message = [result.error, result.reason].filter(Boolean).join(" ");
      throw new Error(message || "Your photo could not be uploaded.");
    }

    dishUploadForm.reset();
    const galleryLoaded = await loadDishGallery();
    dishUploadStatus.textContent = galleryLoaded
      ? "Your dish photo has been added to the gallery."
      : "Your photo was saved, but the gallery could not be refreshed.";
  } catch (error) {
    dishUploadStatus.textContent = error instanceof Error
      ? error.message
      : "Your photo could not be uploaded. Please try again.";
  } finally {
    dishUploadSubmit.disabled = false;
  }
});

inspirationRefresh.addEventListener("click", loadDishInspiration);
inspirationDialogClose.addEventListener("click", () => inspirationDialog.close());
inspirationDialog.addEventListener("click", (event) => {
  if (event.target === inspirationDialog) inspirationDialog.close();
});

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
    const response = await fetchApi("/api/chat/system-prompt");
    const data = await readApiJson(response);
    if (!response.ok) throw new Error(data.error || "Could not load the prompt.");
    systemPromptOutput.textContent = data.systemPrompt;
  } catch (error) {
    systemPromptOutput.textContent = error instanceof Error
      ? error.message
      : "The system prompt could not be loaded right now.";
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
    const response = await fetchApi("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: chatHistory.slice(-16),
        settings,
      }),
    });
    const data = await readApiJson(response);
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
loadDishGallery();
loadDishInspiration();
