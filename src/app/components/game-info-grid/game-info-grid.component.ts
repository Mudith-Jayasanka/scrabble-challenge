import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateManagerService } from '../../services/state-manager.service';

@Component({
  selector: 'app-game-info-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-info-grid.component.html'
})
export class GameInfoGridComponent {
  constructor(public stateManager: StateManagerService) {}
}