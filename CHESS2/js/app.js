/* =============================================================
   Application controller
   ============================================================= */

const $ = (id) => document.getElementById(id);
const CM = ChessReview.CLASS_META;
const CORDER = ChessReview.CLASS_ORDER;

const State = {
  mode: document.getElementById('modeSelect')?.value || 'pass',
  game: new Chess(),
  startFen: null,
  history: [],          // verbose move objects
  cursor: -1,           // -1 = start position
  view: 'play',
  mode: 'bot',
  playerColor: 'w',
  botLevel: 3,
  orientation: 'white',
  review: null,
  reviewing: false,
  liveEnabled: true,
  showArrows: true,
  botThinking: false,
  gameOverShown: false
};

let board = null;

/* =============================================================
   Sound
   ============================================================= */
const Sfx = {
  ctx: null, buf: {},
  urls: {
    move: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3',
    opponent: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-opponent.mp3',
    capture: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3',
    check: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-check.mp3',
    castle: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/castle.mp3',
    end: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3',
    illegal: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/illegal.mp3',
    promote: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/promote.mp3'
  },
  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { this.ctx = new AC(); } catch (e) {} }
    const unlock = () => { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); };
    ['pointerdown', 'keydown'].forEach(e => window.addEventListener(e, unlock, { capture: true, passive: true }));
    Object.keys(this.urls).forEach(async k => {
      try {
        const r = await fetch(this.urls[k]);
        if (!r.ok || !this.ctx) return;
        this.buf[k] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) {}
    });
  },
  play(k) {
    if (!this.ctx || !this.buf[k]) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[k];
    s.connect(this.ctx.destination);
    s.start(0);
  },
  forMove(mv, chess, byOpponent) {
    if (chess.in_checkmate() || chess.in_draw()) { this.play('end'); return; }
    if (chess.in_check()) { this.play('check'); return; }
    if (mv.flags.indexOf('k') !== -1 || mv.flags.indexOf('q') !== -1) { this.play('castle'); return; }
    if (mv.promotion) { this.play('promote'); return; }
    if (mv.captured) { this.play('capture'); return; }
    this.play(byOpponent ? 'opponent' : 'move');
  }
};

/* =============================================================
   Helpers
   ============================================================= */

function toast(msg, ms = 2000) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

/** chess.js instance for the position at cursor index (-1 = start). */
function gameAt(index) {
  const g = State.startFen ? new Chess(State.startFen) : new Chess();
  for (let i = 0; i <= index; i++) {
    const h = State.history[i];
    g.move({ from: h.from, to: h.to, promotion: h.promotion });
  }
  return g;
}

function fenAt(index) { return gameAt(index).fen(); }
function isLive() { return State.cursor === State.history.length - 1; }

function kingSquare(chess, color) {
  const b = chess.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = b[r][f];
    if (p && p.type === 'k' && p.color === color) return 'abcdefgh'[f] + (8 - r);
  }
  return null;
}

const GLYPH_UNICODE = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };

/* Read captures straight off the move list up to the cursor. Diffing material
   against the start position would miscount promotions as losses. */
function capturedSummary() {
  const taken = { w: { q: 0, r: 0, b: 0, n: 0, p: 0 }, b: { q: 0, r: 0, b: 0, n: 0, p: 0 } };
  for (let i = 0; i <= State.cursor && i < State.history.length; i++) {
    const m = State.history[i];
    if (m && m.captured) taken[m.color][m.captured]++;
  }
  const out = { w: '', b: '' };
  ['w', 'b'].forEach(c => {
    ['q', 'r', 'b', 'n', 'p'].forEach(t => { out[c] += GLYPH_UNICODE[t].repeat(taken[c][t]); });
  });
  return out;
}

/* =============================================================
   Rendering
   ============================================================= */

function renderBoard(animate = true, lastMove = null) {
  const g = gameAt(State.cursor);
  board.setPosition(g.fen(), animate);

  const mv = lastMove || (State.cursor >= 0 ? State.history[State.cursor] : null);
  board.highlightMove(mv ? mv.from : null, mv ? mv.to : null);
  board.setCheck(g.in_check() ? kingSquare(g, g.turn()) : null);
  board.clearBadges();

  if (State.review && State.cursor >= 0 && State.review.moves[State.cursor]) {
    const m = State.review.moves[State.cursor];
    const meta = CM[m.cls];
    board.setBadges([{ square: m.to, glyph: meta.glyph, color: meta.color, dark: m.cls === 'inaccuracy' }]);
  }
  renderPlayerCards();
}

