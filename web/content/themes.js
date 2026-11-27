// 配色（2026-11-27 使用者：參考終端機／vim 配色做 20 種可以選，包括整體配色；本子裡待辦／記事／完成要分得出來）。
// 每一套：狀態列、分頁、筆記本紙、字、強調色，加上本子裡每一種項目自己的顏色（像程式碼上色）：
//   待辦＝最亮的字＋橘／黃色的 •、事件＝藍、記事＝綠、完成＝註解灰＋刪除線、延到明天＝青。
// 除了「萬事屋」（預設：奶油色紙＋夜色），其他套連魅魔／商店／設定頁的面板也一起換（style.css 的 --bg／--text…）。

/** 一套配色：bar 狀態列／分頁、bar2 把手／輸入列、line 邊線、fg 字、mute 註解色、paper 紙（終端機配色＝編輯器底色）、
 *  red／orange／yellow／green／cyan／blue／purple 語法色、accent 強調（目前分頁、送出鍵、專注中）、light 亮色系。 */
export const THEMES = [
  { id: "yorozuya", name: "萬事屋（預設）", light: false, legacy: false,
    bar: "#1d1230", bar2: "#251a3c", line: "#3a2a58", fg: "#e9e1f5", mute: "#a597c2",
    paper: "#f3ead8", ink: "#3b2f45", pmute: "#8a7b70", grid: "#cfdbe3", room: "#120b1d", desk: "#2a1d40",
    red: "#c2414b", orange: "#c0561a", yellow: "#ffd36b", green: "#2f7a3d", cyan: "#62e4d8", teal: "#2b8585", blue: "#2a5fa8", purple: "#8a3fa0",
    accent: "#ff5fb0", accentPaper: "#b0446f", inBg: "#140c1f", inInk: "#e9e1f5" },
  { id: "gruvbox-dark", name: "Gruvbox 暗", bar: "#1d2021", bar2: "#32302f", line: "#504945", paper: "#282828", fg: "#ebdbb2", mute: "#928374",
    red: "#fb4934", orange: "#fe8019", yellow: "#fabd2f", green: "#b8bb26", cyan: "#8ec07c", blue: "#83a598", purple: "#d3869b", accent: "#fe8019" },
  { id: "gruvbox-light", name: "Gruvbox 亮", light: true, bar: "#ebdbb2", bar2: "#f2e5bc", line: "#d5c4a1", paper: "#fbf1c7", fg: "#3c3836", mute: "#928374",
    red: "#9d0006", orange: "#af3a03", yellow: "#b57614", green: "#79740e", cyan: "#427b58", blue: "#076678", purple: "#8f3f71", accent: "#af3a03" },
  { id: "solarized-dark", name: "Solarized 暗", bar: "#00212b", bar2: "#073642", line: "#18434e", paper: "#002b36", fg: "#93a1a1", mute: "#5f7880",
    red: "#dc322f", orange: "#cb4b16", yellow: "#b58900", green: "#859900", cyan: "#2aa198", blue: "#268bd2", purple: "#6c71c4", accent: "#d33682" },
  { id: "solarized-light", name: "Solarized 亮", light: true, bar: "#eee8d5", bar2: "#f5efdc", line: "#d6cfb8", paper: "#fdf6e3", fg: "#4f6168", mute: "#93a1a1",
    red: "#dc322f", orange: "#cb4b16", yellow: "#b58900", green: "#859900", cyan: "#2aa198", blue: "#268bd2", purple: "#6c71c4", accent: "#d33682" },
  { id: "dracula", name: "Dracula", bar: "#21222c", bar2: "#343746", line: "#44475a", paper: "#282a36", fg: "#f8f8f2", mute: "#6272a4",
    red: "#ff5555", orange: "#ffb86c", yellow: "#f1fa8c", green: "#50fa7b", cyan: "#8be9fd", blue: "#8be9fd", purple: "#bd93f9", accent: "#ff79c6" },
  { id: "nord", name: "Nord", bar: "#242933", bar2: "#3b4252", line: "#434c5e", paper: "#2e3440", fg: "#eceff4", mute: "#7b88a1",
    red: "#bf616a", orange: "#d08770", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#8fbcbb", blue: "#81a1c1", purple: "#b48ead", accent: "#88c0d0" },
  { id: "monokai", name: "Monokai", bar: "#1e1f1c", bar2: "#3e3d32", line: "#49483e", paper: "#272822", fg: "#f8f8f2", mute: "#75715e",
    red: "#f92672", orange: "#fd971f", yellow: "#e6db74", green: "#a6e22e", cyan: "#66d9ef", blue: "#66d9ef", purple: "#ae81ff", accent: "#f92672" },
  { id: "one-dark", name: "One Dark", bar: "#21252b", bar2: "#2c313a", line: "#3e4451", paper: "#282c34", fg: "#abb2bf", mute: "#5c6370",
    red: "#e06c75", orange: "#d19a66", yellow: "#e5c07b", green: "#98c379", cyan: "#56b6c2", blue: "#61afef", purple: "#c678dd", accent: "#c678dd" },
  { id: "tokyo-night", name: "Tokyo Night", bar: "#16161e", bar2: "#24283b", line: "#292e42", paper: "#1a1b26", fg: "#c0caf5", mute: "#565f89",
    red: "#f7768e", orange: "#ff9e64", yellow: "#e0af68", green: "#9ece6a", cyan: "#7dcfff", blue: "#7aa2f7", purple: "#bb9af7", accent: "#bb9af7" },
  { id: "catppuccin-mocha", name: "Catppuccin 暗", bar: "#181825", bar2: "#313244", line: "#45475a", paper: "#1e1e2e", fg: "#cdd6f4", mute: "#7f849c",
    red: "#f38ba8", orange: "#fab387", yellow: "#f9e2af", green: "#a6e3a1", cyan: "#94e2d5", blue: "#89b4fa", purple: "#cba6f7", accent: "#f5c2e7" },
  { id: "catppuccin-latte", name: "Catppuccin 亮", light: true, bar: "#e6e9ef", bar2: "#dce0e8", line: "#ccd0da", paper: "#eff1f5", fg: "#4c4f69", mute: "#8c8fa1",
    red: "#d20f39", orange: "#fe640b", yellow: "#df8e1d", green: "#40a02b", cyan: "#179299", blue: "#1e66f5", purple: "#8839ef", accent: "#ea76cb" },
  { id: "everforest", name: "Everforest", bar: "#232a2e", bar2: "#343f44", line: "#475258", paper: "#2d353b", fg: "#d3c6aa", mute: "#859289",
    red: "#e67e80", orange: "#e69875", yellow: "#dbbc7f", green: "#a7c080", cyan: "#83c092", blue: "#7fbbb3", purple: "#d699b6", accent: "#e69875" },
  { id: "kanagawa", name: "Kanagawa", bar: "#16161d", bar2: "#2a2a37", line: "#363646", paper: "#1f1f28", fg: "#dcd7ba", mute: "#727169",
    red: "#e46876", orange: "#ffa066", yellow: "#e6c384", green: "#98bb6c", cyan: "#7aa89f", blue: "#7e9cd8", purple: "#957fb8", accent: "#d27e99" },
  { id: "rose-pine", name: "Rosé Pine", bar: "#1f1d2e", bar2: "#26233a", line: "#403d52", paper: "#191724", fg: "#e0def4", mute: "#6e6a86",
    red: "#eb6f92", orange: "#f6c177", yellow: "#f6c177", green: "#9ccfd8", cyan: "#9ccfd8", blue: "#c4a7e7", purple: "#ebbcba", accent: "#eb6f92" },
  { id: "ayu-dark", name: "Ayu 暗", bar: "#0d1017", bar2: "#131721", line: "#232834", paper: "#0b0e14", fg: "#bfbdb6", mute: "#5c6773",
    red: "#f07178", orange: "#ff8f40", yellow: "#e6b450", green: "#aad94c", cyan: "#95e6cb", blue: "#59c2ff", purple: "#d2a6ff", accent: "#ff8f40" },
  { id: "tomorrow-night", name: "Tomorrow Night", bar: "#161719", bar2: "#282a2e", line: "#373b41", paper: "#1d1f21", fg: "#c5c8c6", mute: "#969896",
    red: "#cc6666", orange: "#de935f", yellow: "#f0c674", green: "#b5bd68", cyan: "#8abeb7", blue: "#81a2be", purple: "#b294bb", accent: "#b294bb" },
  { id: "night-owl", name: "Night Owl", bar: "#010e1a", bar2: "#0b2942", line: "#1d3b53", paper: "#011627", fg: "#d6deeb", mute: "#637777",
    red: "#ef5350", orange: "#f78c6c", yellow: "#ffcb8b", green: "#addb67", cyan: "#7fdbca", blue: "#82aaff", purple: "#c792ea", accent: "#c792ea" },
  { id: "github-light", name: "GitHub 亮", light: true, bar: "#f6f8fa", bar2: "#eaeef2", line: "#d0d7de", paper: "#ffffff", fg: "#24292f", mute: "#6e7781",
    red: "#cf222e", orange: "#bc4c00", yellow: "#9a6700", green: "#116329", cyan: "#1b7c83", blue: "#0969da", purple: "#8250df", accent: "#8250df" },
  { id: "papercolor-light", name: "PaperColor 亮", light: true, bar: "#e4e4e4", bar2: "#dadada", line: "#bcbcbc", paper: "#eeeeee", fg: "#444444", mute: "#878787",
    red: "#af0000", orange: "#d75f00", yellow: "#af8700", green: "#008700", cyan: "#005f87", blue: "#0087af", purple: "#8700af", accent: "#d70087" },
];

export const DEFAULT_THEME = "yorozuya";
const mix = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

export function themeOf(id) { return THEMES.find((t) => t.id === id) || THEMES[0]; }

/** 一套配色 → CSS 變數（home_bujo.css 讀這些；legacy !== false 的連 style.css 的舊變數一起蓋）。 */
export function themeVars(t) {
  const paper = t.paper, ink = t.ink || t.fg, pmute = t.pmute || t.mute;
  const accentP = t.accentPaper || t.accent;          // 紙上的強調（專注中、待辦鍵）：預設套在奶油紙上要深一點
  const onAccent = t.light || t.id === "yorozuya" ? "#ffffff" : paper;
  const v = {
    "--bj-bar": t.bar, "--bj-bar2": t.bar2, "--bj-line": t.line, "--bj-ink": t.fg, "--bj-mute": t.mute,
    "--paper": paper, "--paper-ink": ink, "--paper-mute": pmute, "--paper-rule": mix(ink, paper, 20),
    "--grid": t.grid || mix(ink, paper, 9), "--margin": mix(t.red, paper, 55),
    "--edge1": mix(ink, paper, 8), "--edge2": mix(ink, paper, 16), "--edge3": mix(ink, paper, 26),
    "--room-bg": t.room || t.bar, "--desk-bg": t.desk || t.bar2,
    "--bj-accent": accentP, "--on-accent": onAccent, "--accent": t.accent, "--accent2": t.cyan, "--gold-c": t.yellow,
    "--in-bg": t.inBg || paper, "--in-ink": t.inInk || ink,
    "--btn-bg": mix(ink, paper, 6), "--cur-bg": mix(accentP, paper, 18), "--cur-ink": mix(accentP, ink, 70),
    // 本子裡每一種項目自己的顏色
    "--k-task": ink, "--k-task-sig": t.orange, "--k-ev": t.blue, "--k-note": t.green,
    "--k-done": mix(pmute, paper, 75), "--k-moved": t.teal || t.cyan,
    "--k-tag": t.purple, "--k-tag-bg": mix(t.purple, paper, 16), "--k-url": t.teal || t.cyan,
  };
  if (t.legacy !== false) {
    Object.assign(v, {
      "--bg": t.bar, "--glow": t.bar2, "--panel": mix(paper, "transparent", 92), "--panel2": mix(paper, "transparent", 70),
      "--text": t.fg, "--dim": t.mute, "--line": mix(t.fg, "transparent", 14),
      "--pink": t.accent, "--cyan": t.cyan, "--red": t.red, "--gold": t.yellow,
    });
  }
  return v;
}

let appliedKeys = [];
/** 套到 body（行內樣式蓋過 style.css 的 body[data-theme] 設定）。 */
export function applyColorTheme(id) {
  const t = themeOf(id);
  const st = document.body.style;
  for (const k of appliedKeys) st.removeProperty(k);
  const v = themeVars(t);
  for (const [k, val] of Object.entries(v)) st.setProperty(k, val);
  appliedKeys = Object.keys(v);
  document.body.dataset.colorTheme = t.id;
  document.body.classList.toggle("theme-light", !!t.light);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t.bar);
  try { localStorage.setItem("yoro_color_theme", t.id); } catch { /* */ }
  return t;
}
