// ============================================================
// Lyra — Lecteur : file d'attente, contrôles, égaliseur WebAudio,
// barres de progression synchronisées (mini + plein écran).
// ============================================================
import { applyCoverTheme, resetTheme } from "./colors.js";
import { icon } from "./icons.js";
import { fmtTime } from "./util.js";

const { invoke, convertFileSrc } = window.__TAURI__.core;

export const player = {
  audio: null,
  queue: [],
  qi: -1,
  shuffle: false,
  repeat: "off", // off | all | one
};

/* ---------- Égaliseur (WebAudio) ---------- */
const EQ_BANDS = [
  { f: 60, label: "Bass" },
  { f: 250, label: "Low" },
  { f: 1000, label: "Mid" },
  { f: 4000, label: "High" },
  { f: 12000, label: "Air" },
];
let ac = null, srcNode = null, filters = [];
let eqOn = localStorage.getItem("eqOn") === "1";
let eqGains = JSON.parse(localStorage.getItem("eqGains") || "null") || EQ_BANDS.map(() => 0);

function ensureEq() {
  if (ac || !player.audio) return;
  try {
    ac = new AudioContext();
    srcNode = ac.createMediaElementSource(player.audio);
    filters = EQ_BANDS.map(({ f }, i) => {
      const biq = ac.createBiquadFilter();
      biq.type = "peaking";
      biq.frequency.value = f;
      biq.Q.value = 1.1;
      biq.gain.value = eqOn ? eqGains[i] : 0;
      return biq;
    });
    let node = srcNode;
    for (const biq of filters) { node.connect(biq); node = biq; }
    node.connect(ac.destination);
  } catch {
    ac = null; // égaliseur indisponible : lecture directe
  }
}

function updateEqGains() {
  filters.forEach((biq, i) => { biq.gain.value = eqOn ? eqGains[i] : 0; });
}

/* ---------- Initialisation UI ---------- */
const $ = (id) => document.getElementById(id);

