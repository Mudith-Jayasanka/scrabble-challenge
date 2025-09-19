import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateManagerService } from '../../services/state-manager.service';

@Component({
  selector: 'app-score-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './score-grid.component.html'
})
export class ScoreGridComponent {
  constructor(public stateManager: StateManagerService) {}
}