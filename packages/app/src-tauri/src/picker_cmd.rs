//! 点选采集(线 A)WebView 注入:打开一个真 WebView 加载目标网址(真浏览器引擎渲染,
//! 因此对 JS 渲染站点同样有效),注入 document-start 脚本——悬停描边、点击生成 CSS 选择器,
//! 并**直接 emit 核心事件 `picker:selected`** 回传主窗口(主窗口 listen)。远程页的 IPC 由
//! capabilities/picker.json 的 `remote.urls` 放行;picker 窗口只授予 `core:event:allow-emit`
//! (发事件),拿不到 cred_get 等敏感命令。注:Tauri 2 里远程 webview 调不了应用自定义命令,
//! 故走已授权的核心事件插件命令 `plugin:event|emit` 而非自定义命令。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// 注入到目标页(document-start,运行在远程页面上下文)的点选脚本:自足的选择器生成 +
/// 悬停高亮 + 点击回传。不依赖打包代码,故为纯字符串常量。
const PICKER_INIT_JS: &str = r#"
(function () {
  if (window.__siftPicker) return;
  window.__siftPicker = true;
  var HL = '__sift_hl__';
  var MATCH = '__sift_match__';
  function ensureStyle() {
    if (document.getElementById(HL)) return;
    var s = document.createElement('style');
    s.id = HL;
    s.textContent =
      '.' + HL + '{outline:2px solid #7c5cfc !important;outline-offset:-2px !important;background:rgba(124,92,252,.14) !important;cursor:crosshair !important;}' +
      '.' + MATCH + '{outline:2px dashed #2dd4bf !important;outline-offset:-2px !important;background:rgba(45,212,191,.12) !important;}';
    (document.head || document.documentElement).appendChild(s);
  }
  function clearMatches() {
    var els = document.getElementsByClassName(MATCH);
    while (els.length) els[0].classList.remove(MATCH);
  }
  function reportCount(n) {
    try {
      var p = window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'picker:count', payload: n });
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function highlightMatches(sel) {
    clearMatches();
    if (!sel) { reportCount(-2); return; }
    ensureStyle();
    var n = 0;
    try {
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) els[i].classList.add(MATCH);
      n = els.length;
    } catch (e) { reportCount(-1); return; }
    reportCount(n);
  }
  // 与 visual-picker/selector-gen.ts 的启发式对齐:剔除机器生成的哈希类/id。
  function looksRandom(s) {
    if (/^\d+$/.test(s)) return true;
    if (/^[0-9a-f]{6,}$/i.test(s) && /\d/.test(s)) return true;
    if (s.length >= 16 && /\d/.test(s) && /[a-z]/i.test(s)) return true;
    return false;
  }
  function isRandomId(id) {
    if (!id) return true;
    if (/^\d+$/.test(id)) return true;
    return id.split(/[-_]/).some(looksRandom);
  }
  function isSemantic(c) {
    if (!c || c === HL) return false;
    if (/^(css|sc|jsx|emotion|makeStyles|MuiBox)-/i.test(c)) return false;
    if (/^\d/.test(c)) return false;
    return !looksRandom(c);
  }
  function esc(s) { try { return CSS.escape(s); } catch (e) { return s; } }
  function classesOf(el) {
    var c = el.getAttribute && el.getAttribute('class');
    return c ? c.split(/\s+/).filter(isSemantic) : [];
  }
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node.tagName && node.tagName.toLowerCase() !== 'html') {
      var tag = node.tagName.toLowerCase();
      if (node.id && !isRandomId(node.id)) { parts.unshift('#' + esc(node.id)); break; }
      var seg = tag;
      var sem = classesOf(node);
      if (sem.length) {
        seg = tag + '.' + esc(sem[0]);
      } else {
        var i = 1, sib = node;
        while ((sib = sib.previousElementSibling)) { if (sib.tagName === node.tagName) i++; }
        seg = tag + ':nth-of-type(' + i + ')';
      }
      parts.unshift(seg);
      try { if (document.querySelectorAll(parts.join(' > ')).length === 1) break; } catch (e) {}
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  var last = null;
  document.addEventListener('mouseover', function (e) {
    ensureStyle();
    if (last && last.classList) last.classList.remove(HL);
    last = e.target;
    if (last && last.classList) last.classList.add(HL);
  }, true);
  document.addEventListener('mouseout', function (e) {
    if (e.target && e.target.classList) e.target.classList.remove(HL);
  }, true);
  document.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    // 生成前摘掉注入的高亮类,别让它混进选择器。
    if (e.target && e.target.classList) e.target.classList.remove(HL);
    if (last && last.classList) last.classList.remove(HL);
    var sel = selectorFor(e.target);
    try {
      // 走已授权的核心事件插件命令(远程 webview 调不了应用自定义命令),主窗口 listen。
      var p = window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'picker:selected', payload: sel });
      if (p && p.catch) p.catch(function () {});
    } catch (err) {}
    return false;
  }, true);
  // 监听主窗口发来的「高亮此选择器」请求(需 withGlobalTauri);__TAURI__ 异步就绪,轮询等它。
  (function waitTauri() {
    if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen) {
      window.__TAURI__.event.listen('picker:highlight', function (e) {
        highlightMatches((e && e.payload) || '');
      });
    } else {
      setTimeout(waitTauri, 120);
    }
  })();
})();
"#;

/// 打开(或导航到)点选 WebView 加载目标网址,注入点选脚本。
#[tauri::command]
pub async fn open_picker(app: AppHandle, url: String) -> Result<(), String> {
    let parsed: tauri::Url = url.parse().map_err(|_| format!("无效网址: {url}"))?;
    if let Some(w) = app.get_webview_window("picker") {
        w.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "picker", WebviewUrl::External(parsed))
        .title("点选采集 — 点击页面元素选取")
        .inner_size(1100.0, 800.0)
        .initialization_script(PICKER_INIT_JS)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}