function renderPlayerCards() {
  const cap = capturedSummary();
  const topColor = State.orientation === 'white' ? 'b' : 'w';
  const botColor = topColor === 'w' ? 'b' : 'w';

  const nameOf = (c) => {
    const hdr = State.names && State.names[c];
    if (hdr) return hdr;
    if (State.mode === 'bot') {
      const label = $('difficultySelect').selectedOptions[0].textContent.split('·')[0].trim();
      return c === State.playerColor ? 'You' : `Bot · ${label}`;
    }
    return c === 'w' ? 'White' : 'Black';
  };

  $('pcNameTop').textContent = nameOf(topColor);
  $('pcNameBottom').textContent = nameOf(botColor);
  $('pcAvatarTop').textContent = topColor === 'w' ? '♔' : '♚';
  $('pcAvatarBottom').textContent = botColor === 'w' ? '♔' : '♚';
  $('pcCapturedTop').textContent = cap[topColor];
  $('pcCapturedBottom').textContent = cap[botColor];

  if (State.review) {
    const a = State.review.accuracy;
    $('pcAccTop').hidden = false;
    $('pcAccBottom').hidden = false;
    $('pcAccTop').textContent = a[topColor].toFixed(1) + '%';
    $('pcAccBottom').textContent = a[botColor].toFixed(1) + '%';
  } else {
    $('pcAccTop').hidden = true;
    $('pcAccBottom').hidden = true;
  }
}

function renderEvalBar(whiteWinPct, text, blackAhead) {
  // Allow 0% and 100% for decisive outcomes, while clamping normal evaluation moves
  const height = (whiteWinPct >= 100) ? 100 : (whiteWinPct <= 0) ? 0 : Math.max(2, Math.min(98, whiteWinPct));
  
  $('evalFill').style.height = height + '%';
  $('evalNum').textContent = text;
  $('evalBar').classList.toggle('black-ahead', !!blackAhead);
}

function renderMoves() {
  const grid = $('movesGrid');
  const n = State.history.length;
  $('movesEmpty').hidden = n > 0;
  if (!n) { grid.innerHTML = ''; return; }

  let html = '';
  for (let i = 0; i < n; i += 2) {
    html += `<div class="mv-num">${i / 2 + 1}.</div>`;
    html += moveCell(i);
    html += (i + 1 < n) ? moveCell(i + 1) : '<div class="mv empty"></div>';
  }
  grid.innerHTML = html;
  // scroll the move list container only — scrollIntoView would also scroll the page
  const active = grid.querySelector('.mv.active');
  const box = $('movesScroll');
  if (active && box) {
    const top = active.offsetTop, bottom = top + active.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }
}

function moveCell(i) {
  const h = State.history[i];
  const r = State.review && State.review.moves[i];
  const ico = r ? `<span class="mv-ico" style="background:${CM[r.cls].color};${r.cls === 'inaccuracy' ? 'color:#1c1b19;' : ''}">${CM[r.cls].glyph}</span>` : '';
  return `<button class="mv ${State.cursor === i ? 'active' : ''}" data-i="${i}">${ico}<span class="mv-san">${h.san}</span></button>`;
}

function renderCoach() {
  const card = $('coachCard');
  if (!State.review || State.cursor < 0 || !State.review.moves[State.cursor]) { card.hidden = true; return; }
  const m = State.review.moves[State.cursor];
  const meta = CM[m.cls];
  card.hidden = false;
  card.style.borderLeftColor = meta.color;
  $('coachBadge').style.background = meta.color;
  $('coachBadge').style.color = m.cls === 'inaccuracy' ? '#1c1b19' : '#fff';
  $('coachBadge').textContent = meta.glyph;
  $('coachTitle').textContent = `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san} — ${meta.label}`;
  $('coachEval').textContent = m.evalAfterText;
  $('coachText').textContent = m.comment;

  const alt = $('coachAlt');
  if (m.bestSan && m.bestLineSan.length) {
    alt.hidden = false;
    alt.innerHTML = `Engine line: <b>${m.bestLineSan[0]}</b> ${m.bestLineSan.slice(1).join(' ')}`;
  } else { alt.hidden = true; }
}