export function initPlayer() {
  const audio = new Audio();
  player.audio = audio;
  audio.volume = (parseInt(localStorage.getItem("volume") ?? "80", 10) || 80) / 100;
  $("volume").value = audio.volume * 100;
  syncSliderFill($("volume"));

  const t = () => player.queue[player.qi];

  async function load(i) {
    if (i < 0 || i >= player.queue.length) return;
    player.qi = i;
    const track = t();
    audio.src = convertFileSrc(track.path);
    ensureEq();
    audio.play().catch(() => {});
    invoke("record_play", { id: track.id });

    // UI mini-barre
    $("pb-title").textContent = track.title;
    $("pb-artist").textContent = track.artist || "";
    $("np-title").textContent = track.title;
    $("np-artist").textContent = track.artist || "";
    const cover = track.cover ? convertFileSrc(track.cover) : "";
    $("pb-cover").src = cover || "";
    $("np-cover").src = cover || "";
    $("pb-cover").style.visibility = cover ? "visible" : "hidden";
    updateLikeButtons();

    // Thème adaptatif à la pochette
    applyCoverTheme(cover, document.documentElement.dataset.theme);

    renderQueue();
    document.dispatchEvent(new CustomEvent("lyra:trackchange"));
  }

  /* --- Contrôles --- */
  const togglePlay = () => {
    if (!t()) return;
    if (audio.paused) { ensureEq(); audio.play().catch(() => {}); }
    else audio.pause();
  };

  function next() {
    if (player.shuffle) {
      if (player.queue.length > 1) {
        let n;
        do { n = Math.floor(Math.random() * player.queue.length); } while (n === player.qi);
        load(n);
      }
      return;
    }
    if (player.qi + 1 < player.queue.length) load(player.qi + 1);
    else if (player.repeat === "all") load(0);
    else { audio.pause(); audio.currentTime = 0; }
  }

  function prev() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (player.qi > 0) load(player.qi - 1);
    else audio.currentTime = 0;
  }

  function updatePlayIcons() {
    const markup = icon(audio.paused ? "play" : "pause");
    $("play-icon").innerHTML = markup;
    $("np-play-icon").innerHTML = markup;
  }

  function updateVolumeIcon() {
    const name = audio.volume === 0 ? "volume-mute" : audio.volume < 0.5 ? "volume-low" : "volume";
    $("btn-vol").innerHTML = icon(name);
  }

  function updateLikeButtons() {
    const track = t();
    const liked = track?.fav ?? false;
    $("pb-like").innerHTML = icon(liked ? "heart-filled" : "heart");
    $("pb-like").classList.toggle("on", liked);
    $("np-like").innerHTML = icon(liked ? "heart-filled" : "heart");
    $("np-like").classList.toggle("on", liked);
  }

  async function toggleFav() {
    const track = t();
    if (!track) return;
    const fav = await invoke("toggle_fav", { id: track.id });
    track.fav = fav;
    updateLikeButtons();
    document.dispatchEvent(new CustomEvent("lyra:trackchange"));
  }

  /* --- événements audio --- */
  audio.addEventListener("play", () => { ac?.resume().catch(() => {}); updatePlayIcons(); });
  audio.addEventListener("pause", updatePlayIcons);
  audio.addEventListener("ended", () => {
    if (player.repeat === "one") { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    next();
  });
  audio.addEventListener("timeupdate", () => {
    const d = audio.duration || 0, c = audio.currentTime || 0;
    const pct = d ? (c / d) * 100 : 0;
    $("pb-cur").textContent = fmtTime(c);
    $("np-cur").textContent = fmtTime(c);
    if (d) {
      $("pb-dur").textContent = fmtTime(d);
      $("np-dur").textContent = fmtTime(d);
    }
    for (const [sl, wrap] of [[$("seek"), $("seek-wrap")], [$("np-seek"), $("np-seek-wrap")]]) {
      if (document.activeElement !== sl) {
        sl.value = pct;
        sl.style.setProperty("--fill", pct + "%");
      }
      wrap.style.setProperty("--fill", pct + "%");
    }
  });
  audio.addEventListener("loadedmetadata", () => {
    const d = audio.duration || 0;
    $("pb-dur").textContent = fmtTime(d);
    $("np-dur").textContent = fmtTime(d);
  });

  /* --- wiring boutons --- */
  $("btn-play").onclick = togglePlay;
  $("np-play").onclick = togglePlay;
  $("btn-next").onclick = next;
  $("np-next").onclick = next;
  $("btn-prev").onclick = prev;
  $("np-prev").onclick = prev;
  $("pb-like").onclick = toggleFav;
  $("np-like").onclick = toggleFav;

  $("btn-shuffle").onclick = (e) => {
    player.shuffle = !player.shuffle;
    e.currentTarget.classList.toggle("on", player.shuffle);
  };
  $("btn-repeat").onclick = (e) => {
    player.repeat = player.repeat === "off" ? "all" : player.repeat === "all" ? "one" : "off";
    e.currentTarget.classList.toggle("on", player.repeat !== "off");
    e.currentTarget.innerHTML = icon(player.repeat === "one" ? "repeat-one" : "repeat");
  };

  $("seek").addEventListener("input", () => {
    const d = audio.duration || 0;
    audio.currentTime = ($("seek").value / 100) * d;
    $("seek").style.setProperty("--fill", $("seek").value + "%");
  });
  $("np-seek").addEventListener("input", () => {
    const d = audio.duration || 0;
    audio.currentTime = ($("np-seek").value / 100) * d;
    $("np-seek").style.setProperty("--fill", $("np-seek").value + "%");
  });

  $("volume").addEventListener("input", (e) => {
    audio.volume = e.target.value / 100;
    localStorage.setItem("volume", e.target.value);
    syncSliderFill(e.target);
    updateVolumeIcon();
  });
  $("btn-vol").onclick = () => {
    audio.volume = audio.volume === 0 ? 0.8 : 0;
    $("volume").value = audio.volume * 100;
    localStorage.setItem("volume", String(Math.round(audio.volume * 100)));
    syncSliderFill($("volume"));
    updateVolumeIcon();
  };

  /* --- Égaliseur UI --- */
  const eqSliders = $("eq-sliders");
  EQ_BANDS.forEach(({ f, label }, i) => {
    const row = document.createElement("div");
    row.className = "eq-row";
    row.innerHTML = `<span>${label} <span style="opacity:.5">${(f / 1000).toFixed(f < 1000 ? 1 : 0)}k</span></span>
      <input type="range" min="-12" max="12" step="1" value="${eqGains[i]}" data-i="${i}" />
      <span class="val">${eqGains[i] > 0 ? "+" : ""}${eqGains[i]} dB</span>`;
    eqSliders.appendChild(row);
    const sl = row.querySelector("input");
    sl.addEventListener("input", () => {
      eqGains[i] = parseInt(sl.value, 10);
      row.querySelector(".val").textContent = `${eqGains[i] > 0 ? "+" : ""}${eqGains[i]} dB`;
      localStorage.setItem("eqGains", JSON.stringify(eqGains));
      updateEqGains();
      syncSliderFill(sl);
    });
    syncSliderFill(sl);
  });
  $("eq-on").checked = eqOn;
  $("eq-on").onchange = (e) => {
    eqOn = e.target.checked;
    localStorage.setItem("eqOn", eqOn ? "1" : "0");
    updateEqGains();
  };
  $("eq-reset").onclick = () => {
    eqGains = EQ_BANDS.map(() => 0);
    localStorage.setItem("eqGains", JSON.stringify(eqGains));
    document.querySelectorAll("#eq-sliders input").forEach((sl) => {
      sl.value = 0; syncSliderFill(sl);
      sl.parentElement.querySelector(".val").textContent = "0 dB";
    });
    updateEqGains();
  };
  $("btn-eq").onclick = (e) => {
    $("eq-panel").classList.toggle("hidden");
    e.stopPropagation();
  };
  document.addEventListener("click", (e) => {
    if (!$("eq-panel").contains(e.target)) $("eq-panel").classList.add("hidden");
  });

  /* --- plein écran Lecture en cours --- */
  $("btn-expand").onclick = () => $("nowplaying").classList.add("open");
  $("np-close").onclick = () => $("nowplaying").classList.remove("open");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("nowplaying").classList.remove("open");
  });
  $("np-queue-list").addEventListener("click", (e) => {
    const row = e.target.closest(".q-row");
    if (row) load(parseInt(row.dataset.i, 10));
  });

  /* --- glisser-déposer de fichiers dans la fenêtre --- */
  try {
    const webview = window.__TAURI__.webview.getCurrentWebview();
    webview.onDragDropEvent(async (ev) => {
      if (ev.payload.type === "drop" && ev.payload.paths?.length) {
        const res = await invoke("add_paths", { paths: ev.payload.paths });
        document.dispatchEvent(new CustomEvent("lyra:librarychange"));
        toast(`${res.added} morceau(x) ajouté(s)`);
      }
    });
  } catch { /* glisser-déposer indisponible */ }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  return { load, togglePlay, next, prev, toast };
}

/* ---------- File d'attente (rendu) ---------- */
export function renderQueue() {
  const list = $("np-queue-list");
  list.innerHTML = "";
  if (!player.queue.length) {
    list.innerHTML = `<div class="empty">File d'attente vide</div>`;
    return;
  }
  player.queue.forEach((track, i) => {
    const row = document.createElement("div");
    row.className = "q-row" + (i === player.qi ? " current" : "");
    row.dataset.i = i;
    row.innerHTML = `
      <span class="qi">${i + 1}</span>
      <img src="${track.cover ? window.__TAURI__.core.convertFileSrc(track.cover) : ""}" alt="" />
      <span class="qt">${escapeHtml(track.title)}</span>
      <span class="qs">${fmtTime(track.duration)}</span>`;
    list.appendChild(row);
  });
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function syncSliderFill(sl) {
  const pct = ((sl.value - sl.min) / (sl.max - sl.min)) * 100;
  sl.style.setProperty("--fill", pct + "%");
}

export { resetTheme };
