/* =============================================================
   GAME REVIEW ENGINE
   Real Stockfish analysis + chess.com-compatible classification
   and Lichess-published accuracy mathematics.

   Sources for the maths:
   - Expected-points classification thresholds: chess.com support
     "How are moves classified?" (Best 0.00, Excellent <=0.02,
      Good <=0.05, Inaccuracy <=0.10, Mistake <=0.20, Blunder >0.20)
   - Win%  = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
   - Move accuracy% = 103.1668 * exp(-0.04354 * winLoss) - 3.1669
   - Game accuracy = mean( volatility-weighted mean , harmonic mean )
   ============================================================= */

const PIECE_VALUE = { p: 100, n: 300, b: 320, r: 500, q: 900, k: 20000 };

const CLASS_META = {
  brilliant:  { key: 'brilliant',  label: 'Brilliant',  glyph: '!!', color: '#26c2a3', order: 0 },
  great:      { key: 'great',      label: 'Great Move', glyph: '!',  color: '#749bbf', order: 1 },
  best:       { key: 'best',       label: 'Best Move',  glyph: '★',  color: '#81b64c', order: 2 },
  excellent:  { key: 'excellent',  label: 'Excellent',  glyph: '✓',  color: '#81b64c', order: 3 },
  good:       { key: 'good',       label: 'Good',       glyph: '✓',  color: '#95b776', order: 4 },
  book:       { key: 'book',       label: 'Book',       glyph: '📖', color: '#a88865', order: 5 },
  inaccuracy: { key: 'inaccuracy', label: 'Inaccuracy', glyph: '?!', color: '#f7c631', order: 6 },
  mistake:    { key: 'mistake',    label: 'Mistake',    glyph: '?',  color: '#ffa459', order: 7 },
  miss:       { key: 'miss',       label: 'Miss',       glyph: '✗',  color: '#ff7769', order: 8 },
  blunder:    { key: 'blunder',    label: 'Blunder',    glyph: '??', color: '#fa412d', order: 9 }
};
const CLASS_ORDER = Object.keys(CLASS_META).sort((a, b) => CLASS_META[a].order - CLASS_META[b].order);

/* ---------------------------------------------------------------
   Score helpers
   --------------------------------------------------------------- */

/** Normalise an engine score object to a centipawn number for Win% purposes. */
function scoreToCp(score) {
  if (!score) return 0;
  if (score.mate !== null && score.mate !== undefined) {
    return score.mate > 0 ? 1500 : -1500;
  }
  return Math.max(-1500, Math.min(1500, score.cp || 0));
}