/* =============================================================
   Live engine analysis
   =============================================================*/

let liveToken = 0;

function runLive() {
  if (State.reviewing) return;
  const fen = fenAt(State.cursor);
  const g = gameAt(State.cursor);

  // invalidate any in-flight live search first, otherwise a late result for the
  // previous position repaints stale arrows and a stale evaluation
  const my = ++liveToken;
  Engine.cancelTag('live');
  $('engFen').textContent = fen;

  if (g.game_over()) {
    const mated = g.in_checkmate();
    $('pvList').innerHTML = `<div class="pv-empty">${mated ? 'Checkmate — no moves to analyse.' : 'Game over — drawn position.'}</div>`;
    $('engDepth').textContent = 'd --';
    $('engNodes').textContent = mated ? 'Mate on the board' : 'Drawn position';
    board.setArrows([]);
    if (mated) {
      const whiteWon = g.turn() === 'b';
      renderEvalBar(whiteWon ? 100 : 0, whiteWon ? '1-0' : '0-1', !whiteWon);
    } else {
      renderEvalBar(50, '\u00bd-\u00bd', false);
    }
    return;
  }
  if (!Engine.ready) return;

  const multipv = parseInt($('linesSelect').value, 10) || 3;

  Engine.analyse(fen, {
    depth: 18, multipv, tag: 'live', maxTime: 4500,
    onInfo: (info) => { if (my === liveToken) paintLive(info, fen, g); }
  }).then(res => { if (my === liveToken && res.lines.length) paintLive(res, fen, g); });
}

function paintLive(info, fen, g) {
  const turn = fen.split(' ')[1];
  $('engDepth').textContent = 'd ' + (info.depth || '--');
  if (info.nodes > 0) {
    const nodes = info.nodes >= 1e6 ? (info.nodes / 1e6).toFixed(1) + 'M' : (info.nodes / 1000).toFixed(0) + 'k';
    $('engNodes').textContent = info.nps > 0 ? `${nodes} nodes · ${(info.nps / 1000).toFixed(0)}k n/s` : `${nodes} nodes`;
  } else {
    $('engNodes').textContent = '';
  }

  const lines = info.lines.filter(l => l && l.pv && l.pv.length);
  if (!lines.length) return;

  // eval bar (white POV)
  const topWhite = turn === 'w' ? lines[0] : ChessReview.negScore(lines[0]);
  let wp = ChessReview.winPct(topWhite);

  // Force 100% for White forced mate or 0% for Black forced mate
  if (topWhite.mate != null) {
    wp = topWhite.mate > 0 ? 100 : 0;
  }

  renderEvalBar(wp, ChessReview.formatEvalWhite(topWhite), wp < 50);

  // pv rows
  $('pvList').innerHTML = lines.map(l => {
    const white = turn === 'w' ? l : ChessReview.negScore(l);
    const txt = ChessReview.formatEvalWhite(white);
    const sanLine = ChessReview.uciLineToSan(fen, l.pv, 9);
    const first = sanLine[0] || '';
    return `<div class="pv-row" data-uci="${l.pv[0]}">
      <span class="pv-score ${(white.mate != null ? white.mate > 0 : (white.cp || 0) >= 0) ? 'pos' : 'neg'}">${txt}</span>
      <span class="pv-moves"><b>${first}</b> ${sanLine.slice(1).join(' ')}</span>
    </div>`;
  }).join('');

  // arrows
  if (State.showArrows && !State.review) {
    const colors = ['#f7a01d', '#5b8fd6', '#9b8ec4', '#7d7a76', '#6c6a66'];
    board.setArrows(lines.slice(0, 3).map((l, i) => ({
      from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4),
      color: colors[i], width: i === 0 ? 15 : 11, opacity: i === 0 ? 0.9 : 0.55
    })));
  } else if (!State.review) {
    board.setArrows([]);
  }
}
/* =============================================================
   Moves & game flow
   ============================================================= */

function attemptMove(from, to) {
  if (State.reviewing) return false;
  const g = gameAt(State.cursor);

  // moving from a browsed position rewrites the game from there
  const legal = g.moves({ verbose: true }).filter(m => m.from === from && m.to === to);
  if (!legal.length) { Sfx.play('illegal'); return false; }

  if (State.mode === 'bot' && g.turn() !== State.playerColor && !State.botThinking) {
    // allow it anyway in bot mode only if it is the player's turn
    return false;
  }

  if (legal.some(m => m.promotion)) {
    openPromotion(g.turn(), (piece) => { commitMove(from, to, piece); });
    return true;
  }
  return commitMove(from, to, null);
}

