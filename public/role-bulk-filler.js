/* ===================================================================
 * role-bulk-filler.js —— 角色提示词批量填充 / Multi-character bulk filler
 *
 * 作用：在「角色提示词（Character Prompt）」弹窗底部追加一个「⌁ 批量填充」按钮。
 *       点开后粘贴一段文本，按角色拆开，逐个写进对应角色格的
 *       「正向提示词 / 负面提示词」，并把角色格数量自动对齐到解析出的角色数（多退少补）。
 *
 * 支持的粘贴格式（优先级从高到低）：
 *   【角色1】1girl, silver hair, red eyes ...
 *   负面1：lowres, text, watermark ...
 *
 *   角色2: 1boy, large penis ...
 *
 *   空行分段：两个空行之间算一个角色
 *
 * 依赖的 DOM 契约（见 src/App.tsx）：
 *   行容器  [data-character-list] > div.char-row[data-character-id]
 *   展开按钮 button.char-row-toggle[aria-expanded]（折叠时 textarea 不挂载，填充前会先展开）
 *   正向框  [data-character-field="prompt"] textarea.char-prompt
 *   负向框  [data-character-field="negativePrompt"] textarea
 *   新增 / 删除 / 清空 / 完成 按钮文案走 i18n：character.add、character.delete …
 *
 * 设计约束：
 *   - 只通过 DOM 读写，不引入 React 依赖、不直接改 zustand store；
 *   - 写入用 setNativeValue + input/change/InputEvent，让受控组件收到变更；
 *   - 草稿与上一次解析结果存 localStorage（langbai-role-bulk-filler-draft），刷新不丢；
 *   - 弹窗未挂载时不做任何事，MutationObserver 等它出现；
 *   - 不注册全局快捷键、不覆盖原有按钮行为，Esc 只关自己的面板。
 * =================================================================== */
