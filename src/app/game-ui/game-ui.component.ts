import { ChangeDetectionStrategy, Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateManagerService } from '../services/state-manager.service';
import { GameGridComponent } from "../components/game-grid/game-grid.component";
import { ActionGridComponent } from "../components/action-grid/action-grid.component";
import { GameInfoGridComponent } from "../components/game-info-grid/game-info-grid.component";
import { RackGridComponent } from "../components/rack-grid/rack-grid.component";
import { ScoreGridComponent } from "../components/score-grid/score-grid.component";

@Component({
    selector: 'app-game-ui',
    standalone: true,
    templateUrl: './game-ui.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, GameGridComponent, ActionGridComponent, GameInfoGridComponent, RackGridComponent, ScoreGridComponent]
})
export class GameUiComponent {

  constructor(private stateManager: StateManagerService) {}

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Pressing Enter to submit move
    if (event.key === 'Enter') {
      this.stateManager.submitMove();
      return;
    }
    // Pressing X to exchange (if no tiles are placed)
    if (event.key.toUpperCase() === 'X' && this.stateManager.currentPlacements().length === 0) {
      this.stateManager.openExchangeDialog();
      return;
    }

    // Handle backspace to remove the last placed tile
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.stateManager.currentPlacements().length > 0) {
        this.stateManager.currentPlacements.update(placements => placements.slice(0, -1));
      }
      return;
    }
    
    // Check for letter input
    if (event.key.length === 1 && event.key.match(/[a-zA-Z ]/)) {
      event.preventDefault();
      const letter = event.key.toUpperCase();
      const isBlank = event.shiftKey;
      this.stateManager.placeLetter(letter, isBlank);
    }
  }
}