function commitMove(from, to, promotion) {
  const g = gameAt(State.cursor);
  const mv = g.move({ from, to, promotion: promotion || 'q' });
  if (!mv) { Sfx.play('illegal'); return false; }

  if (State.cursor < State.history.length - 1) State.history = State.history.slice(0, State.cursor + 1);
  State.history.push(mv);
  State.cursor = State.history.length - 1;
  State.review = null;
  State.gameOverShown = false;

  Sfx.forMove(mv, g, false);
  afterPositionChange(true, mv);
  maybeBotMove();
  return true;
}

function afterPositionChange(animate = true, lastMove = null) {
  renderBoard(animate, lastMove);
  renderMoves();
  renderCoach();
  updateReviewGate();
  const g = gameAt(State.cursor);

  // Hook checkGameStatus here
  if (g.game_over() && isLive() && !State.gameOverShown) {
    if (typeof checkGameStatus === 'function') {
      checkGameStatus(g);
    } else {
      showGameOver(g);
    }
  }

  if (State.review) applyReviewEval();
  else runLive();
}

function applyReviewEval() {
  const w = State.review.winPercentsWhite[State.cursor + 1];
  const m = State.cursor >= 0 ? State.review.moves[State.cursor] : null;
  const txt = m ? m.evalAfterText : '0.00';
  renderEvalBar(w, txt, w < 50);
  // chess.com only draws an arrow when there was a clearly better move; strong
  // moves are communicated by the square highlight and the badge alone
  const weak = m && ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(m.cls);
  if (weak && m.bestUci && State.showArrows) {
    const arrows = [{ from: m.bestUci.slice(0, 2), to: m.bestUci.slice(2, 4), color: '#81b64c', width: 13, opacity: 0.85 }];
    if (m.bestUci.slice(0, 4) !== m.from + m.to) {
      arrows.unshift({ from: m.from, to: m.to, color: CM[m.cls].color, width: 13, opacity: 0.7 });
    }
    board.setArrows(arrows);
  } else {
    board.setArrows([]);
  }
}

function showGameOver(g) {
  State.gameOverShown = true;
  let title = 'Draw', sub = '';
  if (g.in_checkmate()) { title = (g.turn() === 'w' ? 'Black' : 'White') + ' wins'; sub = 'by checkmate'; }
  else if (g.in_stalemate()) sub = 'by stalemate';
  else if (g.in_threefold_repetition()) sub = 'by repetition';
  else if (g.insufficient_material()) sub = 'insufficient material';
  else sub = 'by the 50-move rule';
  $('ovTitle').textContent = title;
  $('ovSub').textContent = sub;
  $('boardOverlay').hidden = false;
  Sfx.play('end');
}

function maybeBotMove() {
  if (State.mode !== 'bot' || State.reviewing) return;
  const g = gameAt(State.cursor);
  if (g.game_over() || g.turn() === State.playerColor) return;
  if (!Engine.ready) return;

  State.botThinking = true;
  const level = parseInt($('difficultySelect').value, 10);
  const cfg = {
    1: { depth: 1, multipv: 4, noise: 0.55 },
    2: { depth: 3, multipv: 3, noise: 0.35 },
    3: { depth: 6, multipv: 3, noise: 0.18 },
    4: { depth: 10, multipv: 2, noise: 0.07 },
    5: { depth: 14, multipv: 1, noise: 0 },
    6: { depth: 20, multipv: 1, noise: 0 }
  }[level] || { depth: 6, multipv: 2, noise: 0.2 };

  const fen = g.fen();
  Engine.cancelTag('live');
  Engine.analyse(fen, { depth: cfg.depth, multipv: cfg.multipv, tag: 'bot', maxTime: 6000 }).then(res => {
    State.botThinking = false;
    if (fen !== fenAt(State.cursor)) return;   // position moved on
    let uci = res.bestmove;
    const lines = res.lines.filter(l => l.pv && l.pv.length);
    if (cfg.noise > 0 && lines.length > 1 && Math.random() < cfg.noise) {
      uci = lines[1 + Math.floor(Math.random() * (lines.length - 1))].pv[0];
    }
    if (level === 1 && Math.random() < 0.3) {
      const all = g.moves({ verbose: true });
      const r = all[Math.floor(Math.random() * all.length)];
      uci = r.from + r.to + (r.promotion || '');
    }
    if (!uci) return;

    const g2 = gameAt(State.cursor);
    const mv = g2.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
    if (!mv) return;
    State.history.push(mv);
    State.cursor = State.history.length - 1;
    State.review = null;
    Sfx.forMove(mv, g2, true);
    afterPositionChange(true, mv);
  });
}

