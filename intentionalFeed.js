let MINUTES_LIMIT = 10; // fallback default

chrome.storage.local.get(['feedMinutesLimit'], (data) => {
  if (data.feedMinutesLimit && !isNaN(data.feedMinutesLimit)) {
    MINUTES_LIMIT = data.feedMinutesLimit;
  }
});

// Optional: Listen for live changes too
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.feedMinutesLimit) {
    MINUTES_LIMIT = changes.feedMinutesLimit.newValue;
  }
});

const INJECTION_INTERVAL = 10;
let scrollCounter = 0;
let overlayActive = false;
let startTime = Date.now();
let cachedQuote = null;

// === Categorized Quotes ===
const categorizedQuotes = {
  wakeup: [
  "Every second you waste, someone else is building your dream.",
  "You'll regret this comfort when opportunity knocks and you're not ready.",
  "Comfort is a slow death. Choose discomfort that builds you.",
  "If today was your last, would you still scroll?",
  "You say you're tired — but from what? Wasting time?",
  "Discipline is painful — until regret arrives. Then it's unbearable."
],
  calm: [
  "What if your mind is tired not from work, but from noise?",
  "Rest isn't earned through scrolling. It's earned through purpose.",
  "Silence is your mind's oxygen. Breathe it in.",
  "You're overstimulated, not overwhelmed. Unplug.",
  "Peace doesn't come from escape — it comes from facing what you avoid.",
  "Not everything deserves your attention. Especially this."
],
  knowledge: [
  "Someone out there is studying while you scroll. You'll meet them in your future.",
  "Your ignorance is the price you pay for distraction.",
  "Time is the tuition you pay to ignorance — unless you invest it in learning.",
  "A few pages a day could change your life. Reels won't.",
  "The brain craves growth — not dopamine.",
  "Every scroll is a skipped paragraph of your own progress."
],
  disrupt: [
  "This isn't relaxing — it's numbing. You know it.",
  "You're not tired. You're trapped in a loop.",
  "You said 'just 5 minutes' 45 minutes ago.",
  "You've read more captions than pages today. Think about that.",
  "You escaped boredom — into emptiness.",
  "Every swipe is a vote to stay stuck. Stop."
],
  funny: [
  "Congrats! You've officially earned a PhD in Scrolling.",
  "Your thumb's getting stronger, but what about your future?",
  "You've scrolled past 99 strangers today. Still lonely?",
  "Even your screen thinks you're avoiding your real life.",
  "If wasting time was an Olympic sport, you'd win gold.",
  "Your feed: entertaining. Your life: paused."
],
  code: [
  "You're debugging your boredom with distractions. It won't compile.",
  "Every scroll is a missed chance to build.",
  "That side project won't write itself.",
  "You debug code. When will you debug your life?",
  "You hate errors — but accept wasting time silently.",
  "You could've learned a new library. You chose TikTok instead."
],
  inspire: [
  "Your future self is watching. Will they thank you or resent you?",
  "Dreams die in distraction. Wake up.",
  "You're not lost — you're just distracted.",
  "You had momentum once. Remember how that felt?",
  "What if this is the moment you decide to be better?",
  "Inaction is a habit. Break it now — or it breaks you."
]
,
  reset: [
    "Sorry. Unable to understand your Feelings",
    "Not sure what that means, but you're not alone.",
    "That emotion is valid, even if it's undefined.",
    "Sometimes it's okay to NOT have the correct words.",
    "Take your time. No rush to label the feeling.",
    "Unclear feelings are part of being human."
  ]
};

const lifeTips = [
  "📚 Read one page from a book you love.",
  "☕ Make yourself a warm cup of tea or coffee.",
  "📵 Put your phone away for 10 minutes and just breathe.",
  "👣 Walk slowly and notice each step you take.",
  "🪞 Look in the mirror and smile at yourself.",
  "🎧 Listen to your favorite calming music.",
  "📓 Write down 3 things you're grateful for.",
  "💤 Close your eyes for 60 seconds and do nothing.",
  "🌼 Observe something beautiful around you.",
  "🤲 Rub your hands together and feel the warmth.",
  "🧹 Clean a small space — even a drawer or corner.",
  "📴 Disconnect from screens and look out the window.",
  "🖌️ Doodle or draw for just 2 minutes.",
];