/** Win% (0..100) from the perspective of the side the score belongs to. */
function winPct(score) {
  const cp = scoreToCp(score);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Flip a score to the other side's perspective. */
function negScore(score) {
  if (!score) return { cp: 0, mate: null };
  return {
    cp: score.cp === null || score.cp === undefined ? null : -score.cp,
    mate: score.mate === null || score.mate === undefined ? null : -score.mate
  };
}

/** Human-readable eval, always from White's point of view. */
function formatEvalWhite(score) {
  if (!score) return '0.00';
  if (score.mate !== null && score.mate !== undefined) {
    return (score.mate > 0 ? 'M' : '-M') + Math.abs(score.mate);
  }
  const pawns = (score.cp || 0) / 100;
  const abs = Math.abs(pawns);
  const txt = abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  return (pawns > 0 ? '+' : pawns < 0 ? '-' : '') + txt;
}

/** Move accuracy % from a Win% loss (percentage points). */
function moveAccuracy(winLoss) {
  const v = 103.1668 * Math.exp(-0.04354 * Math.max(0, winLoss)) - 3.1669;
  return Math.max(0, Math.min(100, v));
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
}

/* ---------------------------------------------------------------
   Static Exchange Evaluation — used for sacrifice detection
   --------------------------------------------------------------- */

function seeOnSquare(fen, square, depth = 0) {
  if (depth > 12) return 0;
  let g;
  try { g = new Chess(fen); } catch (e) { return 0; }
  const caps = g.moves({ verbose: true }).filter(m => m.to === square && m.captured);
  if (!caps.length) return 0;
  caps.sort((a, b) => PIECE_VALUE[a.piece] - PIECE_VALUE[b.piece]);
  const m = caps[0];
  const captured = PIECE_VALUE[m.captured] || 0;
  const promo = m.promotion ? (PIECE_VALUE[m.promotion] - PIECE_VALUE.p) : 0;
  g.move({ from: m.from, to: m.to, promotion: m.promotion });
  const gain = captured + promo - seeOnSquare(g.fen(), square, depth + 1);
  return Math.max(0, gain);
}

function bestCaptureGain(fen) {
  let g;
  try { g = new Chess(fen); } catch (e) { return 0; }
  if (g.game_over()) return 0;
  const targets = {};
  g.moves({ verbose: true }).forEach(m => { if (m.captured) targets[m.to] = true; });
  let best = 0;
  Object.keys(targets).forEach(sq => { best = Math.max(best, seeOnSquare(fen, sq)); });
  return best;
}

/** Material balance from `color`'s perspective, in centipawns (kings ignored). */
function materialBalance(fen, color) {
  const board = fen.split(' ')[0];
  let bal = 0;
  for (const ch of board) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
    const lower = ch.toLowerCase();
    if (lower === 'k') continue;
    const v = PIECE_VALUE[lower] || 0;
    const isWhite = ch === ch.toUpperCase();
    bal += (isWhite === (color === 'w')) ? v : -v;
  }
  return bal;
}

/**
 * Did this move give up material that the opponent can simply take?
 * Compares our material balance before the move with the balance we
 * expect after the opponent's best capture sequence.
 */
function detectSacrifice(fenBefore, fenAfter, color) {
  const before = materialBalance(fenBefore, color);
  const after = materialBalance(fenAfter, color);
  const oppGain = bestCaptureGain(fenAfter);
  const expected = after - oppGain;
  return { isSacrifice: (before - expected) >= 180, amount: before - expected };
}

/* ---------------------------------------------------------------
   Classification
   --------------------------------------------------------------- */

function classifyMove(ctx) {
  const {
    playedUci, bestUci, bestScore, secondScore, afterScore,
    isBook, fenBefore, fenAfter, color, isMateDelivered
  } = ctx;

  const winBest = winPct(bestScore);
  const winAfter = winPct(afterScore);
  const playedBest = playedUci === bestUci;
  let loss = playedBest ? 0 : Math.max(0, winBest - winAfter);

  // Expected-points thresholds (chess.com Classification V2)
  let cls;
  if (playedBest || loss <= 0.5) cls = 'best';
  else if (loss <= 2) cls = 'excellent';
  else if (loss <= 5) cls = 'good';
  else if (loss <= 10) cls = 'inaccuracy';
  else if (loss <= 20) cls = 'mistake';
  else cls = 'blunder';

  // Mate delivered is always the best possible outcome
  if (isMateDelivered) cls = 'best';

  const winSecond = secondScore ? winPct(secondScore) : null;
  const onlyMoveGap = winSecond === null ? 0 : (winBest - winSecond);

  // --- Miss: a concrete win was on the board and got thrown away
  const hadForcedMate = bestScore && bestScore.mate > 0;
  const keptForcedMate = afterScore && afterScore.mate > 0;
  if (!isMateDelivered && loss > 10 &&
      ((winBest >= 75 && winAfter < 55) || (hadForcedMate && !keptForcedMate))) {
    cls = 'miss';
  }

  // --- Book: known opening theory (only while still in the book)
  if (isBook) cls = 'book';

  // --- Great / Brilliant (only for moves that are essentially best)
  if (!isBook && loss <= 2 && winBest > 3) {
    const sac = detectSacrifice(fenBefore, fenAfter, color);
    const notLosingAfter = winAfter >= 45;
    const notAlreadyWinning = winSecond === null ? winBest < 92 : winSecond < 85;

    if (sac.isSacrifice && notLosingAfter && notAlreadyWinning) {
      cls = 'brilliant';
    } else if (onlyMoveGap >= 10 && winBest <= 97) {
      cls = 'great';
    }
  }

  return {
    cls,
    loss,
    winBest,
    winAfter,
    onlyMoveGap,
    accuracy: moveAccuracy(loss)
  };
}