/* =============================================================
   Promotion
   ============================================================= */

function openPromotion(color, cb) {
  const row = $('promoRow');
  row.innerHTML = ['q', 'r', 'b', 'n'].map(p =>
    `<button class="promo-btn" data-p="${p}" aria-label="${p}"
      style="background-image:url('https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${color}${p}.png')"></button>`
  ).join('');
  $('promoModal').hidden = false;
  row.querySelectorAll('.promo-btn').forEach(b => {
    b.onclick = () => { $('promoModal').hidden = true; cb(b.dataset.p); };
  });
}

/* =============================================================
   Navigation
   ============================================================= */

function goTo(i) {
  const clamped = Math.max(-1, Math.min(State.history.length - 1, i));
  if (clamped === State.cursor) return;
  const forward = clamped > State.cursor;
  State.cursor = clamped;
  const g = gameAt(State.cursor);
  renderBoard(true);
  renderMoves();
  renderCoach();
  if (State.cursor >= 0 && forward) {
    const h = State.history[State.cursor];
    Sfx.forMove(h, g, false);
  }
  if (State.review) applyReviewEval(); else runLive();
  $('boardOverlay').hidden = true;
}

/* =============================================================
   Review
   ============================================================= */

function updateReviewGate() {
  const n = State.history.length;
  $('btnStartReview').disabled = n < 2;
  $('rvNote').textContent = n < 2
    ? 'Play or load a game with at least two moves first.'
    : `${n} moves ready · ${Math.ceil((n + 1))} positions will be analysed.`;
}

function setReviewState(which) {
  ['rvIdle', 'rvRunning', 'rvReport'].forEach(id => { $(id).hidden = (id !== which); });
}

async function startReview() {
  if (State.history.length < 2) { toast('Play or load a game first'); return; }
  if (!Engine.ready) { toast('Engine is still loading'); return; }

  switchView('review');
  State.reviewing = true;
  State.review = null;
  Engine.cancelTag('live');
  board.setArrows([]);
  board.clearBadges();
  setReviewState('rvRunning');

  const depth = parseInt($('reviewDepth').value, 10) || 16;
  const t0 = performance.now();

  try {
    const review = await ChessReview.runGameReview(State.history, {
      depth,
      startFen: State.startFen,
      onProgress: (done, total, label) => {
        const pct = Math.round(done / total * 100);
        $('rvPct').textContent = pct + '%';
        $('rvRing').style.setProperty('--p', pct);
        $('rvBarFill').style.width = pct + '%';
        const elapsed = (performance.now() - t0) / 1000;
        const eta = done > 1 ? Math.max(0, (elapsed / done) * (total - done)) : null;
        $('rvLabel').textContent = label + (eta !== null ? ` · ~${Math.ceil(eta)}s left` : '');
      }
    });
    if (!State.reviewing) return;          // cancelled
    State.review = review;
    State.reviewing = false;
    renderReport();
    setReviewState('rvReport');
    State.cursor = -1;
    goTo(0);
    Sfx.play('end');
  } catch (e) {
    State.reviewing = false;
    setReviewState('rvIdle');
    toast('Review failed: ' + e.message);
  }
}

function cancelReview() {
  State.reviewing = false;
  Engine.cancelTag('review');
  setReviewState('rvIdle');
  runLive();
}

