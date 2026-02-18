let allVocab = [];
let sessionList = [];
let currentIndex = 0;
let quizMode = false;
let stats = { correct: 0, wrong: 0 };

// CSV ayarları
const CSV_FILE = "sicher.csv";

// CSV kolon isimleri (Excel'den gelen başlıklara göre)
const COL = {
  lesson: "Lektion",
  de: "Deutsch",
  sentence: "Beispiel Satz",
};

// Dil seçimi dropdown değerleri = CSV kolon isimleri
const LANG_OPTIONS = [
  "Turkisch",
  "Englisch",
  "Ukrainisch (Українська)",
  "Arabisch (العربية)",
  "Farsi (فارسی)",
  "Kurdisch (Kurmancî)",
];

function setStatus(text, isError = false) {
  const el = document.getElementById("load-hint");
  if (!el) return;
  el.textContent = text || "";
  el.style.opacity = text ? "1" : "0";
  el.style.color = isError ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.9)";
}

// 1) CSV'yi yükle
async function loadDatabase() {
  try {
    setStatus("CSV wird geladen…");

    const res = await fetch(CSV_FILE, { cache: "no-store" });
    if (!res.ok) throw new Error(`CSV konnte nicht geladen werden: ${res.status} ${res.statusText}`);

    const csvText = await res.text();

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parsed.errors && parsed.errors.length) {
      console.warn("PapaParse errors:", parsed.errors);
      // yine de devam edebilir
    }

    // Satırları normalize et
    allVocab = (parsed.data || [])
      .map((row) => normalizeRow(row))
      .filter((row) => row && row[COL.de] && row[COL.sentence]);

    if (!allVocab.length) {
      throw new Error("CSV okundu ama satır bulunamadı. Başlıklar ve dosya formatını kontrol et.");
    }

    // Unit menüsünü kur
    buildUnitMenu();

    document.getElementById("total-words-display").innerText = `${allVocab.length} Wörter bereit`;
    setStatus("");
  } catch (err) {
    console.error("CSV Yükleme Hatası:", err);
    document.getElementById("total-words-display").innerText = "CSV Fehler!";
    setStatus(
      "CSV yüklenemedi. Kontrol: (1) dosya adı sicher.csv (2) aynı klasörde (3) site localhost/hosting üzerinden açılıyor.",
      true
    );
  }
}

function normalizeRow(row) {
  // Bazı Excel export'larında başlıklarda/alanlarda ekstra boşluk olabiliyor:
  const clean = {};
  for (const k in row) {
    const key = (k || "").trim();
    clean[key] = typeof row[k] === "string" ? row[k].replace(/\u00A0/g, " ").trim() : row[k];
  }

  // Lektion'u sayıya çekelim (yoksa null)
  const lessonRaw = clean[COL.lesson];
  const lessonNum = parseInt(String(lessonRaw || "").trim(), 10);
  clean[COL.lesson] = Number.isFinite(lessonNum) ? lessonNum : null;

  // Dil kolonlarını da trimle
  LANG_OPTIONS.forEach((c) => {
    if (typeof clean[c] === "string") clean[c] = clean[c].trim();
  });

  return clean;
}

function buildUnitMenu() {
  const select = document.getElementById("unit-select");
  // önce var olan lektionları bul
  const lessons = Array.from(
    new Set(allVocab.map((v) => v[COL.lesson]).filter((x) => Number.isFinite(x)))
  ).sort((a, b) => a - b);

  // optionları resetle (ilk option kalsın)
  select.innerHTML = `<option value="all">Alle Lektionen</option>`;
  lessons.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = String(l);
    opt.innerText = `Lektion ${l}`;
    select.appendChild(opt);
  });
}

// 2) Navigasyon
function openTrainer() {
  // veri gelmediyse kullanıcıya mesaj ver
  if (!allVocab.length) {
    alert("Daten sind noch nicht geladen. Bitte kurz warten oder CSV prüfen (sicher.csv).");
    return;
  }

  document.getElementById("main-menu").classList.add("hidden");
  document.getElementById("trainer-area").classList.remove("hidden");
  initSession();
}

