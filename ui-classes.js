/**
 * ui-classes.js — Swatch & Palette classes
 *
 * Encapsulates the data + HTML-fragment rendering for a single color
 * (Swatch) and a color category (Palette). Plain global script — no
 * ES module syntax, so it works fine loaded straight off `file://`.
 *
 * Load order matters:
 *   color.js  →  ui-classes.js  →  the inline app script in index.html
 *
 * Event wiring, app-level state (current HSV/RGB, selection, anchor
 * mode, etc.) and orchestration of when to re-render stay in
 * index.html — these classes only own their own data and know how to
 * turn that data into HTML strings.
 */

// ─── uid helper (shared by both classes, and by the rest of the app) ─────────
function uid() { return Math.random().toString(36).slice(2, 9); }

// ─── Swatch ───────────────────────────────────────────────────────────────────
class Swatch {
  constructor(hex, opts = {}) {
    this.id     = opts.id ?? uid();
    this.hex    = hex;
    this.locked = opts.locked ?? false;
  }

  toggleLock() {
    this.locked = !this.locked;
    return this.locked;
  }

  toJSON() {
    return { id: this.id, hex: this.hex, locked: this.locked };
  }

  static fromJSON(obj) {
    return new Swatch(obj.hex, { id: obj.id, locked: obj.locked });
  }

  /**
   * Renders the swatch tile used inside a palette row.
   * @param {string} catId      id of the owning Palette
   * @param {string} displayHex hex to actually paint (filters applied) —
   *                            falls back to the swatch's own source hex
   */
  renderHTML(catId, displayHex) {
    const disp = displayHex ?? this.hex;
    return `
      <div class="cat-swatch ${this.locked ? 'locked' : ''}" draggable="true"
           style="background:${disp}" data-hex="${this.hex}" data-cat-id="${catId}"
           data-color="${this.id}" title="${disp}" tabindex="0">
        <div class="swatch-remove" data-remove="${this.id}" data-cat="${catId}">✕</div>
        <div class="swatch-lock" data-lock-color="${this.id}" data-lock-cat="${catId}">${this.locked ? '🔒' : '🔓'}</div>
      </div>`;
  }
}

// ─── Palette ──────────────────────────────────────────────────────────────────
class Palette {
  static FILTER_TYPES = ['saturation', 'brightness', 'hueShift', 'contrast', 'temperature'];

  constructor(name, opts = {}) {
    this.id          = opts.id ?? uid();
    this.name        = name;
    this.isGenerated = opts.isGenerated ?? false;
    this.colors      = (opts.colors ?? []).map(c => c instanceof Swatch ? c : Swatch.fromJSON(c));
    this.filters     = opts.filters ?? [];
  }