function renderReport() {
  const R = State.review;
  $('accWhite').textContent = R.accuracy.w.toFixed(1);
  $('accBlack').textContent = R.accuracy.b.toFixed(1);
  $('accEngine').textContent = `Stockfish 16 · d${R.depth}`;
  $('ratWhite').textContent = R.rating.w;
  $('ratBlack').textContent = R.rating.b;
  $('rvOpening').textContent = R.opening;

  // breakdown
  $('breakdown').innerHTML = CORDER.map(k => {
    const meta = CM[k];
    const w = R.counts.w[k] || 0, b = R.counts.b[k] || 0;
    if (w === 0 && b === 0 && (k === 'brilliant' || k === 'great' || k === 'miss')) return '';
    return `<div class="brk-row">
      <span class="brk-n ${w ? '' : 'zero'}">${w}</span>
      <span class="brk-mid">
        <span class="brk-ico" style="background:${meta.color};${k === 'inaccuracy' ? 'color:#1c1b19;' : ''}">${meta.glyph}</span>
        <span class="brk-label">${meta.label}</span>
      </span>
      <span class="brk-n ${b ? '' : 'zero'}">${b}</span>
    </div>`;
  }).join('');

  // key moments
  const interesting = R.moves
    .filter(m => ['brilliant', 'great', 'blunder', 'miss', 'mistake'].indexOf(m.cls) !== -1)
    .sort((a, b) => {
      const rank = { brilliant: 0, great: 1, blunder: 2, miss: 3, mistake: 4 };
      return rank[a.cls] - rank[b.cls] || b.loss - a.loss;
    })
    .slice(0, 7)
    .sort((a, b) => a.ply - b.ply);

  $('momentsList').innerHTML = interesting.length ? interesting.map(m => {
    const meta = CM[m.cls];
    return `<div class="moment" data-i="${m.ply}">
      <span class="brk-ico" style="background:${meta.color};${m.cls === 'inaccuracy' ? 'color:#1c1b19;' : ''}">${meta.glyph}</span>
      <span class="moment-move">${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}</span>
      <span class="moment-txt">${meta.label}${m.loss >= 1 ? ` · −${m.loss.toFixed(0)}%` : ''}</span>
    </div>`;
  }).join('') : '<div class="moments-empty">No mistakes worth flagging — a clean game.</div>';

  drawGraph();
  renderMoves();
  renderPlayerCards();
}

/* ---------------- eval graph ---------------- */

function drawGraph() {
  const R = State.review;
  const cv = $('evalGraph');
  if (!R || !cv) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 340, h = 120;
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = '100%'; cv.style.height = h + 'px';
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const pts = R.winPercentsWhite;
  const n = pts.length;
  const xAt = (i) => n <= 1 ? 0 : (i / (n - 1)) * w;
  const yAt = (v) => h - (v / 100) * h;

  // background = black's territory
  c.fillStyle = '#3b3835';
  c.fillRect(0, 0, w, h);

  // white's territory below the curve
  c.beginPath();
  c.moveTo(0, h);
  for (let i = 0; i < n; i++) c.lineTo(xAt(i), yAt(pts[i]));
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = '#f0efed';
  c.fill();

  // midline
  c.strokeStyle = 'rgba(0,0,0,.35)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();

  // markers for significant moves
  R.moves.forEach(m => {
    if (['blunder', 'miss', 'mistake', 'brilliant', 'great'].indexOf(m.cls) === -1) return;
    const x = xAt(m.ply + 1), y = yAt(pts[m.ply + 1]);
    c.beginPath();
    c.arc(x, Math.max(4, Math.min(h - 4, y)), 3.4, 0, Math.PI * 2);
    c.fillStyle = CM[m.cls].color;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.stroke();
  });

  // cursor
  if (State.cursor >= -1) {
    const x = xAt(State.cursor + 1);
    c.strokeStyle = '#81b64c'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
  }

  cv.onclick = (e) => {
    const rect = cv.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
    goTo(i - 1);
    drawGraph();
  };
}

/* =============================================================
   Views
   ============================================================= */

