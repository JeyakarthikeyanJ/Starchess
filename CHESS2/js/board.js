/* =============================================================
   Custom chess board renderer — chess.com style
   ============================================================= */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PIECE_URL = (code) =>
  `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${code.toLowerCase()}.png`;

function fenToMap(fen) {
  const rows = fen.split(' ')[0].split('/');
  const map = {};
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '9') { f += parseInt(ch, 10); continue; }
      const sq = FILES[f] + (8 - r);
      map[sq] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
      f++;
    }
  }
  return map;
}

class ChessBoard {
  constructor(el, opts = {}) {
    this.el = el;
    this.orientation = opts.orientation || 'white';
    this.onDragStart = opts.onDragStart || (() => false);
    this.onDrop = opts.onDrop || (() => false);
    this.onSquareClick = opts.onSquareClick || (() => {});
    this.interactive = opts.interactive !== false;

    this.pieces = {};
    this.selected = null;
    this.drag = null;
    this._userArrows = [];
    this._engineArrows = [];
    this._userHighlights = [];

    this._build();
    this._bind();
  }

  _build() {
    this.el.classList.add('cb-board');
    this.el.innerHTML = '';

    // 1. Squares (Bottom)
    this.squaresLayer = document.createElement('div');
    this.squaresLayer.className = 'cb-squares';
    this.squaresLayer.style.zIndex = '1';
    this.el.appendChild(this.squaresLayer);

    // 2. Markers & Highlights (Under the pieces)
    this.markerLayer = document.createElement('div');
    this.markerLayer.className = 'cb-layer cb-markers';
    this.markerLayer.style.zIndex = '2';
    this.markerLayer.style.pointerEvents = 'none';
    this.el.appendChild(this.markerLayer);

    // 3. Pieces (Above square highlights)
    this.piecesLayer = document.createElement('div');
    this.piecesLayer.className = 'cb-layer cb-pieces';
    this.piecesLayer.style.zIndex = '3';
    this.el.appendChild(this.piecesLayer);

    // 4. Arrows (Above pieces, clicks pass through)
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'cb-layer cb-arrows');
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.style.zIndex = '4';
    this.svg.style.pointerEvents = 'none';
    this.el.appendChild(this.svg);

    // 5. Badges (Top layer)
    this.badgeLayer = document.createElement('div');
    this.badgeLayer.className = 'cb-layer cb-badges';
    this.badgeLayer.style.zIndex = '5';
    this.badgeLayer.style.pointerEvents = 'none';
    this.el.appendChild(this.badgeLayer);

