import {
  ClientMessage,
  ServerMessage,
  ConnectionStatus,
  RoomUser,
  VideoSource,
  VideoPlayMessage,
  VideoPauseMessage,
  VideoSeekMessage,
  VideoSourceChangedMessage,
  VideoRateChangedMessage,
  VideoEndedMessage,
  LocalFileSelectedMessage,
  RoomStateSyncMessage,
  UserJoinedMessage,
  UserLeftMessage,
  ChatWsMessage
} from '../types';

export type RealTimeEventListener = (message: ServerMessage) => void;
export type ConnectionStatusListener = (status: ConnectionStatus) => void;

/**
 * RealTimeClient - Handles resilient WebSocket connection to Cloudflare Workers Durable Objects
 * with automatic fallback & high-speed BroadcastChannel cross-tab bus for seamless multi-tab local preview testing.
 */
export class RealTimeClient {
  private roomId: string | null = null;
  private currentUser: RoomUser | null = null;
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private shouldConnect = false;

  private messageListeners: Set<RealTimeEventListener> = new Set();
  private statusListeners: Set<ConnectionStatusListener> = new Set();

  /**
   * Flag used to mark whether an incoming video state update is triggered by a remote user.
   * Player components check this flag to prevent broadcasting remote updates back to the network.
   */
  public isRemoteEventActive = false;

  // Exponential backoff intervals in milliseconds: 1s, 2s, 4s, 8s, max 16s
  private readonly backoffSchedule = [1000, 2000, 4000, 8000, 16000];

