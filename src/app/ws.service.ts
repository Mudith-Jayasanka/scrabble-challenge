import { Injectable } from '@angular/core';

export type WSAction =
  | { kind: 'submit_move'; placements: { x: number; y: number; tile: { letter: string; value: number }; isBlank?: boolean }[] }
  | { kind: 'pass' };

@Injectable({ providedIn: 'root' })
export class WsService {
  private ws: WebSocket | null = null;
  private roomId: string | null = null;
  private name: string | null = null;

  // Callbacks set by consumer
  onWelcome?: (info: { playerId: number; isHost: boolean }) => void;
  onRequestState?: (targetPlayerId: number) => void;
  onFullState?: (payload: any) => void;
  onAction?: (action: WSAction, senderId?: number) => void;
  onBecameHost?: () => void;
  onRoster?: (players: { id: number; name: string }[]) => void;

  connect(roomId: string, name: string, preferredId?: number) {
    if (this.ws) return;
    this.roomId = roomId;
    this.name = name;
    const pref = preferredId && (preferredId === 1 || preferredId === 2) ? `&prefId=${preferredId}` : '';
    const url = `ws://localhost:8080?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}${pref}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WS] connected to', url);
    };
    this.ws.onclose = () => {
      console.warn('[WS] disconnected');
    };

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        switch (data.type) {
          case 'welcome':
            this.onWelcome?.({ playerId: data.playerId, isHost: !!data.isHost });
            break;
          case 'request_state':
            this.onRequestState?.(data.targetPlayerId);
            break;
          case 'full_state':
            this.onFullState?.(data.payload);
            break;
          case 'action':
            this.onAction?.(data.action, data.senderId);
            break;
          case 'you_are_host_now':
            this.onBecameHost?.();
            break;
          case 'roster':
            this.onRoster?.(data.players || []);
            break;
        }
      } catch {
        // ignore
      }
    };
  }

  sendFullState(targetPlayerId: number, payload: any) {
    if (!this.ws) return;
    this.ws.send(JSON.stringify({ type: 'full_state', targetPlayerId, payload }));
  }

  sendFullStateBroadcast(payload: any) {
    if (!this.ws) return;
    this.ws.send(JSON.stringify({ type: 'full_state_broadcast', payload }));
  }

  sendAction(action: WSAction) {
    if (!this.ws) return;
    this.ws.send(JSON.stringify({ type: 'action', action }));
  }
}
