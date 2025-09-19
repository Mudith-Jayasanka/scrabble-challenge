import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GameInfoGridComponent } from './game-info-grid.component';

describe('GameInfoGridComponent', () => {
  let component: GameInfoGridComponent;
  let fixture: ComponentFixture<GameInfoGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameInfoGridComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GameInfoGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
