import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateManagerService } from '../../services/state-manager.service';

@Component({
  selector: 'app-action-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './action-grid.component.html'
})
export class ActionGridComponent {
  constructor(public stateManager: StateManagerService) {}
}