import { ChangeDetectionStrategy, Component, HostListener, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

// --- TYPE DEFINITIONS ---
type Tile = { letter: string; value: number };
type Player = { id: number; name: string; score: number; rack: Tile[] };
type SquareType = 'normal' | 'double-letter' | 'triple-letter' | 'double-word' | 'triple-word' | 'start';
type BoardSquare = {
  tile: Tile | null;
  type: SquareType;
  x: number;
  y: number;
  isPlaced?: boolean; // For tiles placed this turn
};
type GameState = {
  board: BoardSquare[][];
  players: Player[];
  currentPlayerId: number;
  tileBagCount: number;
  status: 'lobby' | 'active' | 'finished';
};
type Placement = { x: number; y: number; tile: Tile, isBlank?: boolean };

@Component({
  selector: 'app-game-ui',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-ui.component.html',
  styleUrl: './game-ui.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameUiComponent {
  // --- MOCK DATA AND CONSTANTS ---
  private readonly TILE_DISTRIBUTION: { [key: string]: { value: number; count: number } } = {
    'A': { value: 1, count: 9 }, 'B': { value: 3, count: 2 }, 'C': { value: 3, count: 2 }, 'D': { value: 2, count: 4 },
    'E': { value: 1, count: 12 }, 'F': { value: 4, count: 2 }, 'G': { value: 2, count: 3 }, 'H': { value: 4, count: 2 },
    'I': { value: 1, count: 9 }, 'J': { value: 8, count: 1 }, 'K': { value: 5, count: 1 }, 'L': { value: 1, count: 4 },
    'M': { value: 3, count: 2 }, 'N': { value: 1, count: 6 }, 'O': { value: 1, count: 8 }, 'P': { value: 3, count: 2 },
    'Q': { value: 10, count: 1 }, 'R': { value: 1, count: 6 }, 'S': { value: 1, count: 4 }, 'T': { value: 1, count: 6 },
    'U': { value: 1, count: 4 }, 'V': { value: 4, count: 2 }, 'W': { value: 4, count: 2 }, 'X': { value: 8, count: 1 },
    'Y': { value: 4, count: 2 }, 'Z': { value: 10, count: 1 }, ' ': { value: 0, count: 2 } // Blank tile
  };

  private readonly BOARD_SIZE = 15;
  private readonly LOCAL_PLAYER_ID = 1;

  // --- TILE BAG & DICTIONARY ---
  // Central tile bag built from distribution and shuffled
  private tileBag: Tile[] = this.buildTileBag();
  // Simple dictionary placeholder; replace with real list for production
  private dictionary: Set<string> = this.loadDefaultDictionary();

  // --- SIGNALS FOR STATE MANAGEMENT ---
  gameState = signal<GameState>(this.createInitialGameState());
  // Track and display the rack of the current player (hot-seat mode)
  localPlayerRack = signal<Tile[]>(this.gameState().players.find(p => p.id === this.gameState().currentPlayerId)!.rack);

  // UI Interaction State
  selectedSquare = signal<{ x: number; y: number } | null>(null);
  direction = signal<'horizontal' | 'vertical'>('horizontal');
  currentPlacements = signal<Placement[]>([]);
  warningMessage = signal<string | null>(null);
  warningTimeout: any;
  showPassConfirm = signal(false);
  showExchangeDialog = signal(false);
  tilesToExchange = signal<number[]>([]);
  draggedTileIndex = signal<number | null>(null);

  // --- TIMERS ---
  // Track elapsed milliseconds per player id
  playerTimes = signal<Record<number, number>>({});
  private turnTimer: any = null;
  private lastTickAt: number | null = null;


  constructor() {
    // Initialize timers for all players to 0 and start the current player's timer
    const initial: Record<number, number> = {};
    for (const p of this.gameState().players) {
      // Initialize each player with 10 minutes (600,000 ms)
      initial[p.id] = 600000;
    }
    this.playerTimes.set(initial);

    if (this.gameState().status === 'active') {
      this.startTimerForCurrentPlayer();
    }
  }

  // Start/resume the timer for the current player
  private startTimerForCurrentPlayer() {
    this.stopTimer();
    this.lastTickAt = Date.now();
    this.turnTimer = setInterval(() => {
      const now = Date.now();
      const delta = this.lastTickAt ? now - this.lastTickAt : 1000;
      this.lastTickAt = now;
      const currentId = this.gameState().currentPlayerId;
      let timeExpired = false;
      this.playerTimes.update(times => {
        const prev = times[currentId] ?? 0;
        const next = Math.max(0, prev - delta);
        if (prev > 0 && next === 0) {
          timeExpired = true;
        }
        return {
          ...times,
          [currentId]: next,
        };
      });
      if (timeExpired) {
        // Auto-rotate turn when a player's time runs out
        this.rotateTurn();
      }
    }, 1000);
  }

  // Stop the active timer
  private stopTimer() {
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
    }
    this.lastTickAt = null;
  }

  // Rotate to next player's turn and switch timers
  private rotateTurn() {
    const gs = this.gameState();
    const players = gs.players;
    const times = this.playerTimes();
    const currentIndex = players.findIndex(p => p.id === gs.currentPlayerId);

    let nextIndex = (currentIndex + 1) % players.length;
    let traversed = 0;
    while (traversed < players.length && (times[players[nextIndex].id] ?? 0) <= 0) {
      nextIndex = (nextIndex + 1) % players.length;
      traversed++;
    }

    if (traversed >= players.length) {
      // No players have remaining time; stop the timer and keep state unchanged
      this.stopTimer();
      return;
    }

    const nextPlayerId = players[nextIndex].id;
    const nextRack = players[nextIndex].rack;
    this.gameState.update(s => ({
      ...s,
      currentPlayerId: nextPlayerId,
    }));
    // Sync the visible rack to the next player's rack
    this.localPlayerRack.set([...nextRack]);
    this.currentPlacements.set([]);
    this.selectedSquare.set(null);
    this.startTimerForCurrentPlayer();
  }

  // Format milliseconds as mm:ss
  formatTime(ms: number | undefined): string {
    const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  }

  ngOnDestroy() {
    this.stopTimer();
  }


  // --- COMPUTED SIGNALS ---
  currentPlayer = computed(() => this.gameState().players.find(p => p.id === this.gameState().currentPlayerId));
  isMyTurn = computed(() => this.gameState().currentPlayerId === this.LOCAL_PLAYER_ID);

  // Board that includes current unsubmitted placements for rendering
  displayBoard = computed(() => {
    const boardCopy = this.gameState().board.map(row => row.map(square => ({...square})));
    this.currentPlacements().forEach(placement => {
      boardCopy[placement.y][placement.x].tile = placement.tile;
      boardCopy[placement.y][placement.x].isPlaced = true;
    });
    return boardCopy;
  });


  // --- KEYBOARD EVENT LISTENER ---
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Pressing Enter to submit move
    if (event.key === 'Enter') {
      this.submitMove();
      return;
    }
    // Pressing X to exchange (if no tiles are placed)
    if (event.key.toUpperCase() === 'X' && this.currentPlacements().length === 0) {
      this.openExchangeDialog();
      return;
    }

    // Handle backspace to remove the last placed tile
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.currentPlacements().length > 0) {
        this.currentPlacements.update(placements => placements.slice(0, -1));
      }
      return;
    }

    // Check for letter input
    if (event.key.length === 1 && event.key.match(/[a-zA-Z ]/)) {
      event.preventDefault();
      const letter = event.key.toUpperCase();
      const isBlank = event.shiftKey;
      this.placeLetter(letter, isBlank);
    }
  }

  // --- TILE PLACEMENT LOGIC ---
  placeLetter(letter: string, isBlank: boolean) {
    // Client-Side Validation
    if (!this.isMyTurn()) {
      return this.showWarning("It's not your turn!");
    }
    if (!this.selectedSquare()) {
      return this.showWarning('Select a starting square on the board first!');
    }
    if (this.currentPlacements().length >= this.localPlayerRack().length) {
      return; // Cannot place more tiles than on rack
    }

    // Check if tile is available on rack
    const rack = [...this.localPlayerRack()];
    const currentPlacedLetters = this.currentPlacements().map(p => p.tile.letter);
    const availableRackLetters = rack.filter((_, i) => !currentPlacedLetters.includes(rack[i].letter)).map(t => t.letter);

    const tileToUse = this.findTileInRack(letter, isBlank, availableRackLetters);
    if (!tileToUse) {
       return this.showWarning(`You don't have the tile: ${letter}`);
    }

    // Find next available square
    let { x, y } = this.getNextAvailableSquare();
    if (x >= this.BOARD_SIZE || y >= this.BOARD_SIZE) {
       return this.showWarning('Word extends beyond the board edge!');
    }

    // Add placement
    this.currentPlacements.update(placements => [
      ...placements,
      { x, y, tile: {letter: letter, value: isBlank ? 0 : tileToUse.value}, isBlank }
    ]);
  }

  private findTileInRack(letter: string, isBlank: boolean, availableRackLetters: string[]): Tile | null {
    const rack = this.localPlayerRack();

    // Filter rack to get available tiles
    const availableTiles = rack.filter(rackTile => {
      const countInRack = rack.filter(t => t.letter === rackTile.letter).length;
      const countPlaced = this.currentPlacements().filter(p => p.tile.letter === rackTile.letter && !p.isBlank).length;
      return countInRack > countPlaced;
    });

    if (isBlank) {
        return availableTiles.find(t => t.letter === ' ') ?? null;
    } else {
        return availableTiles.find(t => t.letter === letter) ?? null;
    }
  }

  private getNextAvailableSquare(): { x: number, y: number } {
    if (this.currentPlacements().length === 0) {
        return this.selectedSquare()!;
    }

    const lastPlacement = this.currentPlacements()[this.currentPlacements().length - 1];
    let nextX = lastPlacement.x;
    let nextY = lastPlacement.y;

    const board = this.gameState().board;
    do {
      if (this.direction() === 'horizontal') {
        nextX++;
      } else {
        nextY++;
      }
    } while (
        nextX < this.BOARD_SIZE &&
        nextY < this.BOARD_SIZE &&
        board[nextY][nextX].tile !== null
    );

    return { x: nextX, y: nextY };
  }

  // --- MOVE VALIDATION ---
  private validateCurrentMove(): { ok: boolean; error?: string } {
    const placements = this.currentPlacements();
    if (placements.length === 0) return { ok: false, error: 'No tiles placed.' };

    // Ensure no duplicate coordinate in placements
    const coordSet = new Set(placements.map(p => `${p.x},${p.y}`));
    if (coordSet.size !== placements.length) return { ok: false, error: 'Duplicate tile placement.' };

    // Must be single row or single column
    const xs = placements.map(p => p.x);
    const ys = placements.map(p => p.y);
    const sameRow = ys.every(y => y === ys[0]);
    const sameCol = xs.every(x => x === xs[0]);
    if (!sameRow && !sameCol) return { ok: false, error: 'Tiles must be in a single row or column.' };

    const board = this.gameState().board;
    const isFirst = this.isFirstMove();

    // First move must cover center
    if (isFirst) {
      const coversCenter = placements.some(p => p.x === 7 && p.y === 7);
      if (!coversCenter) return { ok: false, error: 'First move must cover the center star.' };
    } else {
      // Subsequent moves must connect to existing tiles
      const connects = placements.some(p => this.hasOrthogonalNeighborExisting(p.x, p.y));
      if (!connects) return { ok: false, error: 'Move must connect to existing tiles.' };
    }

    // Contiguity along the move direction including existing tiles
    if (sameRow) {
      const y = ys[0];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      for (let x = minX; x <= maxX; x++) {
        const hasTile = this.getTileFromBoardOrPlacements(x, y) !== null;
        if (!hasTile) return { ok: false, error: 'Placed tiles must be contiguous (no gaps).' };
      }
    } else {
      const x = xs[0];
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      for (let y = minY; y <= maxY; y++) {
        const hasTile = this.getTileFromBoardOrPlacements(x, y) !== null;
        if (!hasTile) return { ok: false, error: 'Placed tiles must be contiguous (no gaps).' };
      }
    }

    // Build words and validate against dictionary
    const words = this.buildWordsForMove();
    if (words.main.length < 2 && !isFirst) {
      return { ok: false, error: 'Main word must be at least 2 letters.' };
    }

    const allWords = [words.main, ...words.cross.filter(w => w.length >= 2)];
    for (const w of allWords) {
      if (!this.dictionary.has(w.toUpperCase())) {
        return { ok: false, error: `Invalid word: ${w}` };
      }
    }

    return { ok: true };
  }

  private isFirstMove(): boolean {
    const board = this.gameState().board;
    for (let y = 0; y < this.BOARD_SIZE; y++) {
      for (let x = 0; x < this.BOARD_SIZE; x++) {
        if (board[y][x].tile) return false;
      }
    }
    return true;
  }

  private hasOrthogonalNeighborExisting(x: number, y: number): boolean {
    const dirs = [ [1,0], [-1,0], [0,1], [0,-1] ] as const;
    const board = this.gameState().board;
    for (const [dx,dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.BOARD_SIZE || ny >= this.BOARD_SIZE) continue;
      const existing = board[ny][nx].tile;
      if (existing) return true;
    }
    return false;
  }

  private getTileFromBoardOrPlacements(x: number, y: number): Tile | null {
    // Check placements first
    const p = this.currentPlacements().find(pl => pl.x === x && pl.y === y);
    if (p) return p.tile;
    const board = this.gameState().board;
    return board[y][x].tile;
  }

  private buildWordsForMove(): { main: string; cross: string[] } {
    const placements = this.currentPlacements();
    const xs = placements.map(p => p.x);
    const ys = placements.map(p => p.y);
    const sameRow = ys.every(y => y === ys[0]);

    const overlayTile = (x: number, y: number): Tile | null => this.getTileFromBoardOrPlacements(x, y);

    const collectLine = (x: number, y: number, dx: number, dy: number): string => {
      // Move to start
      let cx = x, cy = y;
      while (cx - dx >= 0 && cy - dy >= 0 && cx - dx < this.BOARD_SIZE && cy - dy < this.BOARD_SIZE && overlayTile(cx - dx, cy - dy)) {
        cx -= dx; cy -= dy;
      }
      // Collect letters
      let word = '';
      while (cx >= 0 && cy >= 0 && cx < this.BOARD_SIZE && cy < this.BOARD_SIZE && overlayTile(cx, cy)) {
        word += overlayTile(cx, cy)!.letter;
        cx += dx; cy += dy;
      }
      return word;
    };

    // Special handling for a single-tile placement: infer direction from surrounding tiles
    if (placements.length === 1) {
      const p = placements[0];
      const horiz = collectLine(p.x, p.y, 1, 0);
      const vert = collectLine(p.x, p.y, 0, 1);
      if (vert.length >= horiz.length) {
        const cross: string[] = [];
        if (horiz.length >= 2) cross.push(horiz);
        return { main: vert, cross };
      } else {
        const cross: string[] = [];
        if (vert.length >= 2) cross.push(vert);
        return { main: horiz, cross };
      }
    }

    // Main word for multi-tile placement follows the placement line
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const anchorX = sameRow ? minX : xs[0];
    const anchorY = sameRow ? ys[0] : minY;
    const main = sameRow ? collectLine(anchorX, anchorY, 1, 0) : collectLine(anchorX, anchorY, 0, 1);

    // Cross words at each placed tile
    const cross: string[] = [];
    for (const p of placements) {
      const w = sameRow ? collectLine(p.x, p.y, 0, 1) : collectLine(p.x, p.y, 1, 0);
      if (w.length >= 2) cross.push(w);
    }

    return { main, cross };
  }


  // --- USER ACTIONS ---
  handleBoardClick(y: number, x: number) {
    // Cannot change selection if a move is in progress
    if (this.currentPlacements().length > 0) return;

    const currentSelection = this.selectedSquare();
    if (currentSelection && currentSelection.x === x && currentSelection.y === y) {
      // Toggle direction on same square click
      this.direction.update(d => d === 'horizontal' ? 'vertical' : 'horizontal');
    } else {
      this.selectedSquare.set({ x, y });
      this.direction.set('horizontal'); // Default to horizontal on new selection
    }
  }

  submitMove() {
    if (this.currentPlacements().length === 0) {
      this.passTurn();
      return;
    }

    const validation = this.validateCurrentMove();
    if (!validation.ok) {
      this.showWarning(validation.error || 'Invalid move.');
      return;
    }

    // Commit placements to the board
    const placements = this.currentPlacements();
    const board = this.gameState().board.map(row => row.map(sq => ({ ...sq })));
    for (const p of placements) {
      board[p.y][p.x] = { ...board[p.y][p.x], tile: { ...p.tile }, isPlaced: false };
    }

    // Remove used tiles from rack and refill
    const currentId = this.gameState().currentPlayerId;
    const playerIndex = this.gameState().players.findIndex(p => p.id === currentId);
    const playersCopy = this.gameState().players.map(p => ({ ...p, rack: [...p.rack] }));
    const rack = playersCopy[playerIndex].rack;

    for (const p of placements) {
      // For blanks, letter in rack is ' '
      const targetLetter = p.isBlank ? ' ' : p.tile.letter;
      const idx = rack.findIndex(t => t.letter === targetLetter);
      if (idx !== -1) rack.splice(idx, 1);
    }

    // Sync visible rack with current player's rack after removing used tiles
    const localRackAfterUse = [...rack];

    // Draw tiles to refill to 7
    const toDraw = Math.max(0, 7 - rack.length);
    const drawn = this.drawTiles(toDraw);
    rack.push(...drawn);
    playersCopy[playerIndex].rack = rack;

    // Update the visible rack for the current (active) player
    this.localPlayerRack.set([...playersCopy[playerIndex].rack]);

    // Update state
    this.gameState.update(s => ({
      ...s,
      board,
      players: playersCopy,
      tileBagCount: this.tileBag.length,
    }));

    // Clear placement state and rotate
    this.currentPlacements.set([]);
    this.selectedSquare.set(null);
    this.rotateTurn();
  }

  passTurn() {
    this.showPassConfirm.set(true);
  }

  confirmPass(didPass: boolean) {
    this.showPassConfirm.set(false);
    if (didPass) {
      console.log('Passing turn.');
      // Send pass action to server
      this.rotateTurn();
    }
  }

  shuffleRack() {
    this.localPlayerRack.update(rack => [...rack].sort(() => Math.random() - 0.5));
  }

  openExchangeDialog() {
    if (this.currentPlacements().length > 0) {
        this.showWarning("Cannot exchange tiles while placing a word.");
        return;
    }
    this.tilesToExchange.set([]);
    this.showExchangeDialog.set(true);
  }

  toggleTileForExchange(index: number) {
    this.tilesToExchange.update(indices => {
        if (indices.includes(index)) {
            return indices.filter(i => i !== index);
        } else {
            return [...indices, index];
        }
    });
  }

  confirmExchange() {
    const tiles = this.tilesToExchange().map(index => this.localPlayerRack()[index]);
    console.log('Exchanging tiles:', tiles);
    this.showExchangeDialog.set(false);
    this.tilesToExchange.set([]);
    // Send exchange request to the server
  }

  // --- RACK DRAG & DROP ---
  onDragStart(event: DragEvent, index: number) {
    this.draggedTileIndex.set(index);
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault(); // Necessary to allow dropping
  }

  onDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    const draggedIndex = this.draggedTileIndex();
    if (draggedIndex === null) return;

    this.localPlayerRack.update(rack => {
        const newRack = [...rack];
        const [draggedItem] = newRack.splice(draggedIndex, 1);
        newRack.splice(dropIndex, 0, draggedItem);
        return newRack;
    });
    this.draggedTileIndex.set(null);
  }

  onBoardDragOver(event: DragEvent, square: BoardSquare) {
    if (square.tile) {
        // Don't allow dropping on an already occupied square
        return;
    }
    event.preventDefault();
  }

  onBoardDrop(event: DragEvent, square: BoardSquare) {
    event.preventDefault();
    const draggedIndex = this.draggedTileIndex();

    // Can't drop if nothing is being dragged or square is occupied
    if (draggedIndex === null || square.tile) {
      return;
    }

    const tile = this.localPlayerRack()[draggedIndex];

    // This is a simple, direct placement.
    // A full implementation would need to manage the word's direction and contiguity.
    this.currentPlacements.update(placements => [
        ...placements,
        { x: square.x, y: square.y, tile: tile }
    ]);

    // Remove from rack. A more robust implementation might just mark the tile as "placed"
    // instead of removing it, to make it easier to return to the rack.
    this.localPlayerRack.update(rack => {
        const newRack = [...rack];
        newRack.splice(draggedIndex, 1);
        return newRack;
    });

    this.draggedTileIndex.set(null);
  }

  // --- UI HELPERS ---
  showWarning(message: string) {
    this.warningMessage.set(message);
    clearTimeout(this.warningTimeout);
    this.warningTimeout = setTimeout(() => this.warningMessage.set(null), 3000);
  }

  getSquareClasses(square: BoardSquare): string {
    const classes: {[key: string]: boolean} = {
      'bg-green-800': square.type === 'normal',
      'bg-blue-300 text-gray-800': square.type === 'double-letter',
      'bg-blue-600': square.type === 'triple-letter',
      'bg-red-300 text-gray-800': square.type === 'double-word',
      'bg-red-600': square.type === 'triple-word',
      'bg-red-400': square.type === 'start',
      'ring-4 ring-offset-2 ring-offset-gray-900 ring-yellow-400 z-10': this.selectedSquare()?.x === square.x && this.selectedSquare()?.y === square.y,
    };
    return Object.keys(classes).filter(key => classes[key]).join(' ');
  }

  getPremiumSquareText(type: SquareType): string {
    switch (type) {
      case 'double-letter': return 'DL';
      case 'triple-letter': return 'TL';
      case 'double-word': return 'DW';
      case 'triple-word': return 'TW';
      case 'start': return '★';
      default: return '';
    }
  }

  // --- TILE BAG HELPERS ---
  private buildTileBag(): Tile[] {
    const bag: Tile[] = [];
    for (const [letter, info] of Object.entries(this.TILE_DISTRIBUTION)) {
      for (let i = 0; i < info.count; i++) {
        bag.push({ letter, value: info.value });
      }
    }
    return this.shuffle(bag);
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private drawTiles(count: number): Tile[] {
    const drawn: Tile[] = [];
    for (let i = 0; i < count && this.tileBag.length > 0; i++) {
      const tile = this.tileBag.pop();
      if (tile) drawn.push(tile);
    }
    // update tile bag count in state if already created
    if (this.gameState) {
      this.gameState.update(s => ({ ...s, tileBagCount: this.tileBag.length }));
    }
    return drawn;
  }

  // Dictionary loader (placeholder). Replace with file-based loader if provided.
  private loadDefaultDictionary(): Set<string> {
    const words = [
      'A', 'I', 'AN', 'IN', 'ON', 'AT', 'TO', 'DO', 'GO', 'ME', 'HE', 'RE',
      'CAT', 'DOG', 'TREE', 'HOME', 'HELLO', 'WORLD', 'TEST', 'QUIZ', 'AX', 'JO', 'QI'
    ];
    return new Set(words.map(w => w.toUpperCase()));
  }

  // --- INITIALIZATION ---
  private createInitialGameState(): GameState {
    const board = this.createEmptyBoard();
    const players: Player[] = [
      { id: 1, name: 'Player 1', score: 0, rack: [] },
      { id: 2, name: 'Player 2', score: 0, rack: [] },
    ];

    // Deal 7 tiles to each player from the central bag
    players.forEach(p => p.rack = this.drawTiles(7));

    // Randomly choose starting player
    const startingPlayer = players[Math.floor(Math.random() * players.length)];

    return {
      board,
      players,
      currentPlayerId: startingPlayer.id,
      tileBagCount: this.tileBag.length,
      status: 'active',
    };
  }

  private createEmptyBoard(): BoardSquare[][] {
    const board: BoardSquare[][] = [];
    const premiumSquares: { [key: string]: SquareType } = {
        '0,0': 'triple-word', '0,7': 'triple-word', '0,14': 'triple-word',
        '7,0': 'triple-word', '7,14': 'triple-word', '14,0': 'triple-word', '14,7': 'triple-word', '14,14': 'triple-word',
        '1,1': 'double-word', '2,2': 'double-word', '3,3': 'double-word', '4,4': 'double-word',
        '1,13': 'double-word', '2,12': 'double-word', '3,11': 'double-word', '4,10': 'double-word',
        '10,4': 'double-word', '11,3': 'double-word', '12,2': 'double-word', '13,1': 'double-word',
        '10,10': 'double-word', '11,11': 'double-word', '12,12': 'double-word', '13,13': 'double-word',
        '1,5': 'triple-letter', '1,9': 'triple-letter', '5,1': 'triple-letter', '5,5': 'triple-letter', '5,9': 'triple-letter', '5,13': 'triple-letter',
        '9,1': 'triple-letter', '9,5': 'triple-letter', '9,9': 'triple-letter', '9,13': 'triple-letter', '13,5': 'triple-letter', '13,9': 'triple-letter',
        '0,3': 'double-letter', '0,11': 'double-letter', '2,6': 'double-letter', '2,8': 'double-letter', '3,0': 'double-letter', '3,7': 'double-letter', '3,14': 'double-letter',
        '6,2': 'double-letter', '6,6': 'double-letter', '6,8': 'double-letter', '6,12': 'double-letter', '7,3': 'double-letter', '7,11': 'double-letter',
        '8,2': 'double-letter', '8,6': 'double-letter', '8,8': 'double-letter', '8,12': 'double-letter', '11,0': 'double-letter', '11,7': 'double-letter', '11,14': 'double-letter',
        '12,6': 'double-letter', '12,8': 'double-letter', '14,3': 'double-letter', '14,11': 'double-letter',
    };

    for (let y = 0; y < this.BOARD_SIZE; y++) {
      const row: BoardSquare[] = [];
      for (let x = 0; x < this.BOARD_SIZE; x++) {
        const key = `${y},${x}`;
        let type: SquareType = premiumSquares[key] || 'normal';
        if (x === 7 && y === 7) type = 'start';
        row.push({ tile: null, type, x, y });
      }
      board.push(row);
    }
    return board;
  }

  private generateRandomRack(count: number): Tile[] {
    const rack: Tile[] = [];
    const letters = Object.keys(this.TILE_DISTRIBUTION);
    for (let i = 0; i < count; i++) {
        const randomLetter = letters[Math.floor(Math.random() * letters.length)];
        rack.push({ letter: randomLetter, value: this.TILE_DISTRIBUTION[randomLetter].value });
    }
    return rack;
  }
}