  // ── Color management ────────────────────────────────────────────────────
  addColor(hex) {
    const sw = new Swatch(hex);
    this.colors.push(sw);
    return sw;
  }
  findColor(id) { return this.colors.find(c => c.id === id); }
  removeColor(id) { this.colors = this.colors.filter(c => c.id !== id); }
  moveColor(fromId, toId) {
    const fromIdx = this.colors.findIndex(c => c.id === fromId);
    const toIdx   = this.colors.findIndex(c => c.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = this.colors.splice(fromIdx, 1);
    this.colors.splice(toIdx, 0, moved);
  }
  toggleLock(id) {
    const c = this.findColor(id);
    if (c) c.toggleLock();
    return c;
  }
  lockedCount() { return this.colors.filter(c => c.locked).length; }

  // ── Filter chain management ─────────────────────────────────────────────
  addFilter(type = 'saturation') {
    const f = { id: uid(), type, amount: 0, enabled: true };
    this.filters.push(f);
    return f;
  }
  findFilter(id) { return this.filters.find(f => f.id === id); }
  removeFilter(id) { this.filters = this.filters.filter(f => f.id !== id); }
  moveFilter(fromId, toId) {
    const fromIdx = this.filters.findIndex(f => f.id === fromId);
    const toIdx   = this.filters.findIndex(f => f.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = this.filters.splice(fromIdx, 1);
    this.filters.splice(toIdx, 0, moved);
  }

  static _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** Non-destructive filter application: source hex + filter chain → display hex */
  static applyFilters(srcHex, filters) {
    if (!filters || !filters.length) return srcHex;
    const rgb0 = hexToRgb(srcHex);
    let { h, s, v } = rgbToHsv(rgb0.r, rgb0.g, rgb0.b);
    for (const f of filters) {
      if (!f.enabled) continue;
      switch (f.type) {
        case 'saturation': s = Palette._clamp(s + f.amount, 0, 100); break;
        case 'brightness': v = Palette._clamp(v + f.amount, 0, 100); break;
        case 'hueShift':   h = ((h + f.amount) % 360 + 360) % 360; break;
        case 'contrast': {
          const k = 1 + f.amount / 100;
          s = Palette._clamp(50 + (s - 50) * k, 0, 100);
          v = Palette._clamp(50 + (v - 50) * k, 0, 100);
          break;
        }
        case 'temperature': h = ((h + f.amount * 0.5) % 360 + 360) % 360; break;
      }
    }
    const rgb = hsvToRgb(h, s, v);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  /** Display hex for one of this palette's swatches, with its filter chain applied */
  getDisplayHex(swatch) {
    return Palette.applyFilters(swatch.hex, this.filters);
  }

  /** Bakes current filtered colors into a brand-new, filter-free Palette */
  clone(newName) {
    const baked = this.colors.map(c => new Swatch(this.getDisplayHex(c)));
    return new Palette(newName, { colors: baked, isGenerated: false, filters: [] });
  }

  // ── Rendering (HTML fragments only — event wiring lives in the app) ────
  renderSwatchesHTML() {
    return this.colors.map(c => c.renderHTML(this.id, this.getDisplayHex(c))).join('');
  }

  renderFilterChainHTML() {
    const rows = this.filters.map(f => `
      <div class="filter-row ${f.enabled ? '' : 'filter-disabled'}"
           draggable="true" data-filter-id="${f.id}" data-fcat="${this.id}">
        <button class="filter-toggle" data-ftoggle="${f.id}" data-fcat="${this.id}"
                title="${f.enabled ? 'Disable' : 'Enable'}">${f.enabled ? '●' : '○'}</button>
        <select class="filter-type-sel" data-ftype="${f.id}" data-fcat="${this.id}">
          <option value="saturation"  ${f.type==='saturation'  ?'selected':''}>Saturation</option>
          <option value="brightness"  ${f.type==='brightness'  ?'selected':''}>Brightness</option>
          <option value="hueShift"    ${f.type==='hueShift'    ?'selected':''}>Hue Shift</option>
          <option value="contrast"    ${f.type==='contrast'    ?'selected':''}>Contrast</option>
          <option value="temperature" ${f.type==='temperature' ?'selected':''}>Temperature</option>
        </select>
        <input type="range" class="filter-amount" min="-100" max="100" value="${f.amount}"
               data-famount="${f.id}" data-fcat="${this.id}">
        <span class="filter-val">${f.amount > 0 ? '+' : ''}${Math.round(f.amount)}</span>
        <button class="filter-del cat-btn danger" data-fdel="${f.id}" data-fcat="${this.id}">✕</button>
      </div>
    `).join('');
    return `
      <div class="filter-chain" data-fchain="${this.id}">
        <div class="filter-chain-header">
          <span class="filter-chain-label">Filters</span>
          <button class="cat-btn filter-add-btn" data-fadd="${this.id}">+ Add</button>
        </div>
        ${rows}
      </div>`;
  }

  /**
   * Full row markup for the palette list. `headerHTML` is passed in because
   * the generated palette's header depends on app-level state (current
   * HSV/RGB, anchor toggle) that this class deliberately doesn't own.
   */
  renderRowHTML(headerHTML) {
    const draggable = this.isGenerated ? '' : 'draggable="true"';
    const empty = this.colors.length === 0 ? 'empty' : '';
    return `
      <div class="cat-row ${this.isGenerated ? 'generated-cat' : ''} ${empty}"
           data-cat="${this.id}" ${draggable}>
        ${headerHTML}
        <div class="cat-swatches">${this.renderSwatchesHTML()}</div>
        <div class="cat-drop-zone">${this.isGenerated ? 'Click ⟳ Generate above' : 'Drop colors here or click + Add above'}</div>
        ${this.renderFilterChainHTML()}
      </div>`;
  }

  // ── Serialization ───────────────────────────────────────────────────────
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      isGenerated: this.isGenerated,
      colors: this.colors.map(c => c.toJSON()),
      filters: this.filters,
    };
  }

  static fromJSON(obj) {
    return new Palette(obj.name, {
      id: obj.id,
      isGenerated: obj.isGenerated,
      colors: (obj.colors ?? []).map(Swatch.fromJSON),
      filters: obj.filters ?? [],
    });
  }
}

// ─── FocusedSwatch ────────────────────────────────────────────────────────────
class FocusedSwatch {
  /**
   * A stripped-down swatch for fullscreen/focused display — just shows
   * color, nothing else. No draggable, no lock/remove buttons.
   */
  constructor(hex, opts = {}) {
    this.id  = opts.id ?? uid();
    this.hex = hex;
  }