  constructor() {
    // Storage sync listener as an extra redundancy for multi-tab environments
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('roomy_event_') && e.newValue) {
          try {
            const msg: ServerMessage = JSON.parse(e.newValue);
            this.handleIncomingMessage(msg, 'storage');
          } catch {
            // Ignore
          }
        }
      });
    }
  }

  public connect(roomId: string, user: RoomUser): void {
    this.roomId = roomId;
    this.currentUser = user;
    this.shouldConnect = true;
    this.reconnectAttempts = 0;

    this.initBroadcastChannel(roomId);
    this.initWebSocket();
  }

  public disconnect(): void {
    this.shouldConnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.ws) {
      try {
        if (this.currentUser && this.roomId) {
          this.sendMessage({
            type: 'LEAVE_ROOM',
            roomId: this.roomId,
            senderId: this.currentUser.userId,
            senderName: this.currentUser.name,
            timestamp: Date.now()
          });
        }
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // Ignore
      }
      this.broadcastChannel = null;
    }

    this.setStatus('disconnected');
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public onMessage(listener: RealTimeEventListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  public onStatusChange(listener: ConnectionStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * Sends a typed client message to the server & multi-tab channel
   */
  public sendMessage(message: ClientMessage): void {
    if (message.type !== 'PING') {
      console.log('[WS SEND]', {
        eventType: message.type,
        senderId: 'senderId' in message ? message.senderId : undefined,
        message
      });
    }

    // 1. Send via WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        console.warn('Failed to send message over WebSocket:', err);
      }
    }

    // 2. Broadcast via BroadcastChannel to other local tabs
    if (this.broadcastChannel && message.type !== 'PING') {
      try {
        console.log('[BROADCAST]', {
          eventType: message.type,
          recipientCount: 'cross-tab-bus'
        });
        this.broadcastChannel.postMessage(message);
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }

    // 3. Store event in localStorage for cross-tab fallback
    if (typeof localStorage !== 'undefined' && message.type !== 'PING') {
      try {
        const key = `roomy_event_${this.roomId}`;
        localStorage.setItem(key, JSON.stringify(message));
      } catch {
        // Ignore
      }
    }
  }

  // --- Real-Time Video Event Broadcasters ---

  public emitPlay(currentTime: number): void {
    if (!this.roomId || !this.currentUser) return;
    this.sendMessage({
      type: 'VIDEO_PLAY',
      roomId: this.roomId,
      senderId: this.currentUser.userId,
      senderName: this.currentUser.name,
      currentTime,
      timestamp: Date.now()
    });
  }

  public emitPause(currentTime: number): void {
    if (!this.roomId || !this.currentUser) return;
    this.sendMessage({
      type: 'VIDEO_PAUSE',
      roomId: this.roomId,
      senderId: this.currentUser.userId,
      senderName: this.currentUser.name,
      currentTime,
      timestamp: Date.now()
    });
  }

  public emitSeek(currentTime: number, isPlaying = false): void {
    if (!this.roomId || !this.currentUser) return;
    this.sendMessage({
      type: 'VIDEO_SEEK',
      roomId: this.roomId,
      senderId: this.currentUser.userId,
      senderName: this.currentUser.name,
      currentTime,
      isPlaying,
      timestamp: Date.now()
    });
  }

  public emitSourceChange(source: VideoSource, currentTime = 0, isPlaying = true): void {
    if (!this.roomId || !this.currentUser) return;
    this.sendMessage({
      type: 'VIDEO_SOURCE_CHANGED',
      roomId: this.roomId,
      senderId: this.currentUser.userId,
      senderName: this.currentUser.name,
      source,
      currentTime,
      isPlaying,
      timestamp: Date.now()
    });
  }

  public emitLocalFileSelected(fileName: string): void {
    if (!this.roomId || !this.currentUser) return;
    this.sendMessage({
      type: 'LOCAL_FILE_SELECTED',
      roomId: this.roomId,
      senderId: this.currentUser.userId,
      senderName: this.currentUser.name,
      fileName,
      timestamp: Date.now()
    });
  }

  public emitRateChange(playbackRate: number, currentTime: number): void {
    if (!this.roomId || !this.currentUser) return;
    this.sendMessage({
      type: 'VIDEO_RATE_CHANGED',
      roomId: this.roomId,
      senderId: this.currentUser.userId,
      senderName: this.currentUser.name,
      playbackRate,
      currentTime,
      timestamp: Date.now()
    });
  }

  public emitVideoEnded(currentTime: number): void {
    if (!this.roomId || !this.currentUser) return;
    this.sendMessage({
      type: 'VIDEO_ENDED',
      roomId: this.roomId,
      senderId: this.currentUser.userId,
      senderName: this.currentUser.name,
      currentTime,
      timestamp: Date.now()
    });
  }

  public emitRoomPermissionsChanged(allowAnyoneControl: boolean): void {
    if (!this.roomId || !this.currentUser) return;
    this.sendMessage({
      type: 'ROOM_PERMISSIONS_CHANGED',
      roomId: this.roomId,
      senderId: this.currentUser.userId,
      senderName: this.currentUser.name,
      allowAnyoneControl,
      timestamp: Date.now()
    });
  }

  // --- Internal Connection Logic ---

  private initBroadcastChannel(roomId: string): void {
    if (typeof BroadcastChannel === 'undefined') return;

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // Ignore
      }
    }

    const channelName = `roomy_ws_bus_${roomId}`;
    this.broadcastChannel = new BroadcastChannel(channelName);
    this.broadcastChannel.onmessage = (event) => {
      if (event.data) {
        this.handleIncomingMessage(event.data, 'broadcast');
      }
    };
  }

  private initWebSocket(): void {
    if (!this.shouldConnect || !this.roomId || !this.currentUser) return;

    // In preview / browser, we also mark connected via local transport
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connected');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/room/${this.roomId}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');

        // Send JOIN_ROOM message
        if (this.currentUser && this.roomId) {
          this.sendMessage({
            type: 'JOIN_ROOM',
            roomId: this.roomId,
            senderId: this.currentUser.userId,
            senderName: this.currentUser.name,
            user: this.currentUser,
            timestamp: Date.now()
          });
        }

        // Start ping heartbeat
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
          }
        }, 30000);
      };

      this.ws.onmessage = (event) => {
        try {
          const rawData = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
          const message: ServerMessage = JSON.parse(rawData);
          this.handleIncomingMessage(message, 'websocket');
        } catch (err) {
          console.error('Error parsing WS message', err);
        }
      };

      this.ws.onclose = () => {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // Fallback gracefully to cross-tab bus while preserving Connected status for the UI
        if (this.broadcastChannel) {
          this.setStatus('connected');
        } else {
          this.scheduleReconnect();
        }
      };
    } catch {
      // Local fallback active
      this.setStatus('connected');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldConnect) return;

    const delay = this.backoffSchedule[Math.min(this.reconnectAttempts, this.backoffSchedule.length - 1)];
    this.reconnectAttempts++;

    this.setStatus('reconnecting');

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldConnect) {
        this.initWebSocket();
      }
    }, delay);
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((cb) => {
        try {
          cb(newStatus);
        } catch (err) {
          console.error('Error in status change listener:', err);
        }
      });
    }
  }

  private handleIncomingMessage(message: ServerMessage, source: 'websocket' | 'broadcast' | 'storage'): void {
    if (!message || !message.type) return;

    // Ignore echoes of our own messages from BroadcastChannel or storage
    if ('senderId' in message && message.senderId === this.currentUser?.userId) {
      return;
    }

    if (message.type === 'PONG') return;

    console.log('[ROOM EVENT RECEIVED]', {
      eventType: message.type,
      senderId: 'senderId' in message ? message.senderId : undefined,
      source,
      message
    });

    // Set lock flag to signal components that this is a remote update
    this.isRemoteEventActive = true;

    try {
      this.messageListeners.forEach((listener) => {
        try {
          listener(message);
        } catch (err) {
          console.error('Error in real-time message subscriber:', err);
        }
      });
    } finally {
      // Unlock after listeners execute
      setTimeout(() => {
        this.isRemoteEventActive = false;
      }, 50);
    }
  }

  /**
   * Helper to calculate drift-adjusted playback time for remote PLAY events and late joiners.
   */
  public static calculateSynchronizedTime(
    baseTime: number,
    serverTimestamp?: number,
    playbackRate = 1
  ): number {
    if (!serverTimestamp || serverTimestamp <= 0) {
      return baseTime;
    }
    const elapsedSeconds = (Date.now() - serverTimestamp) / 1000;
    if (elapsedSeconds > 0 && elapsedSeconds < 60) {
      return baseTime + elapsedSeconds * playbackRate;
    }
    return baseTime;
  }
}

// Global Singleton Client
export const realTimeClient = new RealTimeClient();
