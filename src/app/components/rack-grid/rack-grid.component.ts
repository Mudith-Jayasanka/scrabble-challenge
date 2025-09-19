import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateManagerService } from '../../services/state-manager.service';

@Component({
  selector: 'app-rack-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rack-grid.component.html'
})
export class RackGridComponent {
  constructor(public stateManager: StateManagerService) {}
}