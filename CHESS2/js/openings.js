/* =============================================================
   Opening book — used for "Book" move classification and for
   naming the opening (like chess.com's "Opening" label).
   Each entry: [ECO, Name, SAN move sequence]
   ============================================================= */
const OPENING_BOOK = [
  ['B00', 'King\'s Pawn Opening', 'e4'],
  ['A40', 'Queen\'s Pawn Opening', 'd4'],
  ['A04', 'Zukertort Opening', 'Nf3'],
  ['A10', 'English Opening', 'c4'],
  ['A45', 'Indian Game', 'd4 Nf6'],
  ['B00', 'Nimzowitsch Defense', 'e4 Nc6'],
  ['B02', 'Alekhine Defense', 'e4 Nf6'],
  ['B01', 'Scandinavian Defense', 'e4 d5'],
  ['B01', 'Scandinavian Defense: Mieses-Kotroc', 'e4 d5 exd5 Qxd5'],
  ['B01', 'Scandinavian Defense: Modern', 'e4 d5 exd5 Nf6'],
  ['B07', 'Pirc Defense', 'e4 d6'],
  ['B07', 'Pirc Defense: Main Line', 'e4 d6 d4 Nf6 Nc3 g6'],
  ['B06', 'Modern Defense', 'e4 g6'],
  ['B10', 'Caro-Kann Defense', 'e4 c6'],
  ['B12', 'Caro-Kann Defense: Advance', 'e4 c6 d4 d5 e5'],
  ['B13', 'Caro-Kann Defense: Exchange', 'e4 c6 d4 d5 exd5 cxd5'],
  ['B18', 'Caro-Kann Defense: Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
  ['B15', 'Caro-Kann Defense: Tartakower', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Nxf6+ exf6'],
  ['B20', 'Sicilian Defense', 'e4 c5'],
  ['B27', 'Sicilian Defense: Hyperaccelerated Dragon', 'e4 c5 Nf3 g6'],
  ['B22', 'Sicilian Defense: Alapin', 'e4 c5 c3'],
  ['B23', 'Sicilian Defense: Closed', 'e4 c5 Nc3'],
  ['B21', 'Sicilian Defense: Smith-Morra Gambit', 'e4 c5 d4 cxd4 c3'],
  ['B30', 'Sicilian Defense: Old Sicilian', 'e4 c5 Nf3 Nc6'],
  ['B31', 'Sicilian Defense: Rossolimo', 'e4 c5 Nf3 Nc6 Bb5'],
  ['B33', 'Sicilian Defense: Open', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4'],
  ['B32', 'Sicilian Defense: Kalashnikov', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e5'],
  ['B35', 'Sicilian Defense: Accelerated Dragon', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6'],
  ['B40', 'Sicilian Defense: French Variation', 'e4 c5 Nf3 e6'],
  ['B44', 'Sicilian Defense: Taimanov', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6'],
  ['B50', 'Sicilian Defense: Modern Variations', 'e4 c5 Nf3 d6'],
  ['B54', 'Sicilian Defense: Open', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4'],
  ['B90', 'Sicilian Defense: Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['B70', 'Sicilian Defense: Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['B80', 'Sicilian Defense: Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
  ['B60', 'Sicilian Defense: Classical', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'],
  ['C00', 'French Defense', 'e4 e6'],
  ['C02', 'French Defense: Advance', 'e4 e6 d4 d5 e5'],
  ['C01', 'French Defense: Exchange', 'e4 e6 d4 d5 exd5 exd5'],
  ['C03', 'French Defense: Tarrasch', 'e4 e6 d4 d5 Nd2'],
  ['C10', 'French Defense: Paulsen', 'e4 e6 d4 d5 Nc3'],
  ['C11', 'French Defense: Classical', 'e4 e6 d4 d5 Nc3 Nf6'],
  ['C15', 'French Defense: Winawer', 'e4 e6 d4 d5 Nc3 Bb4'],
  ['C20', 'King\'s Pawn Game', 'e4 e5'],
  ['C23', 'Bishop\'s Opening', 'e4 e5 Bc4'],
  ['C25', 'Vienna Game', 'e4 e5 Nc3'],
  ['C30', 'King\'s Gambit', 'e4 e5 f4'],
  ['C33', 'King\'s Gambit Accepted', 'e4 e5 f4 exf4'],
  ['C40', 'King\'s Knight Opening', 'e4 e5 Nf3'],
  ['C41', 'Philidor Defense', 'e4 e5 Nf3 d6'],
  ['C42', 'Petrov\'s Defense', 'e4 e5 Nf3 Nf6'],
  ['C42', 'Russian Game: Classical', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4'],
  ['C44', 'King\'s Knight Opening: Normal', 'e4 e5 Nf3 Nc6'],
  ['C44', 'Scotch Game', 'e4 e5 Nf3 Nc6 d4'],
  ['C45', 'Scotch Game: Classical', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5'],
  ['C45', 'Scotch Game: Schmidt', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6'],
  ['C46', 'Three Knights Opening', 'e4 e5 Nf3 Nc6 Nc3'],
  ['C47', 'Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['C50', 'Italian Game', 'e4 e5 Nf3 Nc6 Bc4'],
  ['C50', 'Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['C53', 'Italian Game: Classical', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4'],
  ['C54', 'Italian Game: Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 c3'],
  ['C55', 'Italian Game: Two Knights Defense', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['C57', 'Italian Game: Fried Liver Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
  ['C57', 'Italian Game: Traxler Counterattack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5'],
  ['C51', 'Italian Game: Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'],
  ['C60', 'Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5'],
  ['C61', 'Ruy Lopez: Bird Variation', 'e4 e5 Nf3 Nc6 Bb5 Nd4'],
  ['C63', 'Ruy Lopez: Schliemann', 'e4 e5 Nf3 Nc6 Bb5 f5'],
  ['C64', 'Ruy Lopez: Classical', 'e4 e5 Nf3 Nc6 Bb5 Bc5'],
  ['C65', 'Ruy Lopez: Berlin Defense', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['C67', 'Ruy Lopez: Berlin Defense, Open', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4'],
  ['C68', 'Ruy Lopez: Exchange', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6'],
  ['C70', 'Ruy Lopez: Morphy Defense', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4'],
  ['C78', 'Ruy Lopez: Morphy Defense', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O'],
  ['C84', 'Ruy Lopez: Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7'],
  ['C88', 'Ruy Lopez: Closed, Main Line', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'],
  ['D00', 'Queen\'s Pawn Game', 'd4 d5'],
  ['D02', 'Queen\'s Pawn Game: London System', 'd4 d5 Nf3 Nf6 Bf4'],
  ['D00', 'Blackmar-Diemer Gambit', 'd4 d5 e4'],
  ['D06', 'Queen\'s Gambit', 'd4 d5 c4'],
  ['D20', 'Queen\'s Gambit Accepted', 'd4 d5 c4 dxc4'],
  ['D30', 'Queen\'s Gambit Declined', 'd4 d5 c4 e6'],
  ['D37', 'Queen\'s Gambit Declined: Three Knights', 'd4 d5 c4 e6 Nc3 Nf6 Nf3'],
  ['D35', 'Queen\'s Gambit Declined: Exchange', 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5'],
  ['D32', 'Tarrasch Defense', 'd4 d5 c4 e6 Nc3 c5'],
  ['D10', 'Slav Defense', 'd4 d5 c4 c6'],
  ['D15', 'Slav Defense: Three Knights', 'd4 d5 c4 c6 Nf3 Nf6 Nc3'],
  ['D43', 'Semi-Slav Defense', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'],
  ['D07', 'Queen\'s Gambit Declined: Chigorin', 'd4 d5 c4 Nc6'],
  ['D08', 'Queen\'s Gambit Declined: Albin', 'd4 d5 c4 e5'],
  ['D85', 'Grunfeld Defense', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['D85', 'Grunfeld Defense: Exchange', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5'],
  ['E00', 'Catalan Opening', 'd4 Nf6 c4 e6 g3'],
  ['E20', 'Nimzo-Indian Defense', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ['E32', 'Nimzo-Indian Defense: Classical', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2'],
  ['E40', 'Nimzo-Indian Defense: Rubinstein', 'd4 Nf6 c4 e6 Nc3 Bb4 e3'],
  ['E12', 'Queen\'s Indian Defense', 'd4 Nf6 c4 e6 Nf3 b6'],
  ['E60', 'King\'s Indian Defense', 'd4 Nf6 c4 g6'],
  ['E60', 'King\'s Indian Defense: Fianchetto', 'd4 Nf6 c4 g6 g3'],
  ['E90', 'King\'s Indian Defense: Normal', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3'],
  ['E97', 'King\'s Indian Defense: Classical', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6'],
  ['A80', 'Dutch Defense', 'd4 f5'],
  ['A96', 'Dutch Defense: Classical', 'd4 f5 c4 Nf6 Nf3 e6 g3 Be7'],
  ['A57', 'Benko Gambit', 'd4 Nf6 c4 c5 d5 b5'],
  ['A56', 'Benoni Defense', 'd4 Nf6 c4 c5'],
  ['A61', 'Benoni Defense: Modern', 'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6'],
  ['A15', 'English Opening: Anglo-Indian', 'c4 Nf6'],
  ['A20', 'English Opening: King\'s English', 'c4 e5'],
  ['A30', 'English Opening: Symmetrical', 'c4 c5'],
  ['A25', 'English Opening: Closed', 'c4 e5 Nc3 Nc6'],
  ['A05', 'Reti Opening', 'Nf3 Nf6'],
  ['A06', 'Reti Opening', 'Nf3 d5'],
  ['A09', 'Reti Opening: Advance', 'Nf3 d5 c4'],
  ['A01', 'Nimzo-Larsen Attack', 'b3'],
  ['A02', 'Bird\'s Opening', 'f4'],
  ['A00', 'Van\'t Kruijs Opening', 'e3'],
  ['A00', 'Grob Opening', 'g4'],
  ['B00', 'Owen Defense', 'e4 b6'],
  ['B00', 'St. George Defense', 'e4 a6'],
  ['C21', 'Danish Gambit', 'e4 e5 d4 exd4 c3'],
  ['C22', 'Center Game', 'e4 e5 d4 exd4 Qxd4'],
  ['A43', 'Old Benoni', 'd4 c5'],
  ['A46', 'Torre Attack', 'd4 Nf6 Nf3 e6 Bg5'],
  ['D01', 'Richter-Veresov Attack', 'd4 d5 Nc3 Nf6 Bg5'],
  ['A48', 'London System', 'd4 Nf6 Nf3 g6 Bf4'],
  ['B12', 'Caro-Kann Defense: Two Knights', 'e4 c6 Nc3 d5 Nf3'],
  ['C11', 'French Defense: Steinitz', 'e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4'],
  ['B22', 'Sicilian Defense: Alapin, Barmen', 'e4 c5 c3 d5 exd5 Qxd5'],
  ['B23', 'Sicilian Defense: Grand Prix Attack', 'e4 c5 Nc3 Nc6 f4']
];

/** Build a fast prefix set of SAN sequences plus a name lookup. */
const OpeningBook = (() => {
  const prefixes = new Set();
  const names = new Map();
  OPENING_BOOK.forEach(([eco, name, line]) => {
    const moves = line.trim().split(/\s+/);
    for (let i = 1; i <= moves.length; i++) {
      const key = moves.slice(0, i).join(' ');
      prefixes.add(key);
      if (i === moves.length || !names.has(key)) {
        // longest match wins later; store deepest name per key
        names.set(key, { eco, name });
      }
    }
    names.set(moves.join(' '), { eco, name });
  });

  return {
    /** Is the SAN sequence (array) a known book line? */
    isBook(sanArray) {
      if (sanArray.length === 0 || sanArray.length > 30) return false;
      return prefixes.has(sanArray.join(' '));
    },
    /** Deepest opening name matching a prefix of the SAN sequence. */
    identify(sanArray) {
      let best = null;
      for (let i = Math.min(sanArray.length, 30); i >= 1; i--) {
        const key = sanArray.slice(0, i).join(' ');
        if (names.has(key)) { best = Object.assign({ ply: i }, names.get(key)); break; }
      }
      return best;
    }
  };
})();

window.OpeningBook = OpeningBook;