(() => {
  'use strict';
  if (window.__LANGBAI_ROLE_BULK_FILLER__) return;
  window.__LANGBAI_ROLE_BULK_FILLER__ = true;

  const DRAFT_KEY = 'langbai-role-bulk-filler-draft';
  const ADD_TEXTS = ['添加角色', '新增角色', 'Add character', 'キャラクターを追加', '캐릭터 추가'];
  const DONE_TEXTS = ['完成', 'Done', '完了', '완료'];
  const DEL_TEXTS = ['删除', '刪除', 'Delete', '削除', '삭제'];

  /* ---------- 工具 ---------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  function click(el) {
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  function setNativeValue(ta, value) {
    const proto = Object.getPrototypeOf(ta);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
                 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(ta, value);
    else ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden';
  }

  /* ---------- 找容器 ---------- */
  function charList() {
    return document.querySelector('[data-character-list]');
  }
  function rows() {
    const list = charList();
    return list ? Array.from(list.querySelectorAll('[data-character-id]')) : [];
  }
  function addButton() {
    const node = charList();
    if (!node) return null;
    // 新增按钮在列表的父容器内、列表之后的同级 Button
    const scope = node.parentElement || document;
    const cands = Array.from(scope.querySelectorAll('button'));
    return cands.find((b) => ADD_TEXTS.some((t) => norm(b.textContent).includes(t))) || null;
  }
  function dialogRoot() {
    const list = charList();
    if (!list) return null;
    let el = list;
    for (let i = 0; i < 12 && el; i++) {
      if (el.querySelector && el.querySelector('footer') ) return el;
      el = el.parentElement;
    }
    return list.closest('[role="dialog"]') || document.querySelector('[role="dialog"]');
  }
  function footer() {
    const root = dialogRoot();
    if (!root) return null;
    const f = Array.from(root.querySelectorAll('footer')).find((x) =>
      Array.from(x.querySelectorAll('button')).some((b) => DONE_TEXTS.some((t) => norm(b.textContent).includes(t))),
    );
    return f || root.querySelector('footer');
  }
  function doneButton() {
    const f = footer();
    if (!f) return null;
    return Array.from(f.querySelectorAll('button')).find((b) =>
      DONE_TEXTS.some((t) => norm(b.textContent).includes(t))) || null;
  }

  /* ---------- 解析 ---------- */
  const POS_RE = /^\s*[【\[]?\s*(?:角色|人物|character|chara|キャラクター|캐릭터)\s*([0-9]+|[一二三四五六七八九十]+)\s*[】\]]?\s*[:：]?\s*([\s\S]*)$/i;
  const NEG_RE = /^\s*[【\[]?\s*(?:负面|负向|反向|negative)\s*([0-9]+|[一二三四五六七八九十]+)\s*[】\]]?\s*[:：]?\s*([\s\S]*)$/i;

  function cnNum(s) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
    return map[s] || 0;
  }

  function clean(tagText) {
    return String(tagText || '')
      .replace(/^\s*(?:正向|正面|positive)\s*[:：]/i, '')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim();
  }

  /**
   * 三层兜底：
   *  1) 【角色N】/角色N： 标记
   *  2) 每行行首 角色N 带冒号
   *  3) 空行分段
   */
  function parseRoles(text) {
    const src = String(text || '').replace(/\r\n?/g, '\n');
    const map = new Map();
    const touch = (i) => {
      if (!map.has(i)) map.set(i, { positive: '', negative: '' });
      return map.get(i);
    };

    const lines = src.split('\n');
    let current = null; // {idx, field}
    let markerHits = 0;

    for (const line of lines) {
      const mPos = line.match(POS_RE);
      const mNeg = line.match(NEG_RE);
      if (mPos) {
        const idx = cnNum(mPos[1]) || (markerHits + 1);
        markerHits = Math.max(markerHits, idx);
        const target = touch(idx - 1);
        target.positive = clean(mPos[2] ? target.positive + ' ' + mPos[2] : target.positive);
        current = { idx: idx - 1, field: 'positive' };
        continue;
      }
      if (mNeg) {
        const idx = cnNum(mNeg[1]) || 1;
        const target = touch(idx - 1);
        target.negative = clean(mNeg[2] ? target.negative + ' ' + mNeg[2] : target.negative);
        current = { idx: idx - 1, field: 'negative' };
        continue;
      }
      if (!current) continue;
      const t = clean(line);
      if (!t) continue;
      const cur = touch(current.idx);
      cur[current.field] = clean(cur[current.field] + ' ' + t);
    }

    if (map.size) {
      return Array.from(map.keys()).sort((a, b) => a - b).map((k) => map.get(k));
    }

    // 第三层：空行分段
    const blocks = src.split(/\n\s*\n/).map((b) => clean(b)).filter(Boolean);
    return blocks.map((b) => ({ positive: b, negative: '' }));
  }

  /* ---------- 填充 ---------- */
  async function ensureRows(n, log) {
    let guard = 0;
    while (rows().length < n && guard < 24) {
      const btn = addButton();
      if (!btn) { log && log('找不到「添加角色」按钮'); break; }
      if (btn.disabled) { log && log('已到角色数量上限'); break; }
      const before = rows().length;
      click(btn);
      // 等 React 提交
      let wait = 0;
      while (rows().length === before && wait < 40) { await sleep(25); wait++; }
      if (rows().length === before) { await sleep(120); }
      guard++;
    }
    return rows().length;
  }

  async function expandRow(row) {
    const toggle = row.querySelector('button.char-row-toggle');
    if (toggle && toggle.getAttribute('aria-expanded') === 'false') {
      click(toggle);
      // 等折叠动画把 textarea 挂出来
      for (let i = 0; i < 30; i++) {
        if (row.querySelector('textarea')) break;
        await sleep(30);
      }
    }
  }

  function fieldBox(row, field) {
    const scope = row.querySelector(`[data-character-field="${field}"]`) || row;
    return scope.querySelector('textarea');
  }

  async function fillRole(index, data) {
    const list = rows();
    const row = list[index];
    if (!row) return false;
    await expandRow(row);
    const pos = fieldBox(row, 'prompt');
    if (pos && data.positive) setNativeValue(pos, data.positive);
    if (data.negative) {
      const neg = fieldBox(row, 'negativePrompt');
      if (neg) setNativeValue(neg, data.negative);
    }
    return true;
  }

  /* 行内的「删除」按钮（源码 i18n character.delete） */
  function deleteButton(row) {
    if (!row) return null;
    const scope = row.querySelector('.char-row-actions') || row;
    return Array.from(scope.querySelectorAll('button')).find((b) => {
      const t = norm(b.textContent);
      return DEL_TEXTS.some((x) => t === x || t.includes(x));
    }) || null;
  }

  /* 把角色数量对齐到目标值：少了补、多了从尾部删 */
  async function syncCount(target, onProgress) {
    let added = 0, removed = 0;
    let before = rows().length;
    if (before < target) {
      const after = await ensureRows(target, (m) => onProgress && onProgress(m));
      added = Math.max(0, after - before);
    }
    let guard = 0;
    while (rows().length > target && guard < 24) {
      const list = rows();
      const last = list[list.length - 1];
      if (!last) break;
      const del = deleteButton(last);
      if (!del) break;
      const n0 = rows().length;
      click(del);
      let wait = 0;
      while (rows().length === n0 && wait < 40) { await sleep(25); wait++; }
      if (rows().length === n0) { await sleep(120); }
      if (rows().length === n0) { onProgress && onProgress('删除按钮没生效，检查选择器'); break; }
      removed++;
      guard++;
    }
    return { added, removed };
  }

  async function fillAll(roles, onProgress) {
    const need = roles.length;
    const sync = await syncCount(need, onProgress);
    const count = Math.min(rows().length, need);
    for (let i = 0; i < count; i++) {
      await fillRole(i, roles[i]);
      if (onProgress) onProgress(`填充中 ${i + 1}/${count}`);
      await sleep(60);
    }
    return { count, added: sync.added, removed: sync.removed };
  }

  async function clearAll(onProgress) {
    const f = footer();
    if (!f) return false;
    const btn = Array.from(f.querySelectorAll('button')).find((b) => /清空|Clear|クリア|지우기/i.test(norm(b.textContent)));
    if (!btn) return false;
    click(btn);
    if (onProgress) onProgress('已点清空角色');
    return true;
  }

  /* ---------- UI ---------- */
  let panel = null;
  let btnRef = null;

  function buildPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'rbf-panel';
    wrap.style.cssText = [
      'position:fixed', 'right:24px', 'bottom:96px', 'width:min(520px,calc(100vw - 48px))',
      'max-height:70vh', 'display:none', 'flex-direction:column', 'gap:8px',
      'padding:12px', 'border-radius:14px', 'z-index:2147483000',
      'background:rgba(20,20,26,.97)', 'border:1px solid rgba(255,255,255,.16)',
      'box-shadow:0 18px 50px rgba(0,0,0,.55)', 'color:#eaeaf2',
      'font:12px/1.55 system-ui,"Microsoft YaHei",sans-serif',
    ].join(';');

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';
    head.innerHTML = '<strong style="font-size:13px">批量填充角色提示词</strong>';
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕';
    x.style.cssText = 'all:unset;cursor:pointer;padding:2px 6px;border-radius:6px;color:#bbb';
    x.onclick = () => hidePanel();
    head.appendChild(x);

    const ta = document.createElement('textarea');
    ta.id = 'rbf-input';
    ta.placeholder = '粘贴：\n【角色1】1girl, silver hair, ...\n负面1：lowres, text, ...\n\n【角色2】1boy, ...\n（也支持「角色1: xxx」或空行分段）';
    ta.style.cssText = [
      'width:100%', 'min-height:180px', 'resize:vertical', 'box-sizing:border-box',
      'padding:10px', 'border-radius:10px', 'border:1px solid rgba(255,255,255,.18)',
      'background:rgba(0,0,0,.45)', 'color:#eaeaf2', 'font:12px/1.5 ui-monospace,Consolas,monospace',
      'outline:none',
    ].join(';');
    ta.value = localStorage.getItem(DRAFT_KEY) || '';
    ta.addEventListener('input', () => {
      try { localStorage.setItem(DRAFT_KEY, ta.value); } catch (e) {}
    });

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';

    const mk = (label, primary) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = [
        'cursor:pointer', 'padding:6px 12px', 'border-radius:9px', 'font-size:12px',
        'border:1px solid ' + (primary ? 'rgba(140,120,255,.85)' : 'rgba(255,255,255,.2)'),
        'background:' + (primary ? 'linear-gradient(180deg,#6f5bff,#4a37d6)' : 'rgba(255,255,255,.06)'),
        'color:#fff',
      ].join(';');
      return b;
    };

    const status = document.createElement('span');
    status.style.cssText = 'opacity:.8;font-size:11px;flex:1;min-width:120px';

    const bParse = mk('识别');
    const bFill = mk('填充', true);
    const bClear = mk('清空草稿');

    bParse.onclick = () => {
      const roles = parseRoles(ta.value);
      if (!roles.length) { status.textContent = '没识别到内容'; return; }
      status.textContent = `识别到 ${roles.length} 个角色`;
      storage.lastRoles = roles;
      ta.value = roles.map((r, i) => {
        const head = `【角色${i + 1}】`;
        const neg = r.negative ? `\n负面${i + 1}：${r.negative}` : '';
        return head + r.positive + neg;
      }).join('\n\n');
      try { localStorage.setItem(DRAFT_KEY, ta.value); } catch (e) {}
    };

    bFill.onclick = async () => {
      const roles = parseRoles(ta.value);
      if (!roles.length) { status.textContent = '没识别到内容'; return; }
      bFill.disabled = true;
      try {
        const r = await fillAll(roles, (m) => { status.textContent = m; });
        const extra = [];
        if (r.added) extra.push(`新增 ${r.added}`);
        if (r.removed) extra.push(`删除 ${r.removed}`);
        status.textContent = `已同步为 ${r.count} 个角色` + (extra.length ? `（${extra.join(' / ')}）` : '');
      } finally {
        bFill.disabled = false;
      }
    };

    bClear.onclick = () => { ta.value = ''; storage.lastRoles = []; try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} status.textContent = '草稿已清空'; };

    bar.append(bParse, bFill, bClear, status);
    wrap.append(head, ta, bar);
    document.body.appendChild(wrap);
    return wrap;
  }

  const storage = { lastRoles: [] };

  async function showPanel() {
    if (!panel || !panel.isConnected) panel = buildPanel();
    panel.style.display = 'flex';
    const ta = panel.querySelector('#rbf-input');
    if (ta) {
      ta.focus();
      if (!ta.value.trim()) {
        try {
          const clip = await navigator.clipboard.readText();
          if (clip && clip.trim()) { ta.value = clip; try { localStorage.setItem(DRAFT_KEY, clip); } catch (e) {} }
        } catch (e) {}
      }
    }
  }
  function hidePanel() { if (panel) panel.style.display = 'none'; }

  function makeTrigger() {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'rbf-trigger';
    b.textContent = '⌁ 批量填充';
    b.title = '批量识别并填充角色提示词（可一次粘多个角色）';
    b.style.cssText = [
      'cursor:pointer', 'padding:5px 12px', 'margin-left:8px', 'border-radius:9px',
      'font-size:12px', 'font-weight:600', 'color:#fff',
      'border:1px solid rgba(140,120,255,.9)',
      'background:linear-gradient(180deg,#6f5bff,#4a37d6)',
      'box-shadow:0 2px 10px rgba(90,70,255,.35)',
    ].join(';');
    b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (panel && panel.style.display === 'flex') hidePanel(); else showPanel();
    };
    return b;
  }

  /* 把按钮挂进弹窗 footer（完成 左边） */
  function syncTrigger() {
    const f = footer();
    if (!f) { return false; }
    if (f.querySelector('#rbf-trigger')) return true;
    const btn = makeTrigger();
    const done = Array.from(f.querySelectorAll('button')).find((b) =>
      DONE_TEXTS.some((t) => norm(b.textContent).includes(t)));
    if (done && done.parentElement === f) f.insertBefore(btn, done);
    else f.appendChild(btn);
    return true;
  }

  /* Esc 关面板 */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && panel.style.display === 'flex') {
      e.stopPropagation();
      hidePanel();
    }
  }, true);

  /* 弹窗开关监听 */
  const obs = new MutationObserver(() => {
    if (charList()) syncTrigger();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  if (charList()) syncTrigger();
  console.log('[role-bulk-filler] v2 ready');
})();