    this._renderSquares();
  }

  _renderSquares() {
    this.squaresLayer.innerHTML = '';
    this.squareEls = {};
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const sq = this._xyToSquare(x, y);
        const file = FILES.indexOf(sq[0]);
        const rank = parseInt(sq[1], 10) - 1;
        const d = document.createElement('div');
        d.className = 'cb-sq ' + ((file + rank) % 2 === 0 ? 'dark' : 'light');
        d.dataset.square = sq;
        d.style.left = (x * 12.5) + '%';
        d.style.top = (y * 12.5) + '%';
        if (x === 0) {
          const s = document.createElement('span');
          s.className = 'cb-coord cb-rank';
          s.textContent = sq[1];
          d.appendChild(s);
        }
        if (y === 7) {
          const s = document.createElement('span');
          s.className = 'cb-coord cb-file';
          s.textContent = sq[0];
          d.appendChild(s);
        }
        this.squaresLayer.appendChild(d);
        this.squareEls[sq] = d;
      }
    }
  }

  _xyToSquare(x, y) {
    return this.orientation === 'white' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
  }

  _squareToXY(sq) {
    const f = FILES.indexOf(sq[0]);
    const r = parseInt(sq[1], 10) - 1;
    return this.orientation === 'white' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  }

  _pointToSquare(clientX, clientY) {
    const rect = this.el.getBoundingClientRect();
    const size = rect.width / 8;
    const x = Math.floor((clientX - rect.left) / size);
    const y = Math.floor((clientY - rect.top) / size);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return this._xyToSquare(x, y);
  }

  setPosition(fen, animate = true) {
    const target = fenToMap(fen);
    const current = this.pieces;

    const removals = [];
    const additions = [];
    Object.keys(current).forEach(sq => {
      if (target[sq] !== current[sq].code) removals.push(sq);
    });
    Object.keys(target).forEach(sq => {
      if (!current[sq] || current[sq].code !== target[sq]) additions.push(sq);
    });

    const used = new Set();
    additions.forEach(to => {
      const code = target[to];
      let bestFrom = null, bestDist = Infinity;
      removals.forEach(from => {
        if (used.has(from) || current[from].code !== code) return;
        const a = this._squareToXY(from), b = this._squareToXY(to);
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (d < bestDist) { bestDist = d; bestFrom = from; }
      });
      if (bestFrom) {
        used.add(bestFrom);
        const entry = current[bestFrom];
        delete current[bestFrom];
        if (current[to]) { this._fadeOut(current[to].el); delete current[to]; }
        entry.el.classList.toggle('cb-anim', animate);
        this._place(entry.el, to);
        current[to] = entry;
      }
    });

    removals.forEach(sq => {
      if (used.has(sq)) return;
      if (current[sq] && target[sq] !== current[sq].code) {
        this._fadeOut(current[sq].el);
        delete current[sq];
      }
    });

    Object.keys(target).forEach(sq => {
      if (current[sq] && current[sq].code === target[sq]) return;
      if (current[sq]) { this._fadeOut(current[sq].el); delete current[sq]; }
      const el = document.createElement('div');
      el.className = 'cb-piece';
      el.style.backgroundImage = `url("${PIECE_URL(target[sq])}")`;
      el.dataset.piece = target[sq];
      this._place(el, sq);
      this.piecesLayer.appendChild(el);
      current[sq] = { code: target[sq], el };
    });

    Object.keys(current).forEach(sq => { current[sq].el.dataset.square = sq; });
  }

  _place(el, sq) {
    const { x, y } = this._squareToXY(sq);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    el.dataset.square = sq;
  }

  _fadeOut(el) {
    el.classList.add('cb-fade');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 140);
  }

  flip() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this._renderSquares();
    Object.keys(this.pieces).forEach(sq => this._place(this.pieces[sq].el, sq));
    this._redrawMarkers();
    this._redrawArrows();
    this._redrawBadges();
  }

  setOrientation(o) { if (o !== this.orientation) this.flip(); }

  _redrawMarkers() {
    this.markerLayer.innerHTML = '';
    (this._markers || []).forEach(m => this._drawMarker(m));
    (this._userHighlights || []).forEach(sq => this._drawMarker({ square: sq, type: 'user' }));
  }

  setMarkers(list) { this._markers = list || []; this._redrawMarkers(); }

  _drawMarker(m) {
    const file = m.square.charCodeAt(0) - 97;
    const rank = parseInt(m.square[1], 10) - 1;
    const isFlipped = this.orientation === 'black';
    const col = isFlipped ? 7 - file : file;
    const row = isFlipped ? rank : 7 - rank;

    const d = document.createElement('div');
    d.className = 'cb-marker cb-marker-' + m.type;
    d.style.left = (col * 12.5) + '%';
    d.style.top = (row * 12.5) + '%';
    if (m.color) d.style.setProperty('--mc', m.color);
    this.markerLayer.appendChild(d);
  }

  highlightMove(from, to) {
    const keep = (this._markers || []).filter(m => m.type !== 'last');
    this._markers = keep.concat(from && to ? [{ square: from, type: 'last' }, { square: to, type: 'last' }] : []);
    this._redrawMarkers();
  }

  showLegal(squares, captures) {
    this._markers = (this._markers || []).filter(m => m.type !== 'dot' && m.type !== 'ring' && m.type !== 'sel');
    (squares || []).forEach(sq => this._markers.push({ square: sq, type: 'dot' }));
    (captures || []).forEach(sq => this._markers.push({ square: sq, type: 'ring' }));
    this._redrawMarkers();
  }

  clearLegal() {
    this._markers = (this._markers || []).filter(m => m.type !== 'dot' && m.type !== 'ring' && m.type !== 'sel');
    this._redrawMarkers();
  }

  setSelected(sq) {
    this.selected = sq;
    this._markers = (this._markers || []).filter(m => m.type !== 'sel');
    if (sq) this._markers.push({ square: sq, type: 'sel' });
    this._redrawMarkers();
  }

  setCheck(sq) {
    this._markers = (this._markers || []).filter(m => m.type !== 'check');
    if (sq) this._markers.push({ square: sq, type: 'check' });
    this._redrawMarkers();
  }

  setArrows(list) {
    this._engineArrows = list && list.length > 0 ? [list[0]] : [];
    this._redrawArrows();
  }

  clearArrows() {
    this._engineArrows = [];
    this._userArrows = [];
    this._redrawArrows();
  }

  _redrawArrows() {
    this.svg.innerHTML = '';
    const allArrows = [...(this._engineArrows || []), ...(this._userArrows || [])];
    if (!allArrows.length) return;

    const isFlipped = this.orientation === 'black';

    const getCenter = (sq) => {
      const file = sq.charCodeAt(0) - 97;
      const rank = parseInt(sq[1], 10) - 1;
      const col = isFlipped ? 7 - file : file;
      const row = isFlipped ? rank : 7 - rank;
      return {
        x: (col + 0.5) * 100,
        y: (row + 0.5) * 100,
        fileDiff: file,
        rankDiff: rank
      };
    };

    allArrows.forEach(a => {
      const start = getCenter(a.from);
      const end = getCenter(a.to);
      const color = a.color || 'rgba(150, 88, 212, 0.85)';

      const df = Math.abs(end.fileDiff - start.fileDiff);
      const dr = Math.abs(end.rankDiff - start.rankDiff);
      const isKnightMove = (df === 1 && dr === 2) || (df === 2 && dr === 1);

      const shaftWidth = 20;
      const headWidth = 40;
      const headLength = 32;
      const tailMargin = 30;

      if (isKnightMove) {
        const corner = {
          x: df === 2 ? end.x : start.x,
          y: df === 2 ? start.y : end.y
        };
        const u1 = { x: Math.sign(corner.x - start.x), y: Math.sign(corner.y - start.y) };
        const u2 = { x: Math.sign(end.x - corner.x), y: Math.sign(end.y - corner.y) };
        const n1 = { x: -u1.y, y: u1.x };
        const n2 = { x: -u2.y, y: u2.x };
        const r = shaftWidth / 2, hr = headWidth / 2;
        const pStart = { x: start.x + u1.x * tailMargin, y: start.y + u1.y * tailMargin };
        const hBase = { x: end.x - u2.x * headLength, y: end.y - u2.y * headLength };
        const turn = u1.x * u2.y - u1.y * u2.x;
        const s = turn > 0 ? 1 : -1;

        const aL = { x: pStart.x - n1.x * r, y: pStart.y - n1.y * r };
        const aR = { x: pStart.x + n1.x * r, y: pStart.y + n1.y * r };
        const cOuter = { x: corner.x - s * (n1.x + n2.x) * r, y: corner.y - s * (n1.y + n2.y) * r };
        const cInner = { x: corner.x + s * (n1.x + n2.x) * r, y: corner.y + s * (n1.y + n2.y) * r };
        const hBaseL = { x: hBase.x - n2.x * r, y: hBase.y - n2.y * r };
        const hBaseR = { x: hBase.x + n2.x * r, y: hBase.y + n2.y * r };
        const hWingL = { x: hBase.x - n2.x * hr, y: hBase.y - n2.y * hr };
        const hWingR = { x: hBase.x + n2.x * hr, y: hBase.y + n2.y * hr };
        const cL = turn > 0 ? cOuter : cInner;
        const cR = turn > 0 ? cInner : cOuter;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${aL.x} ${aL.y} L ${cL.x} ${cL.y} L ${hBaseL.x} ${hBaseL.y} L ${hWingL.x} ${hWingL.y} L ${end.x} ${end.y} L ${hWingR.x} ${hWingR.y} L ${hBaseR.x} ${hBaseR.y} L ${cR.x} ${cR.y} L ${aR.x} ${aR.y} Z`);
        path.setAttribute('fill', color);
        this.svg.appendChild(path);
      } else {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const shaftLen = len - headLength;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${tailMargin} ${-shaftWidth / 2} L ${shaftLen} ${-shaftWidth / 2} L ${shaftLen} ${-headWidth / 2} L ${len} 0 L ${shaftLen} ${headWidth / 2} L ${shaftLen} ${shaftWidth / 2} L ${tailMargin} ${shaftWidth / 2} Z`);
        path.setAttribute('fill', color);
        path.setAttribute('transform', `translate(${start.x}, ${start.y}) rotate(${(angle * 180) / Math.PI})`);
        this.svg.appendChild(path);
      }
    });
  }

  setBadges(list) { this._badges = list || []; this._redrawBadges(); }
  clearBadges() { this._badges = []; this._redrawBadges(); }

  _redrawBadges() {
    this.badgeLayer.innerHTML = '';
    (this._badges || []).forEach(b => {
      const { x, y } = this._squareToXY(b.square);
      const d = document.createElement('div');
      d.className = 'cb-badge';
      d.style.left = (x * 12.5) + '%';
      d.style.top = (y * 12.5) + '%';
      const inner = document.createElement('span');
      inner.className = 'cb-badge-in';
      inner.style.background = b.color;
      inner.textContent = b.glyph;
      if (b.dark) inner.style.color = '#1c1b19';
      d.appendChild(inner);
      this.badgeLayer.appendChild(d);
    });
  }

  _bind() {
    const down = (e) => {
      if (!this.interactive) return;

      const sq = this._pointToSquare(e.clientX, e.clientY);
      if (!sq) return;

      if (e.button === 2) {
        this.rightClickStart = sq;
        e.preventDefault();
        return;
      }

      if (e.button !== 0) return;

      if (this._userArrows.length || (this._userHighlights && this._userHighlights.length)) {
        this._userArrows = [];
        this._userHighlights = [];
        this._redrawArrows();
        this._redrawMarkers();
      }

      const entry = this.pieces[sq];
      const hasSelection = !!this.selected;

      if (hasSelection && this.selected === sq) {
        this.setSelected(null);
        this.clearLegal();
        return;
      }

      if (hasSelection) {
        const selEntry = this.pieces[this.selected];
        if (entry && selEntry && entry.code[0] === selEntry.code[0]) {
          this.setSelected(sq);
          this.onSquareClick(sq);
        } else {
          const ok = this.onDrop(this.selected, sq);
          if (ok) {
            this.setSelected(null);
            this.clearLegal();
            return;
          }
        }
      }

      if (!entry) {
        this.setSelected(null);
        this.clearLegal();
        return;
      }

      if (!this.onDragStart(sq, entry.code)) {
        this.setSelected(null);
        this.clearLegal();
        return;
      }

      this.setSelected(sq);
      this.onSquareClick(sq);

      const rect = this.el.getBoundingClientRect();
      const size = rect.width / 8;
      this.drag = {
        from: sq, el: entry.el, size,
        offX: e.clientX, offY: e.clientY,
        moved: false
      };
      entry.el.classList.add('cb-dragging');
      entry.el.classList.remove('cb-anim');
      e.preventDefault();
    };

    // The restored drag-move handler
    const move = (e) => {
      if (!this.drag) return;
      const d = this.drag;
      const dx = e.clientX - d.offX, dy = e.clientY - d.offY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      const { x, y } = this._squareToXY(d.from);
      d.el.style.transform = `translate(calc(${x * 100}% + ${dx}px), calc(${y * 100}% + ${dy}px))`;
      const over = this._pointToSquare(e.clientX, e.clientY);
      Object.keys(this.squareEls).forEach(s => this.squareEls[s].classList.toggle('cb-hover', s === over));
    };

    const up = (e) => {
      if (e.button === 2 && this.rightClickStart) {
        const targetSq = this._pointToSquare(e.clientX, e.clientY);
        if (targetSq === this.rightClickStart) {
          this._userHighlights = this._userHighlights || [];
          const idx = this._userHighlights.indexOf(targetSq);
          if (idx >= 0) this._userHighlights.splice(idx, 1);
          else this._userHighlights.push(targetSq);
          this._redrawMarkers();
        } else if (targetSq) {
          const existingIdx = this._userArrows.findIndex(
            a => a.from === this.rightClickStart && a.to === targetSq
          );
          if (existingIdx >= 0) {
            this._userArrows.splice(existingIdx, 1);
          } else {
            this._userArrows.push({
              from: this.rightClickStart,
              to: targetSq,
              color: 'rgba(150, 88, 212, 0.85)'
            });
          }
          this._redrawArrows();
        }
        this.rightClickStart = null;
        return;
      }

      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      d.el.classList.remove('cb-dragging');
      Object.keys(this.squareEls).forEach(s => this.squareEls[s].classList.remove('cb-hover'));
      const target = this._pointToSquare(e.clientX, e.clientY);

      if (!d.moved) { this._place(d.el, d.from); return; }
      if (!target || target === d.from) { this._place(d.el, d.from); return; }

      const ok = this.onDrop(d.from, target);
      if (!ok) {
        this._place(d.el, d.from);
      } else {
        this.setSelected(null);
        this.clearLegal();
      }
    };

    this.el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.el.addEventListener('contextmenu', e => e.preventDefault());
  }
}

window.ChessBoard = ChessBoard;