function switchView(v) {
  State.view = v;
  document.querySelectorAll('.topnav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.ptab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== v; });
  if (v === 'review') {
    if (State.review) { setReviewState('rvReport'); requestAnimationFrame(drawGraph); }
    else if (!State.reviewing) setReviewState('rvIdle');
    updateReviewGate();
  }
}

/* =============================================================
   New game / load
   ============================================================= */

function newGame() {
  State.game = new Chess();
  State.names = null;
  State.startFen = null;
  State.history = [];
  State.cursor = -1;
  State.review = null;
  State.gameOverShown = false;
  $('boardOverlay').hidden = true;

  let pc = $('playerColorSelect').value;
  if (pc === 'random') pc = Math.random() < 0.5 ? 'w' : 'b';
  State.playerColor = pc;
  State.mode = $('modeSelect').value;
  if (State.mode === 'bot') board.setOrientation(pc === 'w' ? 'white' : 'black');
  State.orientation = board.orientation;

  setReviewState('rvIdle');
  afterPositionChange(false);
  maybeBotMove();
}

/* Robust PGN reader: chess.js 0.10.x needs a blank line between headers and
   movetext, so try the raw text, a normalised variant, then a manual SAN pass. */
function parsePgn(raw) {
  const attempts = [raw];
  if (/\]\s*\n(?!\s*\n)/.test(raw)) attempts.push(raw.replace(/\]\s*\n(?!\s*\n)/g, ']\n\n'));
  const stripped = raw.replace(/\[[^\]]*\]/g, '').trim();
  if (stripped && stripped !== raw) attempts.push(stripped);

  for (const text of attempts) {
    const c = new Chess();
    try { if (c.load_pgn(text, { sloppy: true }) && c.history().length) return c; } catch (e) {}
  }

  // last resort: tokenise SAN moves and replay them
  const cleaned = stripped
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\s*\.(\.\.)?/g, ' ')
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const c = new Chess();
  let played = 0;
  for (const t of tokens) {
    const mv = c.move(t, { sloppy: true });
    if (!mv) break;
    played++;
  }
  return played >= 2 ? c : null;
}

function loadInput(text) {
  const raw = (text || '').trim();
  if (!raw) return;
  const probe = parsePgn(raw);

  if (probe && probe.history().length) {
    const hdr = probe.header() || {};
    State.names = (hdr.White || hdr.Black)
      ? { w: hdr.White || 'White', b: hdr.Black || 'Black' }
      : null;
    State.startFen = null;
    State.history = probe.history({ verbose: true });
    State.cursor = State.history.length - 1;
    State.review = null;
    State.mode = 'pass';
    $('modeSelect').value = 'pass';
    syncModeFields();
    $('boardOverlay').hidden = true;
    State.gameOverShown = true;
    afterPositionChange(false);
    toast(`Loaded ${State.history.length} moves`);
    switchView('review');
    return;
  }

  const probe2 = new Chess();
  if (probe2.load(raw)) {
    State.startFen = raw;
    State.history = [];
    State.cursor = -1;
    State.review = null;
    $('boardOverlay').hidden = true;
    afterPositionChange(false);
    toast('Position loaded');
    return;
  }
  toast('Could not read that PGN or FEN');
}

const SAMPLE_PGN = [
  '[Event "Paris opera house"]',
  '[Site "Paris FRA"]',
  '[Date "1858.??.??"]',
  '[White "Paul Morphy"]',
  '[Black "Duke Karl / Count Isouard"]',
  '[Result "1-0"]',
  '',
  '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7',
  '8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7',
  '14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0',
  ''
].join('\n');

/* =============================================================
   Bindings
   ============================================================= */

