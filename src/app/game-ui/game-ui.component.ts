import { ChangeDetectionStrategy, Component, HostListener, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MongoService, Move } from '../services/mongo.service';

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

  // --- SIGNALS FOR STATE MANAGEMENT ---
  gameState = signal<GameState>(this.createInitialGameState());
  localPlayerRack = signal<Tile[]>(this.gameState().players.find(p => p.id === this.LOCAL_PLAYER_ID)!.rack);
  
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

  constructor(private mongoService: MongoService) { }

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

    if (!this.isMyTurn()) {
        this.showWarning("It's not your turn!");
        return;
    }

    const move: Move = {
      gameId: 'mockGame123',
      playerId: `player${this.LOCAL_PLAYER_ID}`,
      placements: this.currentPlacements(),
      score: 0, // Server will calculate
      timestamp: new Date(),
    };

    this.mongoService.submitMove(move).subscribe({
      next: (response) => {
        this.showWarning('Move submitted successfully!');
        console.log('Server response:', response);

        // Update local state on success
        this.gameState.update(gs => {
            const newBoard = gs.board.map(row => row.map(square => ({...square})));
            this.currentPlacements().forEach(p => {
                newBoard[p.y][p.x].tile = p.tile;
                newBoard[p.y][p.x].isPlaced = false;
            });
            const nextPlayerIndex = (gs.players.findIndex(p => p.id === gs.currentPlayerId) + 1) % gs.players.length;
            return {
                ...gs,
                board: newBoard,
                currentPlayerId: gs.players[nextPlayerIndex].id,
            };
        });

        this.currentPlacements.set([]);
        this.selectedSquare.set(null);
      },
      error: (error) => {
        console.error('Failed to submit move', error);
        this.showWarning(`Error: ${error.error?.message || 'Could not submit move.'}`);
      }
    });
  }

  passTurn() {
    this.showPassConfirm.set(true);
  }
  
  confirmPass(didPass: boolean) {
    this.showPassConfirm.set(false);
    if (didPass) {
      console.log('Passing turn.');
      // Send pass action to server
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

  // --- INITIALIZATION ---
  private createInitialGameState(): GameState {
    // For demonstration, we create a mock game state
    return {
      board: this.createEmptyBoard(),
      players: [
        { id: 1, name: 'Player 1', score: 0, rack: this.generateRandomRack(7) },
        { id: 2, name: 'Player 2', score: 0, rack: this.generateRandomRack(7) },
      ],
      currentPlayerId: 1, // Player 1 starts
      tileBagCount: 100 - 14, // 100 total tiles
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