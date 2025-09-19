import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// The Move interface should already be in game-ui.component.ts,
// but it's good practice to have it in a separate file in a real app.
export interface Move {
    _id?: string;
    gameId: string;
    playerId: string;
    placements: any[];
    score: number;
    timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class MongoService {
  private apiUrl = 'http://localhost:3000/api'; // URL to the backend server

  constructor(private http: HttpClient) { }

  /**
   * Submits a move to the backend server.
   * @param move - The move object to submit.
   * @returns {Observable<any>} The response from the server.
   */
  submitMove(move: Move): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/submit-move`, move);
  }
}