function showMenu() {
  document.getElementById("trainer-area").classList.add("hidden");
  document.getElementById("main-menu").classList.remove("hidden");
}

// 3) Oturum
function initSession() {
  if (!allVocab.length) return;

  const unit = document.getElementById("unit-select").value;
  sessionList =
    unit === "all"
      ? [...allVocab]
      : allVocab.filter((v) => String(v[COL.lesson]) === String(unit));

  // karıştır
  sessionList.sort(() => Math.random() - 0.5);

  currentIndex = 0;
  stats = { correct: 0, wrong: 0 };
  updateUI();
}

function updateUI() {
  if (!sessionList.length) return;

  if (currentIndex >= sessionList.length) {
    alert("Glückwunsch! Lektion beendet.");
    showMenu();
    return;
  }

  const item = sessionList[currentIndex];
  const langKey = document.getElementById("lang-select").value;

  const de = item[COL.de] || "(kein Wort)";
  const tr = item[langKey] || "(keine Übersetzung)";
  const sentence = item[COL.sentence] || "";

  document.getElementById("de-word").innerText = de;
  document.getElementById("target-word").innerText = tr;
  document.getElementById("b2-sentence").innerText = sentence;

  document.getElementById("flashcard-container").classList.remove("flipped");

  if (quizMode) setupQuiz(item, langKey);

  document.getElementById("correct-count").innerText = stats.correct;
  document.getElementById("wrong-count").innerText = stats.wrong;
  document.getElementById("progress-percent").innerText =
    Math.round((currentIndex / sessionList.length) * 100) + "%";
}

function setupQuiz(correctItem, langKey) {
  document.getElementById("quiz-question").innerText = correctItem[COL.de] || "";
  document.getElementById("quiz-meta").innerText = `#${currentIndex + 1} / ${sessionList.length}`;

  const optionsBox = document.getElementById("quiz-options");
  optionsBox.innerHTML = "";

  const correct = correctItem[langKey];
  const options = [correct].filter(Boolean);

  // 4 şık topla
  let guard = 0;
  while (options.length < 4 && guard < 500) {
    guard++;
    const rand = allVocab[Math.floor(Math.random() * allVocab.length)][langKey];
    if (rand && !options.includes(rand)) options.push(rand);
  }

  // yeterli seçenek yoksa
  while (options.length < 4) options.push("(keine Option)");

  // karıştır
  options.sort(() => Math.random() - 0.5);

  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "opt-btn";
    btn.innerText = opt;

    btn.onclick = () => {
      // seçenekleri kilitle
      const buttons = optionsBox.querySelectorAll("button");
      buttons.forEach((b) => (b.disabled = true));

      if (opt === correct) {
        btn.classList.add("correct-ans");
        stats.correct++;
        setTimeout(nextWord, 450);
      } else {
        btn.classList.add("wrong-ans");
        stats.wrong++;

        // doğruyu da göster
        buttons.forEach((b) => {
          if (b.innerText === correct) b.classList.add("correct-ans");
        });
        setTimeout(nextWord, 650);
      }

      document.getElementById("correct-count").innerText = stats.correct;
      document.getElementById("wrong-count").innerText = stats.wrong;
    };

    optionsBox.appendChild(btn);
  });
}

function nextWord() {
  currentIndex++;
  updateUI();
}

function flipCard() {
  document.getElementById("flashcard-container").classList.toggle("flipped");
}

function toggleMode() {
  quizMode = !quizMode;

  document.getElementById("flashcard-container").classList.toggle("hidden", quizMode);
  document.getElementById("quiz-container").classList.toggle("hidden", !quizMode);

  document.getElementById("toggle-mode-btn").innerText = quizMode ? "🗂 Flashcards" : "🎯 Quiz Modus";
  updateUI();
}

// Başlat
loadDatabase();