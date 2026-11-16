// ============================================================
// Lyra - jeu d'icônes Fluent (SVG monochrome, 24x24)
// ============================================================
// Tracés linéaires fins, bouts arrondis : proche du langage visuel
// de Windows 11 (Segoe Fluent Icons) sans dépendre de la police.

var PATHS = {
  home: '<path d="M4 10.8 12 4l8 6.8V20a1 1 0 0 1-1 1h-4.4v-5.4H9.4V21H5a1 1 0 0 1-1-1z"/>',
  tracks: '<path d="M9 17.6V6.3l9.5-1.9v11.1"/><circle cx="6.6" cy="17.7" r="2.4"/><circle cx="16.1" cy="15.6" r="2.4"/>',
  albums: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.1"/>',
  artists: '<rect x="9.2" y="3" width="5.6" height="9.9" rx="2.8"/><path d="M6.4 10.6a5.6 5.6 0 0 0 11.2 0"/><path d="M12 16.2V20"/><path d="M9.3 20.6h5.4"/>',
  playlists: '<path d="M4 6.6h9.4"/><path d="M4 11.6h9.4"/><path d="M4 16.6h6.4"/><path d="M15.6 13.5 20 16.3l-4.4 2.8z" fill="currentColor" stroke="none"/>',
  heart: '<path d="M12 20.1c-1.4-.9-6.7-4.7-6.7-9a3.9 3.9 0 0 1 6.7-2.8 3.9 3.9 0 0 1 6.7 2.8c0 4.3-5.3 8.1-6.7 9z"/>',
  "heart-filled": '<path d="M12 20.4c-1.5-1-7-4.9-7-9.4a4.1 4.1 0 0 1 7-2.9 4.1 4.1 0 0 1 7 2.9c0 4.5-5.5 8.4-7 9.4z"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.3 2"/>',
  settings: '<path d="M4 7.6h8.3"/><path d="M15.7 7.6H20"/><path d="M4 16.4h3.3"/><path d="M10.7 16.4H20"/><circle cx="14" cy="7.6" r="2.1"/><circle cx="9" cy="16.4" r="2.1"/>',
  search: '<circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8 20 20"/>',
  shuffle: '<path d="M4 7.2h3l8.3 9.6H19"/><path d="M4 16.8h3l2.6-3"/><path d="M13.3 9.2 16.3 7.2H19"/><path d="M16.6 4.5 19.4 7.2l-2.8 2.7"/><path d="M16.6 14.1 19.4 16.8l-2.8 2.7"/>',
  prev: '<path d="M6.7 5.4v13.2"/><path d="M18.6 5.9 9.2 12l9.4 6.1z" fill="currentColor" stroke="none"/>',
  next: '<path d="M17.3 5.4v13.2"/><path d="M5.4 5.9 14.8 12 5.4 18.1z" fill="currentColor" stroke="none"/>',
  play: '<path d="M8.2 5 19.4 12 8.2 19z"/>',
  pause: '<path d="M9.2 4.9v14.2" stroke-width="2.6"/><path d="M14.8 4.9v14.2" stroke-width="2.6"/>',
  repeat: '<path d="M5.5 10.4V9.1A2.7 2.7 0 0 1 8.2 6.4h10.3"/><path d="M18.5 13.6v1.3a2.7 2.7 0 0 1-2.7 2.7H5.6"/><path d="M15.9 3.7l2.8 2.7-2.8 2.7"/><path d="M8.1 14.9l-2.7 2.7 2.7 2.7"/>',
  "repeat-one": '<path d="M5.5 10.4V9.1A2.7 2.7 0 0 1 8.2 6.4h10.3"/><path d="M18.5 13.6v1.3a2.7 2.7 0 0 1-2.7 2.7H5.6"/><path d="M15.9 3.7l2.8 2.7-2.8 2.7"/><path d="M8.1 14.9l-2.7 2.7 2.7 2.7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4.6 9.5h3L12 6v12l-4.4-3.5h-3z"/><path d="M15.3 9.4a4 4 0 0 1 0 5.2"/><path d="M17.9 6.9a8 8 0 0 1 0 10.2"/>',
  "volume-low": '<path d="M4.6 9.5h3L12 6v12l-4.4-3.5h-3z"/><path d="M15.3 9.4a4 4 0 0 1 0 5.2"/>',
  "volume-mute": '<path d="M4.6 9.5h3L12 6v12l-4.4-3.5h-3z"/><path d="M15.8 9.7l4.4 4.6"/><path d="M20.2 9.7l-4.4 4.6"/>',
  eq: '<path d="M7 4.2v5"/><path d="M7 13.2v6.6"/><path d="M12 4.2v8"/><path d="M12 16.2v3.6"/><path d="M17 4.2v2"/><path d="M17 10.2v9.6"/><circle cx="7" cy="11.2" r="2"/><circle cx="12" cy="14.2" r="2"/><circle cx="17" cy="8.2" r="2"/>',
  expand: '<path d="M9.6 4.4H4.4v5.2"/><path d="M14.4 4.4h5.2v5.2"/><path d="M9.6 19.6H4.4v-5.2"/><path d="M14.4 19.6h5.2v-5.2"/>',
  "chevron-down": '<path d="M6.2 9.6 12 15.4l5.8-5.8"/>',
  trash: '<path d="M5 7.2h14"/><path d="M9.6 7.2V5.3h4.8v1.9"/><path d="M6.9 7.2 7.9 19a1 1 0 0 0 1 .9h6.2a1 1 0 0 0 1-.9l1-11.8"/>',
  refresh: '<path d="M19.2 12a7.2 7.2 0 1 1-2.2-5.2"/><path d="M19.4 4.6v4.2h-4.2"/>',
  plus: '<path d="M12 5.2v13.6"/><path d="M5.2 12h13.6"/>',
  queue: '<path d="M4 7h10.5"/><path d="M4 12h10.5"/><path d="M4 17h6.5"/><path d="M15.4 13.3 20 16.1l-4.6 2.8z" fill="currentColor" stroke="none"/>',
  note: '<path d="M9 17.6V6.3l9.5-1.9v11.1"/><circle cx="6.6" cy="17.7" r="2.4"/><circle cx="16.1" cy="15.6" r="2.4"/>'
};

var FILLED = ["play", "heart-filled"];

/**
 * Renvoie le balisage SVG d'une icône.
 * @param {string} name clé de PATHS
 * @param {string} [cls] classe supplémentaire
 */
export function icon(name, cls) {
  var inner = PATHS[name];
  if (!inner) return "";
  var filled = FILLED.indexOf(name) !== -1;
  return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" width="20" height="20"' +
    ' fill="' + (filled ? "currentColor" : "none") + '"' +
    ' stroke="' + (filled ? "none" : "currentColor") + '"' +
    ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    inner + "</svg>";
}

/** Remplit tous les éléments [data-icon] présents dans le document. */
export function hydrate(root) {
  var scope = root || document;
  var nodes = scope.querySelectorAll("[data-icon]");
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (el.querySelector("svg")) continue;
    el.insertAdjacentHTML("beforeend", icon(el.getAttribute("data-icon")));
  }
}
