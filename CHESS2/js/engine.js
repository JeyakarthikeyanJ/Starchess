/* =============================================================
   Stockfish 16 NNUE engine wrapper — promise based, serial queue
   ============================================================= */

const ENGINE_SOURCES = [
  {
    label: 'Stockfish 16 NNUE',
    base: 'https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/',
    script: 'stockfish-nnue-16-single.js',
    wasm: 'stockfish-nnue-16-single.wasm',
    requiresSimd: true
  },
  {
    label: 'Stockfish 16',
    base: 'https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/',
    script: 'stockfish-nnue-16-no-simd.js',
    wasm: 'stockfish-nnue-16-no-simd.wasm',
    requiresSimd: false
  },
  {
    label: 'Stockfish 10',
    base: 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/',
    script: 'stockfish.js',
    wasm: null,
    requiresSimd: false
  }
];

function hasWasmSimd() {
  try {
    // minimal wasm module using v128
    return WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3,
      2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
    ]));
  } catch (e) { return false; }
}

const Engine = {
  worker: null,
  ready: false,
  label: '',
  booting: false,
  _queue: [],
  _active: null,
  _listeners: { ready: [], info: [] },

  on(evt, fn) { (this._listeners[evt] || (this._listeners[evt] = [])).push(fn); return this; },
  _emit(evt, payload) { (this._listeners[evt] || []).forEach(f => { try { f(payload); } catch (e) {} }); },

  /* ---------------- boot ---------------- */
  boot(index = 0) {
    if (this.booting || this.ready) return;
    const candidates = ENGINE_SOURCES.filter(s => !s.requiresSimd || hasWasmSimd());
    const src = candidates[index];
    if (!src) { this._emit('ready', { ok: false, label: 'Engine unavailable' }); return; }

    this.booting = true;
    this._emit('ready', { ok: false, loading: true, label: `Loading ${src.label}…` });

    fetch(src.base + src.script)
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
      .then(code => {
        // rewrite the relative .wasm reference to an absolute CDN URL
        const patched = src.wasm ? code.split(src.wasm).join(src.base + src.wasm) : code;
        const blob = new Blob([patched], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        let sawError = false;

        worker.onerror = () => {
          if (sawError) return;
          sawError = true;
          this.booting = false;
          try { worker.terminate(); } catch (e) {}
          this.boot(index + 1);
        };

        worker.onmessage = (ev) => {
          const raw = typeof ev.data === 'string' ? ev.data : (ev.data && ev.data.data) || '';
          for (const rawLine of String(raw).split('\n')) {
            const line = rawLine.trim();
            if (line) this._line(line, worker, src);
          }
        };

        this.worker = worker;
        worker.postMessage('uci');
      })
      .catch(() => { this.booting = false; this.boot(index + 1); });
  },

  _line(line, worker, src) {
    if (line === 'uciok') {
      worker.postMessage('setoption name Hash value 64');
      worker.postMessage('setoption name Threads value 1');
      worker.postMessage('setoption name UCI_AnalyseMode value true');
      worker.postMessage('isready');
      return;
    }
    if (line === 'readyok' && !this.ready) {
      this.ready = true;
      this.booting = false;
      this.label = src.label;
      this._emit('ready', { ok: true, label: src.label });
      this._pump();
      return;
    }
    const job = this._active;
    if (!job) return;

    if (line.startsWith('info ')) {
      const parsed = parseInfo(line);
      if (!parsed) return;
      if (parsed.depth >= (job.byDepth.depth || 0)) {
        if (parsed.depth > (job.byDepth.depth || 0)) { job.byDepth = { depth: parsed.depth, lines: {} }; }
        job.byDepth.lines[parsed.multipv] = parsed;
      }
      if (parsed.nodes) job.nodes = parsed.nodes;
      if (parsed.nps) job.nps = parsed.nps;
      if (job.onInfo) {
        job.onInfo({ depth: parsed.depth, lines: sortLines(job.byDepth.lines), nodes: job.nodes, nps: job.nps });
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      if (job.timer) clearTimeout(job.timer);
      const parts = line.split(/\s+/);
      const bestmove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
      let lines = sortLines(job.byDepth.lines);
      // keep the deepest complete snapshot; if empty (mate/stalemate) return empty
      const result = {
        fen: job.fen,
        depth: job.byDepth.depth || 0,
        bestmove,
        lines,
        nodes: job.nodes || 0,
        nps: job.nps || 0,
        cancelled: !!job.cancelled
      };
      this._active = null;
      job.resolve(result);
      this._pump();
      return;
    }
  },

  /* ---------------- public API ---------------- */

  /**
   * Analyse a position.
   * opts: { depth, multipv, movetime, tag, onInfo }
   * Returns Promise<{depth, bestmove, lines:[{multipv, cp, mate, pv:[uci], move}]}>
   */
  analyse(fen, opts = {}) {
    return new Promise((resolve) => {
      const job = {
        fen,
        depth: opts.depth || 16,
        multipv: opts.multipv || 1,
        movetime: opts.movetime || 0,
        maxTime: opts.maxTime || 0,
        tag: opts.tag || null,
        onInfo: opts.onInfo || null,
        byDepth: { depth: 0, lines: {} },
        resolve,
        cancelled: false
      };
      this._queue.push(job);
      this._pump();
    });
  },

  /** Drop everything queued with this tag; stop the running one if it matches. */
  cancelTag(tag) {
    this._queue = this._queue.filter(j => {
      if (j.tag === tag) { j.cancelled = true; j.resolve({ depth: 0, bestmove: null, lines: [], cancelled: true, fen: j.fen }); return false; }
      return true;
    });
    if (this._active && this._active.tag === tag) {
      this._active.cancelled = true;
      this.stop();
    }
  },

  stop() { if (this.worker && this._active) this.worker.postMessage('stop'); },

  get busy() { return !!this._active; },
  get queued() { return this._queue.length; },

  _pump() {
    if (!this.ready || !this.worker || this._active || !this._queue.length) return;
    const job = this._queue.shift();
    this._active = job;
    this.worker.postMessage(`setoption name MultiPV value ${job.multipv}`);
    this.worker.postMessage('position fen ' + job.fen);
    this.worker.postMessage(job.movetime ? `go movetime ${job.movetime}` : `go depth ${job.depth}`);
    if (job.maxTime) {
      job.timer = setTimeout(() => { if (this._active === job) this.worker.postMessage('stop'); }, job.maxTime);
    }
  }
};

function parseInfo(line) {
  if (line.indexOf(' pv ') === -1 && line.indexOf(' score ') === -1) return null;
  const t = line.split(/\s+/);
  const out = { multipv: 1, depth: 0, cp: null, mate: null, pv: [], nodes: 0, nps: 0 };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': out.depth = parseInt(t[++i], 10); break;
      case 'seldepth': i++; break;
      case 'multipv': out.multipv = parseInt(t[++i], 10); break;
      case 'nodes': out.nodes = parseInt(t[++i], 10); break;
      case 'nps': out.nps = parseInt(t[++i], 10); break;
      case 'score':
        if (t[i + 1] === 'cp') { out.cp = parseInt(t[i + 2], 10); i += 2; }
        else if (t[i + 1] === 'mate') { out.mate = parseInt(t[i + 2], 10); i += 2; }
        break;
      case 'pv': out.pv = t.slice(i + 1); i = t.length; break;
      default: break;
    }
  }
  if (out.cp === null && out.mate === null) return null;
  if (!out.pv.length) return null;
  out.move = out.pv[0];
  return out;
}

function sortLines(map) {
  return Object.keys(map)
    .map(k => map[k])
    .sort((a, b) => a.multipv - b.multipv);
}

window.Engine = Engine;
window.ENGINE_HAS_SIMD = hasWasmSimd();