/* ---------------------------------------------------------------
   Coach commentary
   --------------------------------------------------------------- */

function coachText(m) {
  const alt = m.bestSan;
  const swing = m.loss.toFixed(1);
  switch (m.cls) {
    case 'brilliant':
      return `${m.san} is brilliant. You gave up material and the engine confirms the sacrifice is completely sound — the compensation is worth more than the material.`;
    case 'great':
      return `${m.san} was the only move that held the position together. Every alternative gives up at least ${m.onlyMoveGap.toFixed(0)}% of your winning chances.`;
    case 'best':
      return `${m.san} is the engine's top choice. Nothing better exists in this position.`;
    case 'excellent':
      return `${m.san} is excellent. ${alt ? `${alt} was the engine's pick, but ` : ''}your move keeps everything that matters — only ${swing}% of winning chances given up.`;
    case 'good':
      return `${m.san} is a good, solid move. ${alt ? `${alt} was slightly stronger. ` : ''}You conceded ${swing}% of your winning chances.`;
    case 'book':
      return `${m.san} is established opening theory${m.openingName ? ` — ${m.openingName}` : ''}.`;
    case 'inaccuracy':
      return `${m.san} is an inaccuracy. ${alt ? `${alt} was clearly better. ` : ''}This move costs ${swing}% of your winning chances.`;
    case 'mistake':
      return `${m.san} is a mistake that measurably worsens your position. ${alt ? `${alt} was the move — ` : ''}you lost ${swing}% of your winning chances.`;
    case 'miss':
      return `Missed chance. You had a winning position here${alt ? ` and ${alt} converts it` : ''}, but ${m.san} lets it slip away — ${swing}% of winning chances gone.`;
    case 'blunder':
      return `${m.san} is a blunder. ${alt ? `${alt} was necessary. ` : ''}This hands over ${swing}% of your winning chances.`;
    default:
      return m.san;
  }
}

/* ---------------------------------------------------------------
   Accuracy aggregation (Lichess method)
   --------------------------------------------------------------- */

function computeAccuracies(moves, winPercentsWhite) {
  const n = moves.length;
  if (!n) return { w: 100, b: 100 };
  const windowSize = Math.max(2, Math.min(8, Math.ceil(n / 10)));

  // weight per ply = volatility (std dev of Win% in a sliding window)
  const weights = moves.map((_, i) => {
    const start = Math.max(0, Math.min(i - windowSize + 1, winPercentsWhite.length - windowSize));
    const win = winPercentsWhite.slice(Math.max(0, start), Math.max(0, start) + windowSize);
    return Math.max(0.5, Math.min(12, stdDev(win)));
  });

  const out = {};
  ['w', 'b'].forEach(color => {
    const idx = [];
    moves.forEach((m, i) => { if (m.color === color) idx.push(i); });
    if (!idx.length) { out[color] = 100; return; }

    const accs = idx.map(i => moves[i].accuracy);
    const ws = idx.map(i => weights[i]);

    const wSum = ws.reduce((a, b) => a + b, 0);
    const weightedMean = wSum > 0 ? accs.reduce((a, v, k) => a + v * ws[k], 0) / wSum
                                  : accs.reduce((a, b) => a + b, 0) / accs.length;
    const harmonic = accs.length / accs.reduce((a, v) => a + 1 / Math.max(1, v), 0);

    out[color] = Math.max(0, Math.min(100, (weightedMean + harmonic) / 2));
  });
  return out;
}