  /** Build a FocusedSwatch from a regular Swatch, optionally with its
   *  filtered display hex (pass in cat.getDisplayHex(swatch) for that). */
  static fromSwatch(swatch, displayHex) {
    return new FocusedSwatch(displayHex ?? swatch.hex, { id: swatch.id });
  }

  renderHTML(catId) {
    return `
      <div class="focused-swatch" style="background:${this.hex}"
           data-hex="${this.hex}" data-cat-id="${catId}" data-color="${this.id}"
           title="${this.hex}"></div>`;
  }
}

// ─── FocusedPalette ───────────────────────────────────────────────────────────
class FocusedPalette {
  /** Constant minimum swatch width (px) before a new row starts. */
  static MIN_SWATCH_WIDTH = 120;

  /**
   * Wraps an existing Palette for fullscreen display inside #palette-section.
   * Renders header-free — just a responsive grid of FocusedSwatch tiles that
   * fills the container, as large as possible, wrapping once tiles would
   * drop below minSwatchWidth.
   */
  constructor(palette, opts = {}) {
    this.palette         = palette; // the underlying Palette instance
    this.minSwatchWidth  = opts.minSwatchWidth ?? FocusedPalette.MIN_SWATCH_WIDTH;
  }

  get id()   { return this.palette.id; }
  get name() { return this.palette.name; }

  /** FocusedSwatch instances built from the source palette's current colors + filters */
  buildSwatches() {
    return this.palette.colors.map(c =>
      FocusedSwatch.fromSwatch(c, this.palette.getDisplayHex(c)));
  }

  renderSwatchesHTML() {
    return this.buildSwatches().map(fs => fs.renderHTML(this.palette.id)).join('');
  }

  /**
   * @param {string} toolbarHTML optional markup (e.g. an "exit fullscreen"
   *   button) rendered above the swatch grid — pass '' for none.
   */
  renderHTML(toolbarHTML = '') {
    return `
      <div class="focused-palette" data-cat="${this.palette.id}"
           style="--focused-min-w:${this.minSwatchWidth}px">
        ${toolbarHTML}
        <div class="focused-swatches">${this.renderSwatchesHTML()}</div>
      </div>`;
  }
}

// ─── FloatingToolbar ──────────────────────────────────────────────────────────
class FloatingToolbar {
  /**
   * A draggable, semi-transparent floating toolbar. Mounts itself directly
   * to the DOM (document.body by default) — no markup needed in index.html.
   *
   * Buttons are plain data: { id, icon, label, onClick, visible }.
   * `icon` is the button's rendered content (emoji or short text/HTML),
   * `label` becomes its title/tooltip. Visibility is per-button so callers
   * can show/hide buttons based on context (e.g. only show "Delete" when
   * something is selected) without touching layout code.
   *
   * The leftmost button is always the built-in expand/collapse toggle.
   * Collapsed → only that button renders. Expanded → all *visible* buttons
   * render, and the toolbar grows to fit them.
   *
   * Dragging: pointerdown anywhere on the toolbar that isn't a .toolbar-btn
   * starts a drag; pointer position is tracked with the Pointer Events API
   * (consistent with the rest of the app), and the toolbar's fixed x/y is
   * updated live.
   */
  constructor(opts = {}) {
    this.id        = opts.id ?? uid();
    this.buttons   = [];
    this.collapsed = opts.collapsed ?? false;
    this.x         = opts.x ?? 20;
    this.y         = opts.y ?? 20;
    this._drag     = null;

    this.el = document.createElement('div');
    this.el.className = 'floating-toolbar';
    this.el.style.left = `${this.x}px`;
    this.el.style.top  = `${this.y}px`;

    this._attachDragHandlers();
    this.mount(opts.parent);
    this.render();
  }

