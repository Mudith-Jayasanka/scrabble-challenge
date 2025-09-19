import { Component } from '@angular/core';
import { GameUiComponent } from './game-ui/game-ui.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GameUiComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'scrabble';
}