/** Transparent rating estimate from accuracy and error density. */
function estimateRating(accuracy, counts, plies) {
  const anchors = [[40, 500], [50, 800], [60, 1050], [70, 1300], [78, 1550], [85, 1850], [90, 2100], [94, 2400], [97, 2650], [100, 2850]];
  let est;
  if (accuracy <= anchors[0][0]) est = anchors[0][1] * (accuracy / anchors[0][0]);
  else {
    est = anchors[anchors.length - 1][1];
    for (let i = 1; i < anchors.length; i++) {
      if (accuracy <= anchors[i][0]) {
        const [x0, y0] = anchors[i - 1], [x1, y1] = anchors[i];
        est = y0 + (y1 - y0) * (accuracy - x0) / (x1 - x0);
        break;
      }
    }
  }
  const movesPlayed = Math.max(1, plies);
  const errRate = ((counts.blunder || 0) * 1.0 + (counts.miss || 0) * 0.8 + (counts.mistake || 0) * 0.5) / movesPlayed;
  est -= errRate * 900;
  const brillBonus = ((counts.brilliant || 0) * 40 + (counts.great || 0) * 20);
  est += brillBonus;
  return Math.round(Math.max(250, Math.min(2900, est)) / 25) * 25;
}

/* ---------------------------------------------------------------
   SAN helpers
   --------------------------------------------------------------- */

function uciToSan(fen, uci) {
  if (!uci) return null;
  try {
    const g = new Chess(fen);
    const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
    return mv ? mv.san : null;
  } catch (e) { return null; }
}

function uciLineToSan(fen, uciArray, max = 10) {
  const out = [];
  try {
    const g = new Chess(fen);
    for (let i = 0; i < Math.min(uciArray.length, max); i++) {
      const u = uciArray[i];
      const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : 'q' });
      if (!mv) break;
      out.push(mv.san);
    }
  } catch (e) {}
  return out;
}

/* ---------------------------------------------------------------
   Main review runner
   --------------------------------------------------------------- */

/**
 * @param {Array} history  chess.js verbose history array
 * @param {Object} opts    { depth, onProgress(done,total,label) }
 * @returns review object
 */
