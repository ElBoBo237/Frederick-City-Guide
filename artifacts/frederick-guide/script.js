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
