// ============================================================
// Lyra — Navigation, vues, bibliothèque, paramètres
// ============================================================
import { player, initPlayer, renderQueue, escapeHtml, syncSliderFill } from "./player.js";
import { resetTheme } from "./colors.js";
import { fmtTime, debounce } from "./util.js";

const { invoke, convertFileSrc } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);

/* ---------- État ---------- */
const state = {
  view: "home",
  detail: null,   // { kind: 'album'|'artist'|'playlist', value, title }
  playlists: [],
  query: "",
  ctrl: null,     // contrôles du lecteur
  currentCover: null,
};

/* ---------- Thème ---------- */
const mq = window.matchMedia("(prefers-color-scheme: dark)");
function getThemeMode() { return localStorage.getItem("themeMode") || "system"; }
function applyTheme() {
  const mode = getThemeMode();
  const dark = mode === "dark" || (mode === "system" && mq.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  invoke("set_theme", { theme: mode === "system" ? null : mode }).catch(() => {});
  if (!state.currentCover) resetTheme(dark ? "dark" : "light");
}
mq.addEventListener("change", () => { if (getThemeMode() === "system") applyTheme(); });

/* ---------- Utilitaires UI ---------- */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

function coverSrc(track) {
  return track?.cover ? convertFileSrc(track.cover) : "";
}

function tilePh(char, cls = "") {
  return `<div class="tile-ph ${cls}">${char}</div>`;
}

/* ---------- Navigation ---------- */
const VIEWS = {
  home: "Accueil", tracks: "Titres", albums: "Albums", artists: "Artistes",
  playlists: "Playlists", favorites: "Favoris", recents: "Récents",
  search: "Recherche", settings: "Paramètres",
};

function nav(view, detail = null) {
  state.view = view;
  state.detail = detail;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("topbar-title").textContent = detail ? detail.title : (VIEWS[view] || "");
  render();
  $("view").scrollTop = 0;
}

document.querySelectorAll(".nav-item[data-view]").forEach((b) => {
  b.onclick = () => nav(b.dataset.view);
});
$("btn-settings").onclick = () => nav("settings");

$("search").addEventListener("input", debounce((e) => {
  const q = e.target.value.trim();
  if (!q) { if (state.view === "search") nav("home"); return; }
  state.query = q;
  nav("search");
}, 260));

/* ---------- Lecture ---------- */
function play(list, start = 0) {
  player.queue = list.slice();
  renderQueue();
  state.ctrl.load(start);
}

document.addEventListener("lyra:trackchange", () => {
  state.currentCover = player.queue[player.qi]?.cover || null;
  if (state.view === "tracks" || state.view === "detail" || state.view === "favorites") render();
});

document.addEventListener("lyra:librarychange", () => {
  refreshPlaylists().then(render);
});

/* ---------- Rendu des listes de titres ---------- */

function trackRows(list, ctxLabel = "Bibliothèque") {
  const frag = [];
  const cur = player.queue[player.qi];
  list.forEach((t, i) => {
    frag.push(`
      <div class="trow ${cur && cur.id === t.id ? "playing" : ""}" data-i="${i}">
        ${t.cover ? `<img src="${coverSrc(t)}" alt="" loading="lazy" />` : tilePh("♪")}
        <div><div class="tr-title">${escapeHtml(t.title)}</div></div>
        <div><div class="tr-sub">${escapeHtml(t.artist || "Artiste inconnu")}</div></div>
        <div class="tr-dur">${fmtTime(t.duration)}</div>
        <button class="tr-like ${t.fav ? "liked" : ""}" data-act="fav" data-id="${t.id}">${t.fav ? "♥" : "♡"}</button>
        <button class="tr-more" data-act="menu" data-id="${t.id}" data-i="${i}">⋯</button>
      </div>`);
  });
  if (!list.length) return `<div class="empty">Aucun titre dans « ${ctxLabel} » pour le moment.</div>`;
  return `<div class="track-list">${frag.join("")}</div>`;
}

function bindTrackList(container, list) {
  container.querySelectorAll(".trow").forEach((row) => {
    row.addEventListener("dblclick", () => play(list, parseInt(row.dataset.i, 10)));
  });
  container.querySelectorAll(".tr-like").forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const fav = await invoke("toggle_fav", { id: parseInt(b.dataset.id, 10) });
      b.textContent = fav ? "♥" : "♡";
      b.classList.toggle("liked", fav);
      const t = list.find((x) => x.id === parseInt(b.dataset.id, 10));
      if (t) t.fav = fav;
    };
  });
  container.querySelectorAll(".tr-more").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      openTrackMenu(e, list, parseInt(b.dataset.i, 10));
    };
  });
  container.querySelectorAll(".trow img, .trow .tile-ph").forEach((el) => {
    el.onclick = () => {
      const row = el.closest(".trow");
      play(list, parseInt(row.dataset.i, 10));
    };
  });
}