async function runGameReview(history, opts = {}) {
  const depth = opts.depth || 16;
  const onProgress = opts.onProgress || function () {};
  const startFen = opts.startFen || null;

  // ---- 1. rebuild every position of the game
  const walker = startFen ? new Chess(startFen) : new Chess();
  const fens = [walker.fen()];
  const sans = [];
  const moveObjs = [];
  for (const h of history) {
    const mv = walker.move({ from: h.from, to: h.to, promotion: h.promotion });
    if (!mv) break;
    moveObjs.push(mv);
    sans.push(mv.san);
    fens.push(walker.fen());
  }
  const N = moveObjs.length;
  if (!N) return null;

  // ---- 2. analyse every position once with MultiPV 2
  const total = N + 1;
  const results = new Array(total);
  for (let i = 0; i < total; i++) {
    const probe = new Chess(fens[i]);
    if (probe.game_over()) {
      results[i] = { terminal: true, inCheckmate: probe.in_checkmate(), lines: [], bestmove: null, depth: 0 };
    } else {
      /* eslint-disable no-await-in-loop */
      results[i] = await Engine.analyse(fens[i], { depth, multipv: 2, tag: 'review', maxTime: 8000 });
    }
    onProgress(i + 1, total, `Analysing position ${i + 1} of ${total}`);
  }

  // ---- 3. per-position score from the mover's point of view
  function posScore(i) {
    const r = results[i];
    if (!r) return { cp: 0, mate: null };
    if (r.terminal) {
      // the side to move is checkmated (lost) or the game is drawn
      return r.inCheckmate ? { cp: null, mate: -1 } : { cp: 0, mate: null };
    }
    const l = r.lines[0];
    if (!l) return { cp: 0, mate: null };
    return { cp: l.cp === null || l.cp === undefined ? null : l.cp, mate: l.mate === null || l.mate === undefined ? null : l.mate };
  }
  function posSecondScore(i) {
    const r = results[i];
    if (!r || r.terminal || r.lines.length < 2) return null;
    const l = r.lines[1];
    return { cp: l.cp === null || l.cp === undefined ? null : l.cp, mate: l.mate === null || l.mate === undefined ? null : l.mate };
  }

  // ---- 4. classify each move
  const moves = [];
  const winPercentsWhite = [];
  const counts = { w: {}, b: {} };
  let bookPly = 0;

  // Win% of the starting position from White's view
  {
    const s = posScore(0);
    winPercentsWhite.push(fens[0].split(' ')[1] === 'w' ? winPct(s) : 100 - winPct(s));
  }

  for (let i = 0; i < N; i++) {
    const mv = moveObjs[i];
    const color = mv.color;
    const fenBefore = fens[i];
    const fenAfter = fens[i + 1];
    const playedUci = mv.from + mv.to + (mv.promotion || '');

    const bestScore = posScore(i);
    const secondScore = posSecondScore(i);
    const bestUci = results[i].terminal ? null : (results[i].lines[0] ? results[i].lines[0].move : results[i].bestmove);

    // score after the move, converted to the mover's point of view
    const afterRaw = posScore(i + 1);
    const afterScore = results[i + 1] && results[i + 1].terminal
      ? (results[i + 1].inCheckmate ? { cp: null, mate: 1 } : { cp: 0, mate: null })
      : negScore(afterRaw);

    const sanSoFar = sans.slice(0, i + 1);
    const stillBook = !startFen && bookPly === i && OpeningBook.isBook(sanSoFar);
    if (stillBook) bookPly = i + 1;

    const isMateDelivered = !!(results[i + 1] && results[i + 1].terminal && results[i + 1].inCheckmate);

    const c = classifyMove({
      playedUci, bestUci, bestScore, secondScore, afterScore,
      isBook: stillBook, fenBefore, fenAfter, color, isMateDelivered
    });

    const bestSan = bestUci && bestUci !== playedUci ? uciToSan(fenBefore, bestUci) : null;
    const bestLineSan = results[i].terminal || !results[i].lines[0]
      ? [] : uciLineToSan(fenBefore, results[i].lines[0].pv, 8);

    const evalWhiteAfter = color === 'w' ? afterScore : negScore(afterScore);

    const record = {
      ply: i,
      moveNumber: Math.floor(i / 2) + 1,
      color,
      san: mv.san,
      uci: playedUci,
      from: mv.from,
      to: mv.to,
      fenBefore,
      fenAfter,
      cls: c.cls,
      loss: c.loss,
      accuracy: c.accuracy,
      winBefore: c.winBest,
      winAfter: c.winAfter,
      onlyMoveGap: c.onlyMoveGap,
      bestUci,
      bestSan,
      bestLineSan,
      evalAfterWhite: evalWhiteAfter,
      evalAfterText: formatEvalWhite(evalWhiteAfter),
      depth: results[i].depth || 0,
      openingName: null
    };
    record.comment = coachText(record);
    moves.push(record);

    counts[color][c.cls] = (counts[color][c.cls] || 0) + 1;

    winPercentsWhite.push(color === 'w' ? c.winAfter : 100 - c.winAfter);
  }

  // attach opening name to the last book move
  const opening = OpeningBook.identify(sans);
  if (opening) {
    const idx = Math.min(opening.ply, moves.length) - 1;
    if (moves[idx]) {
      moves[idx].openingName = `${opening.name} (${opening.eco})`;
      moves[idx].comment = coachText(moves[idx]);
    }
  }

  const accuracy = computeAccuracies(moves, winPercentsWhite);

  const plyCount = { w: moves.filter(m => m.color === 'w').length, b: moves.filter(m => m.color === 'b').length };

  return {
    depth,
    engine: Engine.label,
    moves,
    fens,
    winPercentsWhite,
    counts,
    accuracy,
    opening: opening ? `${opening.name} (${opening.eco})` : 'Unknown Opening',
    rating: {
      w: estimateRating(accuracy.w, counts.w, plyCount.w),
      b: estimateRating(accuracy.b, counts.b, plyCount.b)
    }
  };
}

window.ChessReview = {
  runGameReview, CLASS_META, CLASS_ORDER, winPct, formatEvalWhite,
  moveAccuracy, uciToSan, uciLineToSan, scoreToCp, negScore, detectSacrifice
};
