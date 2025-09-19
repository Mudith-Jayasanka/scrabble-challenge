import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RackGridComponent } from './rack-grid.component';

describe('RackGridComponent', () => {
  let component: RackGridComponent;
  let fixture: ComponentFixture<RackGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RackGridComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RackGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