/* ---------- Menu contextuel ---------- */
function openTrackMenu(ev, list, i) {
  const track = list[i];
  const menu = $("ctx-menu");
  const items = [
    { label: "▶  Lire", fn: () => play(list, i) },
    { label: "⤵  Ajouter à la file", fn: () => { player.queue.push(track); renderQueue(); toast("Ajouté à la file d'attente"); } },
    { sep: true },
    { label: track.fav ? "♡  Retirer des favoris" : "♥  Ajouter aux favoris", fn: async () => { await invoke("toggle_fav", { id: track.id }); track.fav = !track.fav; render(); } },
    { sep: true },
  ];
  if (state.playlists.length) {
    state.playlists.forEach((p) =>
      items.push({ label: `📝  ${p.name}`, fn: async () => { await invoke("add_to_playlist", { playlistId: p.id, trackId: track.id }); toast(`Ajouté à « ${p.name} »`); } })
    );
  } else {
    items.push({ label: "📝  Nouvelle playlist…", fn: async () => newPlaylistThenAdd(track) });
  }
  items.push({ sep: true });
  items.push({ label: "🔤  Afficher le fichier", fn: () => toast(track.path) });

  menu.innerHTML = "";
  for (const it of items) {
    if (it.sep) { menu.insertAdjacentHTML("beforeend", `<div class="ctx-sep"></div>`); continue; }
    const b = document.createElement("button");
    b.className = "ctx-item";
    b.textContent = it.label;
    b.onclick = () => { it.fn(); menu.classList.add("hidden"); };
    menu.appendChild(b);
  }
  menu.classList.remove("hidden");
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(ev.clientX, innerWidth - r.width - 8) + "px";
  menu.style.top = Math.min(ev.clientY, innerHeight - r.height - 8) + "px";
  const close = (e) => { if (!menu.contains(e.target)) { menu.classList.add("hidden"); document.removeEventListener("click", close); } };
  setTimeout(() => document.addEventListener("click", close), 0);
}

async function newPlaylistThenAdd(track) {
  const name = prompt("Nom de la playlist :");
  if (!name) return;
  try {
    const p = await invoke("create_playlist", { name });
    if (track) await invoke("add_to_playlist", { playlistId: p.id, trackId: track.id });
    await refreshPlaylists();
    toast(`Playlist « ${p.name} » créée`);
    if (state.view === "playlists") render();
  } catch (e) { toast(String(e)); }
}

/* ---------- Vues ---------- */