  mount(parent = document.body) {
    parent.appendChild(this.el);
    return this;
  }
  remove() { this.el.remove(); }

  // ── Button management ─────────────────────────────────────────────────
  addButton({ id, icon, label, onClick, visible = true } = {}) {
    const btn = { id: id ?? uid(), icon, label, onClick, visible };
    this.buttons.push(btn);
    this.render();
    return btn;
  }
  removeButton(id) {
    this.buttons = this.buttons.filter(b => b.id !== id);
    this.render();
  }
  findButton(id) { return this.buttons.find(b => b.id === id); }

  setButtonVisible(id, visible) {
    const b = this.findButton(id);
    if (b) { b.visible = visible; this.render(); }
  }

  /** Batch-update visibility, e.g. setContext({ 'delete': hasSelection, 'export': true }) */
  setContext(visibilityById) {
    for (const [id, visible] of Object.entries(visibilityById)) {
      const b = this.findButton(id);
      if (b) b.visible = visible;
    }
    this.render();
  }

  // ── Collapse / expand ───────────────────────────────────────────────────
  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.render();
  }

  // ── Drag (Pointer Events) ───────────────────────────────────────────────
  _attachDragHandlers() {
    this.el.addEventListener('pointerdown', e => {
      if (e.target.closest('.toolbar-btn')) return; // buttons don't drag
      this._drag = { startX: e.clientX, startY: e.clientY, origX: this.x, origY: this.y };
      this.el.setPointerCapture(e.pointerId);
      this.el.classList.add('dragging');
    });
    this.el.addEventListener('pointermove', e => {
      if (!this._drag) return;
      this.x = this._drag.origX + (e.clientX - this._drag.startX);
      this.y = this._drag.origY + (e.clientY - this._drag.startY);
      this.el.style.left = `${this.x}px`;
      this.el.style.top  = `${this.y}px`;
    });
    const endDrag = () => { this._drag = null; this.el.classList.remove('dragging'); };
    this.el.addEventListener('pointerup', endDrag);
    this.el.addEventListener('pointercancel', endDrag);
  }

  // ── Render (rebuild content + reattach listeners, same pattern as renderPalette) ──
  render() {
    const visible = this.buttons.filter(b => b.visible);

    const expandBtnHTML = `
      <button class="toolbar-btn toolbar-expand-btn" data-tb-toggle
              title="${this.collapsed ? 'Expand' : 'Collapse'}">${this.collapsed ? '▸' : '◂'}</button>`;

    const otherButtonsHTML = this.collapsed ? '' : visible.map(b => `
      <button class="toolbar-btn" data-tb-btn="${b.id}" title="${b.label ?? ''}">${b.icon ?? b.label ?? '•'}</button>
    `).join('');

    this.el.classList.toggle('collapsed', this.collapsed);
    this.el.innerHTML = expandBtnHTML + otherButtonsHTML;

    this.el.querySelector('[data-tb-toggle]').addEventListener('click', () => this.toggleCollapse());

    if (!this.collapsed) {
      visible.forEach(b => {
        const btnEl = this.el.querySelector(`[data-tb-btn="${b.id}"]`);
        if (btnEl && b.onClick) btnEl.addEventListener('click', b.onClick);
      });
    }
  }
}