const quoteStyles = [
  {
    background: "linear-gradient(to right, #fdfbfb, #ebedee)",
    borderTop: "#2196f3",
    animation: "fadeZoom"
  },
  {
    background: "linear-gradient(to right, #fff1eb, #ace0f9)",
    borderTop: "#4caf50",
    animation: "slideFade"
  },
  {
    background: "radial-gradient(circle, #e3f2fd, #fff)",
    borderTop: "#ab47bc",
    animation: "zoomPop"
  },
  {
    background: "linear-gradient(to right, #f9f9f9, #dbe4ec)",
    borderTop: "#ff7043",
    animation: "fadeZoom"
  },
  {
    background: "linear-gradient(to right, #e0f7fa, #fce4ec)",
    borderTop: "#00695c",
    animation: "zoomPop"
  },
  {
    background: "linear-gradient(to right, #fffde7, #ffe082)",
    borderTop: "#fbc02d",
    animation: "slideFade"
  },
  {
    background: "linear-gradient(to right, #ede7f6, #d1c4e9)",
    borderTop: "#673ab7",
    animation: "fadeZoom"
  },
  {
    background: "linear-gradient(to right, #fce4ec, #f8bbd0)",
    borderTop: "#d81b60",
    animation: "zoomPop"
  },
  {
    background: "linear-gradient(to right, #c8e6c9, #a5d6a7)",
    borderTop: "#388e3c",
    animation: "slideFade"
  },
  {
    background: "linear-gradient(to right, #e1f5fe, #b3e5fc)",
    borderTop: "#0288d1",
    animation: "zoomPop"
  }
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function playDing() {
  const audio = new Audio("https://notificationsounds.com/storage/sounds/file-sounds-1150-pristine.mp3");
  audio.volume = 0.7;
  audio.play().catch(() => {});
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ZenStorage", 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("nudges")) {
        db.createObjectStore("nudges", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("focusLink")) {
        db.createObjectStore("focusLink", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("Failed to open IndexedDB");
  });
}
// Add this function near the top:
let pinnedQuoteBox = null;

async function pinQuote(quote) {
  if (pinnedQuoteBox) pinnedQuoteBox.remove();

  pinnedQuoteBox = document.createElement("div");
  pinnedQuoteBox.className = "zen-pinned-quote";
  pinnedQuoteBox.innerHTML = `<div style="position: relative;">
    <button id="close-pinned-quote" style="
      position: absolute;
      top: 6px;
      right: 8px;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 50%;
      font-size: 16px;
      line-height: 1;
      width: 28px;
      height: 28px;
      text-align: center;
      font-weight: bold;
      color: #333;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      z-index: 2;
    ">✖</button>
    <div style="margin-top: 5px;">📌 ${quote}</div>
  </div>`;

  const db = await openDB();
  const tx = db.transaction("focusLink", "readonly");
  const store = tx.objectStore("focusLink");
  const request = store.get(1);

  request.onsuccess = () => {
    const result = request.result;
    const savedLink = result?.url;

    if (savedLink) {
      const visitBtn = document.createElement("button");
      visitBtn.textContent = "🔗 Visit My Focus Link";
      visitBtn.style = `
        margin-top: 10px;
        background: #0072ff;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
      `;
      visitBtn.onclick = () => window.location.href = savedLink;

      pinnedQuoteBox.appendChild(visitBtn);
    }

    document.body.appendChild(pinnedQuoteBox);

    // ✅ Close button listener
    document.getElementById("close-pinned-quote").onclick = () => {
      pinnedQuoteBox.remove();
      pinnedQuoteBox = null;
    };
  };

  request.onerror = () => {
    console.warn("Could not fetch focus link from IndexedDB.");
    document.body.appendChild(pinnedQuoteBox);
  };
}

const style = document.createElement("style");
style.textContent = `
  .zen-pinned-quote {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #fff;
    color: #000;
    padding: 30px 30px 20px;
    border-radius: 16px;
    font-weight: bold;
    font-size: 18px;
    font-family: 'Georgia', serif;
    box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    z-index: 99999;
    animation: fadeIn 0.5s ease-out;
    text-align: center;
    max-width: 600px;
    width: 90%;
}

    @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeZoom {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
`;
document.head.appendChild(style);
const dynamicStyles = document.createElement("style");
dynamicStyles.textContent = `
@keyframes fadeZoom {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes slideFade {
  from { opacity: 0; transform: translate(-50%, -60%) translateY(-20px); }
  to { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
}
@keyframes zoomPop {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
  60% { transform: translate(-50%, -50%) scale(1.05); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
`;
document.head.appendChild(dynamicStyles);
async function storeNudge(note) {
  const db = await openDB();
  const tx = db.transaction("nudges", "readwrite");
  const store = tx.objectStore("nudges");
  store.add({ text: note });
  await tx.done;
}
async function showNudgesModal() {
  const db = await openDB();
  const tx = db.transaction("nudges", "readonly");
  const store = tx.objectStore("nudges");
  const request = store.getAll();

  request.onsuccess = () => {
    const nudges = request.result;
    if (nudges.length === 0) {
      alert("📭 No nudges saved yet.");
      return;
    }

    const modal = document.createElement("div");
    modal.className = "nudge-modal";
    modal.style = `
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 14px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.2);
      z-index: 2147483648;
      max-height: 70vh;
      overflow-y: auto;
      width: 90%;
      max-width: 500px;
      font-family: 'Poppins', sans-serif;
    `;

    const title = document.createElement("h3");
    title.textContent = "📅 Your Saved Nudges";
    title.style = `text-align:center; margin-bottom:12px;`;

    const list = document.createElement("ul");
    list.style = `list-style: none; padding: 0;`;

    nudges.forEach((nudge) => {
      const li = document.createElement("li");
      li.style = `
        margin-bottom: 12px;
        padding: 12px;
        background: #f9f9f9;
        border-radius: 10px;
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const text = document.createElement("span");
      text.textContent = nudge.text;
      text.style = `flex: 1; padding-right: 10px; color: #000;`;
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑";
      delBtn.title = "Delete this nudge";
      delBtn.style = `
        background: transparent;
        border: none;
        color: #f44336;
        font-size: 16px;
        cursor: pointer;
      `;

      delBtn.onclick = async () => {
        const confirmDelete = confirm("❌ Delete this nudge?");
        if (!confirmDelete) return;

        const delTx = db.transaction("nudges", "readwrite");
        const delStore = delTx.objectStore("nudges");
        delStore.delete(nudge.id);
        await delTx.done;

        // Remove from UI
        li.remove();
        if (list.children.length === 0) modal.remove(); // close if all deleted
      };

      li.appendChild(text);
      li.appendChild(delBtn);
      list.appendChild(li);
    });

    const close = document.createElement("button");
    close.textContent = "Close";
    close.style = `
      display: block;
      margin: 15px auto 0;
      padding: 8px 14px;
      background: #ff5252;
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-weight: bold;
    `;
    close.onclick = () => modal.remove();

    modal.appendChild(title);
    modal.appendChild(list);
    modal.appendChild(close);
    document.body.appendChild(modal);
  };

  request.onerror = () => {
    alert("❌ Failed to fetch nudges.");
  };
}

function showTipBox(tip) {
  const box = document.createElement("div");
  box.textContent = tip;
  box.style = `
    margin-top: 20px; padding: 12px;
    background: #e8f5e9; color: #1b5e20; border-left: 4px solid #4caf50;
    font-style: italic; border-radius: 10px; font-size: 15px;
  `;
  document.getElementById("mindful-overlay").appendChild(box);
}

function injectSurprise(quote) {
  // Remove existing quote card
  document.querySelectorAll('.zen-quote-box').forEach(el => el.remove());
  const variant = getRandomItem(quoteStyles);
  const quoteBox = document.createElement("div");
  quoteBox.className = "zen-quote-box";
  quoteBox.style = `
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%) scale(0.95);
  background: ${variant.background};
  padding: 25px;
  max-width: 420px;
  width: 90%;
  border-radius: 20px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.2);
  z-index: 999999;
  text-align: center;
  font-family: 'Georgia', serif;
  border-top: 8px solid ${variant.borderTop};
  opacity: 0;
  animation: ${variant.animation} 0.5s ease-out;
`;
  const title = document.createElement("h3");
  title.textContent = "QUOTES";
  title.style = `
    margin: 0; font-size: 18px;
    letter-spacing: 1px; color:rgb(46, 125, 125);
  `;

  const body = document.createElement("p");
  body.textContent = quote;
  body.style = `
    font-size: 20px;
    line-height: 1.6; 
    margin: 20px 0;
    color: #222;
    font-weight: 500;
`;


  const closeBtn = document.createElement("button");
  closeBtn.textContent = '✖';
  closeBtn.style = `
    position: absolute; top: 10px; right: 12px;  
    background: none; border: none;
    font-size: 16px; cursor: pointer; color: #555;
  `;
  closeBtn.onclick = () => quoteBox.remove();
  const pinBtn = document.createElement("button");
  pinBtn.textContent = '📌 Pin on Screen';
  pinBtn.style = `
    margin-top: 10px;
    background: #2e7d32;
    color: #fff;
    border: 5px solid rgb(12, 243, 235);;
    border-radius: 8px;
    padding: 6px 12px;
    cursor: pointer;
    font-weight: bold;
  `;
  pinBtn.onclick = () => pinQuote(quote);

  quoteBox.appendChild(closeBtn);
  quoteBox.appendChild(title);
  quoteBox.appendChild(body);
  quoteBox.appendChild(pinBtn); // 🔥 New Pin button
  document.body.appendChild(quoteBox);
  // Trigger animation (fade-in + scale-up)
  requestAnimationFrame(() => {
    quoteBox.style.opacity = '1';
    quoteBox.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  // Remove after 7 seconds
  setTimeout(() => {
    quoteBox.style.opacity = '0';
    quoteBox.style.transform = 'translate(-50%, -50%) scale(0.95)';
    setTimeout(() => quoteBox.remove(), 400);
  }, 7000);
}

function closeOverlay() {
  const overlay = document.getElementById("mindful-overlay");
  if (overlay) overlay.remove();
  overlayActive = false;
  startTime = Date.now();
  document.body.style.overflow = '';
}
async function saveFocusLink() {
  const link = prompt("🔗 Paste your meaningful link (e.g. reading list, journal):");
  if (link && link.startsWith("http")) {
    const db = await openDB();
    const tx = db.transaction("focusLink", "readwrite");
    const store = tx.objectStore("focusLink");
    await store.put({ id: 1, url: link }); // ✅ async/await ensures save finishes
    await tx.done;
    alert("✅ Link saved! We'll redirect you next time you need it.");
  } else {
    alert("⚠️ Please enter a valid link starting with http or https.");
  }
}

async function redirectToFocusLink() {
  const db = await openDB();
  const tx = db.transaction("focusLink", "readonly");
  const store = tx.objectStore("focusLink");
  const request = store.get(1);

  request.onsuccess = () => {
    const record = request.result;
    if (record?.url) {
      window.location.href = record.url;
    } else {
      alert("❌ No link saved yet. Click 'Set My Link' first.");
    }
  };
}

function showMindfulOverlay() {
  if (document.getElementById('mindful-overlay') || overlayActive) return;
  overlayActive = true;
  playDing();

  const overlay = document.createElement('div');
  overlay.id = 'mindful-overlay';
  overlay.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%) scale(0.96);
    width: 90%; max-width: 460px;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(18px) saturate(180%);
    -webkit-backdrop-filter: blur(18px) saturate(180%);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    box-shadow: 0 8px 30px rgba(0,0,0,0.25);
    padding: 28px 24px;
    z-index: 2147483647;
    font-family: 'Poppins', sans-serif;
    color: #111;
    animation: fadeZoom 0.4s ease-out;
  `;

  overlay.innerHTML = `
    <div style="position: relative;">
      <button id="close-overlay" style="
      position: fixed;
      top: 18px;
      right: 22px;
      background: transparent;
      border: none;
      font-size: 24px;
      font-weight: bold;
      color: #333;
      cursor: pointer;
      z-index: 2147483647;
      transition: transform 0.2s ease, color 0.2s ease;
    ">✖</button>
      <h1 style="text-align: center; font-weight: 600; font-size: 20px; margin-bottom: 16px;">
        🎯 You've seen a lot.<br/>How are you actually feeling?
      </h1>

      <input id="feeling-input" autocomplete="off" placeholder="e.g. tired, anxious, curious..." style="
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      font-size: 15px;
      border-radius: 10px;
      border: 2px solid #ccc;
      background: #fafafa;
      color: #000;
      margin-bottom: 16px;
      " />


      <div style="display: flex; justify-content: center; margin-bottom: 16px;">
      <button id="continue-btn" style="
          padding: 12px 20px;
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(to right, #00c6ff, #0072ff);
          color: white;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        ">🚀 Show Me A Boost</button>
      </div>



      <div style="margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: space-around; gap: 10px;">
          <button id="tips-btn" style="
              flex: 1; min-width: 110px;
              padding: 10px;
              background: #d2f8d2;
              border: none;
              border-radius: 10px;
              font-weight: 500;
              cursor: pointer;
        ">🧠Life Tips</button>  

        <button id="nudge-btn" style="
          flex: 1; min-width: 110px;
          padding: 10px;
          background: #f3d0ff;
          border: none;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
        ">✍️Save Nudge</button>

        <button id="history-btn" style="
          flex: 1; min-width: 110px;
          padding: 10px;
          background: #d6e4ff;
          border: none;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
        ">📅My Time Capsule</button>

        <button id="redirect-btn" style="
            flex: 1; min-width: 110px;
            padding: 10px;
            background: #ffe0b2;
            border: none;
            border-radius: 10px;
            font-weight: 500;
            cursor: pointer;
        ">🧘‍♂️Mindful Space</button>

        <button id="set-link-btn" style="
          flex: 1; min-width: 110px;
          padding: 10px;
          background: #f8bbd0;
          border: none;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
      ">🔗Set My Focus Link</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Animation styles
  const style = document.createElement("style");
style.textContent = `
  @keyframes fadeZoom {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }

  #close-overlay:hover {
    transform: scale(1.3);
    color: #ff1744;
  }
`;
document.head.appendChild(style);


  // Event Listeners
  requestAnimationFrame(() => {
    document.getElementById("close-overlay")?.addEventListener("click", closeOverlay);
    document.getElementById("continue-btn")?.addEventListener("click", () => {
      const rawInput = document.getElementById("feeling-input")?.value || "";
      if (!rawInput.trim()) {
        alert("⚠️ Please enter how you're feeling.");
        return;
      }
      const feeling = rawInput.toLowerCase().trim().replace(/[^\w\s]/gi, "");
      const bannedWords = ["kill", "suicide", "die", "end it", "harm", "blood", "sexy", "hot"];
      for (let word of bannedWords) {
        if (feeling.includes(word)) {
          alert("⚠️ If you're feeling overwhelmed, please take a break or talk to someone who cares. ❤️");
          return;
        }
      }

      let category = "reset";
      if (feeling.includes("tired") || feeling.includes("burnt")) category = "calm";
      else if (feeling.includes("stressed") || feeling.includes("anxious")) category = "calm";
      else if (feeling.includes("bored") || feeling.includes("scrolling")) category = "disrupt";
      else if (feeling.includes("curious") || feeling.includes("motivated")) category = "knowledge";
      else if (feeling.includes("sad") || feeling.includes("low")) category = "inspire";
      else if (feeling.includes("funny") || feeling.includes("joke")) category = "funny";
      else if (feeling.includes("code") || feeling.includes("stuck")) category = "code";
      else if (feeling.includes("chill") || feeling.includes("enjoying")) category = "funny";
      else if (feeling.includes("hope") || feeling.includes("inspire")) category = "inspire";

      const quote = getRandomItem(categorizedQuotes[category]);
      cachedQuote = quote;

      setTimeout(() => {
        injectSurprise(quote);
        closeOverlay();
      }, 200);
    });

    document.getElementById("redirect-btn")?.addEventListener("click", redirectToFocusLink);
    document.getElementById("set-link-btn")?.addEventListener("click", saveFocusLink);
    document.getElementById("nudge-btn")?.addEventListener("click", () => {
      const note = prompt("✍️ Write a message to your future self:");
      if (note) {
        storeNudge(note);
        alert("✅ Nudge saved!");
      }
    });

    document.getElementById("history-btn").addEventListener("click", showNudgesModal);
    let tipsShown = 0; // Track count outside the event listener

document.getElementById("tips-btn")?.addEventListener("click", () => {
  if (tipsShown < 2) {
    const tip = getRandomItem(lifeTips);
    showTipBox(tip);
    tipsShown++;
  } else {
    const warning = document.createElement("div");
    warning.textContent = "⚠️ Two tips are enough for now. Try one of them before asking for more!";
    warning.style = `
      margin-top: 16px;
      background: #fff3cd;
      color: #856404;
      border-left: 4px solid #ffeeba;
      padding: 10px;
      border-radius: 10px;
      font-size: 14px;
    `;
    document.getElementById("mindful-overlay")?.appendChild(warning);

    setTimeout(() => warning.remove(), 4000); // auto-remove after 4 seconds
  }
});

  });
}
let lastScrollTime = Date.now();
let fastScrolls = 0;

function startOverlayInterval() {
  setInterval(() => {
    const elapsed = (Date.now() - startTime) / 60000;
    console.log("⏳ Elapsed mins:", elapsed.toFixed(2), "/", MINUTES_LIMIT);

    if (!overlayActive && elapsed >= MINUTES_LIMIT) {
      showMindfulOverlay();
    }
  }, 5000); // check every 5s
}

chrome.storage && chrome.storage.local && chrome.storage.local.get('feedNotifyMinutes', (data) => {
  if (data && data.feedNotifyMinutes && !isNaN(data.feedNotifyMinutes)) {
    MINUTES_LIMIT = data.feedNotifyMinutes;
  }
  startOverlayInterval();
});

// Listen for changes to feedNotifyMinutes and update MINUTES_LIMIT live
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.feedNotifyMinutes) {
      const newValue = changes.feedNotifyMinutes.newValue;
      if (typeof newValue === 'number' && !isNaN(newValue)) {
        MINUTES_LIMIT = newValue;
      }
    }
  });
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "resetTimer") {
    startTime = Date.now();
    overlayActive = false;
  }
});