const renderers = {
  async home() {
    const view = $("view");
    const tracks = await invoke("get_tracks", { filter: "all" });
    if (!tracks.length) {
      view.innerHTML = `<div class="welcome view-anim"><div class="welcome-card">
        <h2>Bienvenue dans Lyra ♪</h2>
        <p>Ajoutez vos dossiers de musique une seule fois : Lyra les scanne à chaque ouverture, ajoute les nouveaux morceaux en direct et adapte ses couleurs à chaque pochette.</p>
        <div class="welcome-actions">
          <button class="btn primary" id="w-music">Utiliser le dossier Musique</button>
          <button class="btn" id="w-folder">Ajouter un dossier…</button>
        </div></div></div>`;
      $("w-music").onclick = async () => {
        try {
          const dir = await window.__TAURI__.path.musicDir();
          await invoke("add_folder", { path: dir });
          await rescan();
        } catch { toast("Impossible de trouver le dossier Musique"); }
      };
      $("w-folder").onclick = addFolderFlow;
      return;
    }
    const favs = await invoke("get_tracks", { filter: "fav" });
    const albums = (await invoke("get_albums")).slice(0, 8);
    const recent = await invoke("get_tracks", { filter: "recent" });
    view.innerHTML = `<div class="view-anim">
      <div class="home-section"><h3>Reprendre</h3><div class="home-grid" id="h-recent"></div></div>
      <div class="home-section"><h3>Favoris</h3><div class="home-grid" id="h-favs"></div></div>
      <div class="home-section"><h3>Albums</h3><div class="grid" id="h-albums"></div></div>
    </div>`;
    const tiles = (target, items, subOf, open) => {
      const el = $(target);
      if (!items.length) { el.innerHTML = `<div class="empty" style="padding:20px">Rien ici pour l'instant.</div>`; return; }
      items.slice(0, 8).forEach((t) => {
        const div = document.createElement("button");
        div.className = "home-tile";
        div.innerHTML = `${t.cover ? `<img src="${coverSrc(t)}" alt="" />` : tilePh("♪")}
          <div style="min-width:0"><div class="t">${escapeHtml(t.title || t.album)}</div><div class="s">${escapeHtml(subOf(t))}</div></div>`;
        div.onclick = () => open(t);
        el.appendChild(div);
      });
    };
    tiles("h-recent", recent, (t) => t.artist || "", (t) => play([t], 0));
    tiles("h-favs", favs, (t) => t.artist || "", (t) => play([t], 0));
    const alb = $("h-albums");
    albums.forEach((a) => {
      const c = document.createElement("button");
      c.className = "card";
      c.innerHTML = `${a.cover ? `<img src="${convertFileSrc(a.cover)}" alt="" />` : tilePh("💿", "big")}
        <div class="c-title">${escapeHtml(a.album)}</div><div class="c-sub">${escapeHtml(a.album_artist || "")}</div>`;
      c.onclick = () => nav("detail", { kind: "album", value: a.album, title: a.album });
      alb.appendChild(c);
    });
  },

  async tracks() {
    const list = await invoke("get_tracks", { filter: "all" });
    $("view").innerHTML = `<div class="view-anim">
      <div class="list-head"><span></span><span>Titre</span><span>Artiste</span><span style="text-align:right">Durée</span><span></span><span></span></div>
      ${trackRows(list, "Bibliothèque")}</div>`;
    bindTrackList($("view"), list);
  },

  async favorites() {
    const list = await invoke("get_tracks", { filter: "fav" });
    $("view").innerHTML = `<div class="view-anim">${trackRows(list, "Favoris")}</div>`;
    bindTrackList($("view"), list);
  },

  async recents() {
    const list = await invoke("get_tracks", { filter: "recent" });
    $("view").innerHTML = `<div class="view-anim">${trackRows(list, "Récents")}</div>`;
    bindTrackList($("view"), list);
  },

  async search() {
    const list = await invoke("get_tracks", { filter: "search", search: state.query });
    $("view").innerHTML = `<div class="view-anim"><p style="color:var(--text-2);font-size:13px;margin:8px 0 4px">${list.length} résultat(s) pour « ${escapeHtml(state.query)} »</p>${trackRows(list, "Recherche")}</div>`;
    bindTrackList($("view"), list);
  },

  async albums() {
    const albums = await invoke("get_albums");
    if (!albums.length) { $("view").innerHTML = `<div class="empty view-anim">Aucun album indexé.</div>`; return; }
    const grid = document.createElement("div");
    grid.className = "grid view-anim";
    albums.forEach((a) => {
      const c = document.createElement("button");
      c.className = "card";
      c.innerHTML = `${a.cover ? `<img src="${convertFileSrc(a.cover)}" alt="" loading="lazy" />` : tilePh("💿", "big")}
        <div class="c-title">${escapeHtml(a.album)}</div>
        <div class="c-sub">${escapeHtml(a.album_artist || "Artiste inconnu")} · ${a.count} titres · ${fmtTime(a.total_duration)}</div>`;
      c.onclick = () => nav("detail", { kind: "album", value: a.album, title: a.album });
      grid.appendChild(c);
    });
    $("view").innerHTML = "";
    $("view").appendChild(grid);
  },

  async artists() {
    const artists = await invoke("get_artists");
    if (!artists.length) { $("view").innerHTML = `<div class="empty view-anim">Aucun artiste indexé.</div>`; return; }
    const grid = document.createElement("div");
    grid.className = "grid view-anim";
    artists.forEach((a) => {
      const c = document.createElement("button");
      c.className = "card";
      c.innerHTML = `${a.cover ? `<img src="${convertFileSrc(a.cover)}" alt="" loading="lazy" />` : tilePh("🎤", "big")}
        <div class="c-title">${escapeHtml(a.artist)}</div>
        <div class="c-sub">${a.count} titres · ${fmtTime(a.total_duration)}</div>`;
      c.onclick = () => nav("detail", { kind: "artist", value: a.artist, title: a.artist });
      grid.appendChild(c);
    });
    $("view").innerHTML = "";
    $("view").appendChild(grid);
  },

  async detail() {
    const d = state.detail;
    let list;
    if (d.kind === "album") list = await invoke("get_tracks", { filter: "album", value: d.value });
    else if (d.kind === "artist") list = await invoke("get_tracks", { filter: "artist", value: d.value });
    else list = await invoke("get_playlist_tracks", { playlistId: d.value });
    const cover = list.find((t) => t.cover)?.cover;
    $("view").innerHTML = `<div class="view-anim">
      <div style="display:flex;align-items:center;gap:22px;margin:14px 0 18px">
        ${cover ? `<img src="${convertFileSrc(cover)}" style="width:130px;height:130px;border-radius:12px;object-fit:cover;box-shadow:var(--shadow-sm)" />` : tilePh(d.kind === "playlist" ? "📝" : "💿", "big")}
        <div>
          <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px">${d.kind === "album" ? "Album" : d.kind === "artist" ? "Artiste" : "Playlist"}</div>
          <div style="font-size:28px;font-weight:700;margin:4px 0 6px">${escapeHtml(d.title)}</div>
          <div style="font-size:13px;color:var(--text-2)">${list.length} titres · ${fmtTime(list.reduce((s, t) => s + t.duration, 0))}</div>
          <div style="display:flex;gap:10px;margin-top:12px">
            <button class="btn primary" id="d-play">▶ Lire</button>
            <button class="btn" id="d-queue">⤵ Ajouter à la file</button>
            ${d.kind === "playlist" ? `<button class="btn danger" id="d-del">Supprimer</button>` : ""}
          </div>
        </div>
      </div>
      ${trackRows(list, d.title)}</div>`;
    $("d-play").onclick = () => play(list, 0);
    $("d-queue").onclick = () => { player.queue.push(...list); renderQueue(); toast("Ajouté à la file d'attente"); };
    if (d.kind === "playlist") $("d-del").onclick = async () => {
      await invoke("delete_playlist", { id: d.value });
      await refreshPlaylists();
      nav("playlists");
      toast("Playlist supprimée");
    };
    bindTrackList($("view"), list);
  },

  async playlists() {
    const view = $("view");
    const ps = state.playlists;
    view.innerHTML = `<div class="view-anim">
      <button class="btn primary" id="pl-new" style="margin:10px 0 16px">＋ Nouvelle playlist</button>
      ${ps.length ? `<div class="grid">${ps.map((p) => `
        <button class="card" data-pid="${p.id}">
          ${tilePh("📝", "big")}
          <div class="c-title">${escapeHtml(p.name)}</div>
        </button>`).join("")}</div>` : `<div class="empty">Créez votre première playlist.</div>`}
    </div>`;
    $("pl-new").onclick = () => newPlaylistThenAdd(null);
    view.querySelectorAll(".card").forEach((c) => {
      c.onclick = () => {
        const p = state.playlists.find((x) => x.id === parseInt(c.dataset.pid, 10));
        nav("detail", { kind: "playlist", value: p.id, title: p.name });
      };
    });
  },

  async settings() {
    renderSettings();
  },
};