function syncModeFields() {
  const bot = $('modeSelect').value === 'bot';
  $('colorField').style.display = bot ? '' : 'none';
  $('difficultyField').style.display = bot ? '' : 'none';
}
function addSafeListener(id, event, callback) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(event, callback);
  }
}
function bind() {
  document.querySelectorAll('.topnav-btn, .ptab').forEach(b => {
    b.addEventListener('click', () => switchView(b.dataset.view));
  });

  $('btnNewGame')?.addEventListener('click', newGame);
  $('ovNew')?.addEventListener('click', newGame);
  $('ovReview')?.addEventListener('click', startReview);
  $('btnStartReview')?.addEventListener('click', startReview);
  $('btnReviewAgain')?.addEventListener('click', () => { setReviewState('rvIdle'); State.review = null; afterPositionChange(false); });
  $('btnCancelReview')?.addEventListener('click', cancelReview);

  $('btnUndo')?.addEventListener('click', () => {
    if (!State.history.length) return;
    State.history.pop();
    if (State.mode === 'bot' && State.history.length) {
      const last = State.history[State.history.length - 1];
      if (last.color !== State.playerColor) State.history.pop();
    }
    State.cursor = State.history.length - 1;
    State.review = null;
    State.gameOverShown = false;
    $('boardOverlay').hidden = true;
    setReviewState('rvIdle');
    afterPositionChange(true);
  });

  $('btnFlip')?.addEventListener('click', () => { board.flip(); State.orientation = board.orientation; renderPlayerCards(); });
  $('btnCopyFEN')?.addEventListener('click', () => {
    navigator.clipboard.writeText(fenAt(State.cursor)).then(() => toast('FEN copied'), () => toast('Copy blocked by the browser'));
  });
  $('btnCopyPGN')?.addEventListener('click', () => {
    navigator.clipboard.writeText(gameAt(State.history.length - 1).pgn()).then(() => toast('PGN copied'), () => toast('Copy blocked by the browser'));
  });

  $('btnLoad')?.addEventListener('click', () => loadInput($('pgnFenInput').value));
  $('pgnFenInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadInput($('pgnFenInput').value); });
  $('btnSample')?.addEventListener('click', () => { $('pgnFenInput').value = ''; loadInput(SAMPLE_PGN); });

  $('modeSelect')?.addEventListener('change', () => { syncModeFields(); newGame(); });
  $('playerColorSelect')?.addEventListener('change', newGame);
  $('difficultySelect')?.addEventListener('change', () => { renderPlayerCards(); });
  $('linesSelect')?.addEventListener('change', runLive);
  $('arrowToggle')?.addEventListener('change', e => {
    State.showArrows = e.target.checked;
    if (!State.showArrows) board.setArrows([]);
    else if (State.review) applyReviewEval(); else runLive();
  });

  $('btnFirst')?.addEventListener('click', () => { goTo(-1); drawGraph(); });
  $('btnPrev')?.addEventListener('click', () => { goTo(State.cursor - 1); drawGraph(); });
  $('btnNext')?.addEventListener('click', () => { goTo(State.cursor + 1); drawGraph(); });
  $('btnLast')?.addEventListener('click', () => { goTo(State.history.length - 1); drawGraph(); });

  $('movesGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('.mv[data-i]');
    if (btn) { goTo(parseInt(btn.dataset.i, 10)); drawGraph(); }
  });
  $('momentsList')?.addEventListener('click', e => {
    const m = e.target.closest('.moment[data-i]');
    if (m) { goTo(parseInt(m.dataset.i, 10)); drawGraph(); }
  });
  $('pvList')?.addEventListener('click', e => {
    const row = e.target.closest('.pv-row[data-uci]');
    if (!row) return;
    const u = row.dataset.uci;
    attemptMove(u.slice(0, 2), u.slice(2, 4));
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') { goTo(State.cursor - 1); drawGraph(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { goTo(State.cursor + 1); drawGraph(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { goTo(-1); drawGraph(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { goTo(State.history.length - 1); drawGraph(); e.preventDefault(); }
    else if (e.key.toLowerCase() === 'f') { board.flip(); State.orientation = board.orientation; renderPlayerCards(); }
  });

  window.addEventListener('resize', () => { if (State.review) drawGraph(); });
}

/* =============================================================
   Boot
   ============================================================= */

function boot() {
  board = new ChessBoard($('board'), {
    orientation: 'white',
    onDragStart: (sq, code) => {
      if (State.reviewing) return false;
      const g = gameAt(State.cursor);
      if (g.game_over()) return false;
      if (code[0] !== g.turn()) return false;
      if (State.mode === 'bot' && code[0] !== State.playerColor) return false;
      return true;
    },
    onDrop: (from, to) => attemptMove(from, to),
    onSquareClick: (sq) => {
      const g = gameAt(State.cursor);
      const legal = g.moves({ verbose: true }).filter(m => m.from === sq);
      board.setSelected(sq);
      board.showLegal(legal.filter(m => !m.captured).map(m => m.to), legal.filter(m => m.captured).map(m => m.to));
    }
  });

  syncModeFields();
  Sfx.init();
  afterPositionChange(false);
  bind();

  Engine.on('ready', (s) => {
    const chip = $('engineChip');
    $('engineChipText').textContent = s.ok ? s.label : (s.label || 'Engine');
    chip.classList.toggle('loading', !!s.loading);
    chip.classList.toggle('failed', !s.ok && !s.loading);
    if (s.ok) {
      $('engName').textContent = s.label;
      runLive();
      maybeBotMove();
    }
  });
  Engine.boot();
}

document.addEventListener('DOMContentLoaded', boot);

window.State = State;
