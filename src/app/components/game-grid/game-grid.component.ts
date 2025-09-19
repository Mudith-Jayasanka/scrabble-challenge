import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateManagerService } from '../../services/state-manager.service';

@Component({
  selector: 'app-game-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-grid.component.html'
})
export class GameGridComponent {
  constructor(public stateManager: StateManagerService) {}
}