/* ---------- Paramètres ---------- */

async function renderSettings() {
  if (state.view !== "settings") return;
  const folders = await invoke("list_folders");
  const ignored = await invoke("get_ignored");
  const minDur = parseInt((await invoke("get_setting", { key: "min_duration_sec" })) ?? "60", 10);
  const minSize = parseInt((await invoke("get_setting", { key: "min_size_bytes" })) ?? "102400", 10);
  const dataDir = await invoke("app_data_dir");
  const mode = getThemeMode();

  $("view").innerHTML = `<div class="settings view-anim">
    <div class="set-card">
      <h3>Apparence</h3><div class="desc">Le thème adaptatif colore l'interface avec la pochette en cours.</div>
      <div class="set-row"><span>Thème</span>
        <div class="seg" id="theme-seg">
          <button data-m="system" class="${mode === "system" ? "on" : ""}">Système</button>
          <button data-m="light" class="${mode === "light" ? "on" : ""}">Clair</button>
          <button data-m="dark" class="${mode === "dark" ? "on" : ""}">Sombre</button>
        </div></div>
    </div>

    <div class="set-card">
      <h3>Dossiers surveillés</h3>
      <div class="desc">Scannés automatiquement à chaque ouverture et surveillés pendant que Lyra tourne.</div>
      <div id="folders">${folders.length ? folders.map((f) => `
        <div class="folder-row"><span class="fp" title="${escapeHtml(f)}">${escapeHtml(f)}</span>
        <button class="icon-btn small" data-rm="${escapeHtml(f)}">🗑</button></div>`).join("") : `<div class="empty" style="padding:14px">Aucun dossier.</div>`}</div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn primary" id="s-add">Ajouter un dossier…</button>
        <button class="btn" id="s-rescan">↻ Rescanner maintenant</button>
      </div>
    </div>

    <div class="set-card">
      <h3>Filtres de scan</h3><div class="desc">Les fichiers en dessous de ces seuils sont listés dans « Fichiers ignorés ».</div>
      <div class="set-row"><label>Durée minimale (s)</label><input type="number" id="f-dur" min="0" max="600" value="${minDur}" /></div>
      <div class="set-row"><label>Taille minimale (Ko)</label><input type="number" id="f-size" min="0" value="${Math.round(minSize / 1024)}" /></div>
    </div>

    <div class="set-card">
      <h3>Fichiers ignorés (${ignored.length})</h3><div class="desc">Un morceau court légitime peut être forcé ici.</div>
      <div id="ignored">${ignored.slice(0, 30).map((g) => `
        <div class="folder-row"><span class="fp" title="${escapeHtml(g.path)}">${escapeHtml(g.path.split(/[\\\\/]/).pop())}</span>
        <span class="ig-reason">${escapeHtml(g.reason)}</span>
        <button class="btn subtle" data-add="${escapeHtml(g.path)}">Ajouter</button></div>`).join("") || `<div class="empty" style="padding:14px">Aucun fichier ignoré.</div>`}</div>
    </div>

    <div class="set-card">
      <h3>À propos</h3>
      <div class="desc">Lyra 1.0.0 — Lecteur Fluent pour Windows 11.<br/>Données : ${escapeHtml(dataDir)}<br/>
      À venir : contrôles médias système, paroles synchronisées, crossfade, effet Mica.</div>
    </div>
  </div>`;

  $("theme-seg").querySelectorAll("button").forEach((b) => {
    b.onclick = () => { localStorage.setItem("themeMode", b.dataset.m); applyTheme(); renderSettings(); };
  });
  $("view").querySelectorAll("button[data-rm]").forEach((b) => {
    b.onclick = async () => { await invoke("remove_folder", { path: b.dataset.rm }); renderSettings(); };
  });
  $("s-add").onclick = addFolderFlow;
  $("s-rescan").onclick = rescan;
  const saveFilters = debounce(async () => {
    await invoke("set_setting", { key: "min_duration_sec", value: String(parseInt($("f-dur").value || "60", 10)) });
    await invoke("set_setting", { key: "min_size_bytes", value: String(parseInt($("f-size").value || "100", 10) * 1024) });
    toast("Filtres enregistrés — rescanner pour appliquer");
  }, 500);
  $("f-dur").addEventListener("change", saveFilters);
  $("f-size").addEventListener("change", saveFilters);
  $("view").querySelectorAll("button[data-add]").forEach((b) => {
    b.onclick = async () => {
      await invoke("force_add", { path: b.dataset.add });
      toast("Morceau ajouté à la bibliothèque");
      renderSettings();
    };
  });
}

/* ---------- Actions bibliothèque ---------- */
async function addFolderFlow() {
  const dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: "Choisir un dossier de musique" });
  if (!dir) return;
  await invoke("add_folder", { path: dir });
  toast(`Dossier ajouté : ${dir}`);
  await rescan();
}

async function rescan() {
  toast("Scan en cours…");
  const res = await invoke("scan_library");
  toast(`Scan terminé : +${res.added} ajouté(s), ${res.updated} mis à jour, ${res.removed} retiré(s)`);
  await refreshPlaylists();
  render();
}

async function refreshPlaylists() {
  state.playlists = await invoke("list_playlists");
}

function render() {
  const fn = state.view === "detail" ? renderers.detail : renderers[state.view];
  if (fn) fn().catch((e) => console.error(e));
}

/* ---------- Démarrage ---------- */
async function start() {
  applyTheme();
  state.ctrl = initPlayer();
  await refreshPlaylists();
  nav("home");
}

start();
