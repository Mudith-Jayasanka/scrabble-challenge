import { Component, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameUiComponent } from './game-ui/game-ui.component';
import { io, Socket } from 'socket.io-client';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, GameUiComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  // Auth state (pure frontend)
  username = '';
  password = '';
  email = '';
  authError: string | null = null;
  isRegisterMode = false;

  // Guest display name for Bot mode (optional)
  guestName = 'Guest';

  // Flow state
  isLoggedIn = signal(false);
  modeSelected = signal<null | 'bot' | 'human'>(null);
  showAuthModal = signal(false);
  private pendingMode: 'human' | null = null;

  // Online matchmaking state
  private socket: Socket | null = null;
  waitingForOpponent = signal(false);
  waitingMessage = signal<string>('Finding an opponent...');
  roomId = signal<string | null>(null);
  preferredId = signal<number | null>(null);

  displayName = computed(() => this.isLoggedIn() ? this.username : (this.guestName?.trim() || 'Guest'));

  constructor() {
    const savedUser = localStorage.getItem('username');
    if (savedUser) {
      this.username = savedUser;
      this.isLoggedIn.set(true);
    }
  }

  ngOnDestroy(): void {
    this.disconnectSocket();
  }

  private loadUsers(): Record<string, { password: string; email?: string }> {
    try {
      return JSON.parse(localStorage.getItem('users') || '{}') || {};
    } catch {
      return {};
    }
  }

  private saveUsers(users: Record<string, { password: string; email?: string }>) {
    localStorage.setItem('users', JSON.stringify(users));
  }

  async register() {
    this.authError = null;
    const uname = (this.username || '').trim();
    const pwd = (this.password || '').trim();
    if (!uname || !pwd) {
      this.authError = 'Username and password are required.';
      return;
    }
    const users = this.loadUsers();
    if (users[uname]) {
      this.authError = 'Username already exists.';
      return;
    }
    users[uname] = { password: pwd, email: this.email || undefined };
    this.saveUsers(users);
    localStorage.setItem('username', uname);
    this.isLoggedIn.set(true);
    this.afterAuthSuccess();
  }

  async login() {
    this.authError = null;
    const uname = (this.username || '').trim();
    const pwd = (this.password || '').trim();
    const users = this.loadUsers();
    if (!users[uname] || users[uname].password !== pwd) {
      this.authError = 'Invalid username or password.';
      return;
    }
    localStorage.setItem('username', uname);
    this.isLoggedIn.set(true);
    this.afterAuthSuccess();
  }

  private afterAuthSuccess() {
    // If we opened the auth modal for Human mode, proceed to matchmaking now
    if (this.pendingMode === 'human') {
      this.beginMatchmaking();
    }
    this.pendingMode = null;
    this.showAuthModal.set(false);
  }

  logout() {
    this.password = '';
    localStorage.removeItem('username');
    this.isLoggedIn.set(false);
    this.modeSelected.set(null);
    this.cancelMatchmaking();
  }

  selectMode(mode: 'bot' | 'human') {
    if (mode === 'human') {
      if (!this.isLoggedIn()) {
        this.pendingMode = 'human';
        this.showAuthModal.set(true);
        return;
      }
      // Start online matchmaking
      this.beginMatchmaking();
      return;
    }
    // Bot mode: login not required
    this.modeSelected.set('bot');
  }

  private beginMatchmaking() {
    this.waitingForOpponent.set(true);
    this.waitingMessage.set('Finding an opponent...');
    try {
      this.disconnectSocket();
      this.socket = io('http://localhost:3000', { transports: ['websocket'] });
      this.socket.on('connect', () => {
        this.socket?.emit('findGame', { username: this.username });
      });
      this.socket.on('waiting', (msg: string) => {
        this.waitingMessage.set(msg || 'Waiting for another player...');
      });
      this.socket.on('game:start', (payload: { roomId: string, player1?: string, player2?: string }) => {
        this.roomId.set(payload.roomId);
        // Determine our preferred player id based on matchmaking order
        try {
          const p1 = payload.player1 || '';
          const p2 = payload.player2 || '';
          this.preferredId.set(this.username && this.username === p1 ? 1 : (this.username && this.username === p2 ? 2 : null));
        } catch {}
        this.waitingForOpponent.set(false);
        this.modeSelected.set('human'); // enter game; GameUi will use roomId for WS
        // We no longer need the Socket.IO connection for matchmaking
        this.disconnectSocket();
      });
      this.socket.on('disconnect', () => {
        // If disconnected while waiting, show message
        if (this.waitingForOpponent()) {
          this.waitingMessage.set('Disconnected. Retrying...');
        }
      });
      this.socket.on('auth:denied', (payload: any) => {
        const msg = payload?.message || 'You are already logged in from another browser.';
        this.waitingMessage.set(msg);
        this.waitingForOpponent.set(false);
        this.disconnectSocket();
      });
    } catch (e) {
      this.waitingMessage.set('Failed to connect to matchmaking server. Ensure backend is running.');
    }
  }

  cancelMatchmaking() {
    if (this.waitingForOpponent()) {
      this.waitingForOpponent.set(false);
    }
    this.disconnectSocket();
  }

  private disconnectSocket() {
    if (this.socket) {
      try { this.socket.off(); this.socket.disconnect(); } catch {}
      this.socket = null;
    }
  }

  closeAuthModal() {
    this.pendingMode = null;
    this.showAuthModal.set(false);
  }
}
