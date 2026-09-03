/**
 * Cloudflare Worker + Durable Object implementation for Roomy Real-Time Video Synchronization.
 * Each room has an isolated Durable Object instance identified by its roomId.
 */

// Ambient Cloudflare Workers & Durable Objects type declarations
declare global {
  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
  }

  interface DurableObjectState {
    storage: DurableObjectStorage;
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  }

  interface DurableObjectId {
    toString(): string;
  }

  interface DurableObjectStub {
    fetch(request: Request): Promise<Response>;
  }

  interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
  }

  interface WebSocketWithAccept extends WebSocket {
    accept(): void;
  }

  interface WebSocketPairConstructor {
    new (): { 0: WebSocket; 1: WebSocketWithAccept };
  }

  const WebSocketPair: WebSocketPairConstructor;
}

import {
  Room,
  RoomUser,
  MediaState,
  ChatMessage,
  ClientMessage,
  ServerMessage,
  RoomStateSyncMessage,
  VideoPlayMessage,
  VideoPauseMessage,
  VideoSeekMessage,
  VideoSourceChangedMessage,
  VideoRateChangedMessage,
  VideoEndedMessage,
  LocalFileSelectedMessage,
  ChatWsMessage,
  RoomPermissionsChangedMessage,
  WebRTCJoinMessage,
  WebRTCLeaveMessage,
  WebRTCOfferMessage,
  WebRTCAnswerMessage,
  WebRTCIceCandidateMessage,
  MediaStateChangedMessage
} from '../src/types';

export interface Env {
  ROOM_DO: DurableObjectNamespace;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

interface SessionData {
  userId: string;
  userName: string;
  joinedAt: number;
}

/**
 * Default Media State template
 */
function getDefaultMediaState(): MediaState {
  return {
    sourceType: 'direct',
    sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    title: 'Big Buck Bunny (ویدیوی نمونه)',
    isPlaying: false,
    currentTime: 0,
    duration: 596,
    quality: '1080p',
    playbackRate: 1,
    updatedAt: Date.now()
  };
}

/**
 * RoomDurableObject - Authoritative state controller for a single Roomy room.
 * Manages WebSocket connections, room user registry, authoritative media synchronization clock,
 * and conflict-free event broadcasts.
 */
export class RoomDurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<WebSocket, SessionData> = new Map();
  private room: Room | null = null;
  private chatMessages: ChatMessage[] = [];
  private roomId: string = '';

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      this.room = (await this.state.storage.get<Room>('room')) || null;
      this.chatMessages = (await this.state.storage.get<ChatMessage[]>('chatMessages')) || [];
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Extract roomId from path (e.g., /api/room/:roomId/ws or /ws/:roomId)
    const match = url.pathname.match(/\/(?:api\/room|ws)\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      this.roomId = match[1];
    } else if (url.searchParams.get('roomId')) {
      this.roomId = url.searchParams.get('roomId')!;
    }

    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      await this.handleWebSocketSession(server);

      return new Response(null, {
        status: 101,
        // @ts-expect-error WebSocket response init in Cloudflare Workers
        webSocket: client
      });
    }

    // HTTP REST inspection/snapshot
    if (request.method === 'GET') {
      const currentRoom = this.getCalculatedRoomState();
      return new Response(
        JSON.stringify({
          room: currentRoom,
          chatMessages: this.chatMessages,
          activeConnections: this.sessions.size
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response('Expected WebSocket upgrade', { status: 400 });
  }

  private async handleWebSocketSession(ws: WebSocketWithAccept): Promise<void> {
    ws.accept();

    ws.addEventListener('message', async (event: MessageEvent) => {
      try {
        const rawData = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
        const message: ClientMessage = JSON.parse(rawData);
        await this.handleClientMessage(ws, message);
      } catch (err) {
        console.error('Error handling WebSocket message in Durable Object:', err);
        this.sendToSocket(ws, {
          type: 'ERROR',
          message: 'فرمت پیام نامعتبر است.'
        });
      }
    });

    ws.addEventListener('close', async () => {
      await this.handleSessionDisconnect(ws);
    });

    ws.addEventListener('error', async (err) => {
      console.warn('WebSocket error in Durable Object session:', err);
      await this.handleSessionDisconnect(ws);
    });
  }

  /**
   * Computes authoritative media state taking elapsed playback time into account.
   * Ensures Late Joiners receive the exact frame / current timestamp.
   */
  private getCalculatedRoomState(): Room {
    if (!this.room) {
      this.room = {
        roomId: this.roomId || '1234',
        roomName: 'اتاق واچ‌پارتی',
        hostId: '',
        createdAt: Date.now(),
        users: [],
        mediaState: getDefaultMediaState()
      };
    }

    const media = this.room.mediaState;
    if (media.isPlaying && media.updatedAt) {
      const elapsedSeconds = (Date.now() - media.updatedAt) / 1000;
      const rate = media.playbackRate || 1;
      const computedTime = Math.min(
        media.duration > 0 ? media.duration : Infinity,
        media.currentTime + elapsedSeconds * rate
      );
      return {
        ...this.room,
        mediaState: {
          ...media,
          currentTime: computedTime
        }
      };
    }

    return this.room;
  }

  private canUserControlMedia(_senderId: string): boolean {
    if (!this.room) return false;
    // ALL_ROOM_MEMBERS_CAN_CONTROL_MEDIA: Every room member has equal permission to control media
    return true;
  }

  private async handleClientMessage(senderWs: WebSocket, message: ClientMessage): Promise<void> {
    const now = Date.now();

    switch (message.type) {
      case 'PING': {
        this.sendToSocket(senderWs, { type: 'PONG', timestamp: now });
        return;
      }

      case 'JOIN_ROOM': {
        this.roomId = message.roomId || this.roomId;
        const user = message.user;

        this.sessions.set(senderWs, {
          userId: user.userId,
          userName: user.name,
          joinedAt: now
        });

        if (!this.room) {
          this.room = {
            roomId: this.roomId,
            roomName: `اتاق ${user.name}`,
            hostId: user.userId,
            createdAt: now,
            users: [user],
            mediaState: getDefaultMediaState(),
            allowAnyoneControl: true
          };
          user.isHost = true;
          user.role = 'host';
          user.canControlMedia = true;
        } else {
          // Add or update user in room
          user.canControlMedia = true;
          user.role = this.room.hostId === user.userId ? 'host' : 'member';
          const existingIndex = this.room.users.findIndex((u) => u.userId === user.userId);
          if (existingIndex >= 0) {
            this.room.users[existingIndex] = { ...this.room.users[existingIndex], ...user, isOnline: true };
          } else {
            this.room.users.push(user);
          }
          if (!this.room.hostId) {
            this.room.hostId = user.userId;
            this.room.users[0].isHost = true;
            this.room.users[0].role = 'host';
          }
        }

        await this.persistState();

        // 1. Send authoritative Room State snapshot to the joining user (Late Join Synchronization)
        const roomSnapshot = this.getCalculatedRoomState();
        const syncMessage: RoomStateSyncMessage = {
          type: 'ROOM_STATE_SYNC',
          roomId: this.roomId,
          room: roomSnapshot,
          chatMessages: this.chatMessages,
          serverTimestamp: now
        };
        this.sendToSocket(senderWs, syncMessage);

        // 2. Broadcast USER_JOINED to all other members
        this.broadcast(
          {
            type: 'USER_JOINED',
            roomId: this.roomId,
            user,
            timestamp: now
          },
          senderWs
        );
        break;
      }

      case 'VIDEO_PLAY': {
        if (!this.room || !this.canUserControlMedia(message.senderId)) return;
        console.log('[DURABLE OBJECT ACCEPTED EVENT]', {
          senderId: message.senderId,
          isHost: this.room?.hostId === message.senderId,
          eventType: message.type
        });

        this.room.mediaState = {
          ...this.room.mediaState,
          isPlaying: true,
          currentTime: message.currentTime,
          updatedAt: now,
          updatedBy: message.senderId,
          updatedByName: message.senderName
        };
        await this.persistState();

        // Broadcast to other participants with server timestamp for clock drift sync
        const payload: VideoPlayMessage = {
          type: 'VIDEO_PLAY',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          currentTime: message.currentTime,
          timestamp: message.timestamp,
          serverTimestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'VIDEO_PAUSE': {
        if (!this.room || !this.canUserControlMedia(message.senderId)) return;
        console.log('[DURABLE OBJECT ACCEPTED EVENT]', {
          senderId: message.senderId,
          isHost: this.room?.hostId === message.senderId,
          eventType: message.type
        });

        this.room.mediaState = {
          ...this.room.mediaState,
          isPlaying: false,
          currentTime: message.currentTime,
          updatedAt: now,
          updatedBy: message.senderId,
          updatedByName: message.senderName
        };
        await this.persistState();

        const payload: VideoPauseMessage = {
          type: 'VIDEO_PAUSE',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          currentTime: message.currentTime,
          timestamp: message.timestamp,
          serverTimestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'VIDEO_SEEK': {
        if (!this.room || !this.canUserControlMedia(message.senderId)) return;
        console.log('[DURABLE OBJECT ACCEPTED EVENT]', {
          senderId: message.senderId,
          isHost: this.room?.hostId === message.senderId,
          eventType: message.type
        });

        this.room.mediaState = {
          ...this.room.mediaState,
          currentTime: message.currentTime,
          isPlaying: message.isPlaying !== undefined ? message.isPlaying : this.room.mediaState.isPlaying,
          updatedAt: now,
          updatedBy: message.senderId,
          updatedByName: message.senderName
        };
        await this.persistState();

        const payload: VideoSeekMessage = {
          type: 'VIDEO_SEEK',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          currentTime: message.currentTime,
          isPlaying: this.room.mediaState.isPlaying,
          timestamp: message.timestamp,
          serverTimestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'VIDEO_SOURCE_CHANGED': {
        if (!this.room || !this.canUserControlMedia(message.senderId)) return;
        console.log('[DURABLE OBJECT ACCEPTED EVENT]', {
          senderId: message.senderId,
          isHost: this.room?.hostId === message.senderId,
          eventType: message.type
        });

        const source = message.source;
        this.room.mediaState = {
          ...this.room.mediaState,
          sourceType: source.type === 'none' ? null : source.type,
          sourceUrl: source.url,
          title: source.title || 'ویدیوی جدید',
          videoId: source.videoId,
          fileName: source.fileName,
          isPlaying: message.isPlaying !== undefined ? message.isPlaying : true,
          currentTime: message.currentTime || 0,
          duration: source.duration || 360,
          updatedAt: now,
          updatedBy: message.senderId,
          updatedByName: message.senderName,
          localFileOwner: null
        };
        await this.persistState();

        const payload: VideoSourceChangedMessage = {
          type: 'VIDEO_SOURCE_CHANGED',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          source,
          currentTime: message.currentTime || 0,
          isPlaying: this.room.mediaState.isPlaying,
          timestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'LOCAL_FILE_SELECTED': {
        if (!this.room || !this.canUserControlMedia(message.senderId)) return;
        console.log('[DURABLE OBJECT ACCEPTED EVENT]', {
          senderId: message.senderId,
          isHost: this.room?.hostId === message.senderId,
          eventType: message.type
        });

        this.room.mediaState = {
          ...this.room.mediaState,
          sourceType: 'local',
          sourceUrl: '',
          title: message.fileName,
          fileName: message.fileName,
          isPlaying: true,
          currentTime: 0,
          updatedAt: now,
          updatedBy: message.senderId,
          updatedByName: message.senderName,
          localFileOwner: {
            userId: message.senderId,
            userName: message.senderName || 'کاربر',
            fileName: message.fileName
          }
        };
        await this.persistState();

        const payload: LocalFileSelectedMessage = {
          type: 'LOCAL_FILE_SELECTED',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          fileName: message.fileName,
          timestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'VIDEO_RATE_CHANGED': {
        if (!this.room || !this.canUserControlMedia(message.senderId)) return;
        console.log('[DURABLE OBJECT ACCEPTED EVENT]', {
          senderId: message.senderId,
          isHost: this.room?.hostId === message.senderId,
          eventType: message.type
        });

        this.room.mediaState = {
          ...this.room.mediaState,
          playbackRate: message.playbackRate,
          currentTime: message.currentTime,
          updatedAt: now,
          updatedBy: message.senderId,
          updatedByName: message.senderName
        };
        await this.persistState();

        const payload: VideoRateChangedMessage = {
          type: 'VIDEO_RATE_CHANGED',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          playbackRate: message.playbackRate,
          currentTime: message.currentTime,
          timestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'VIDEO_ENDED': {
        if (!this.room || !this.canUserControlMedia(message.senderId)) return;
        console.log('[DURABLE OBJECT ACCEPTED EVENT]', {
          senderId: message.senderId,
          isHost: this.room?.hostId === message.senderId,
          eventType: message.type
        });

        this.room.mediaState = {
          ...this.room.mediaState,
          isPlaying: false,
          currentTime: message.currentTime,
          updatedAt: now,
          updatedBy: message.senderId,
          updatedByName: message.senderName
        };
        await this.persistState();

        const payload: VideoEndedMessage = {
          type: 'VIDEO_ENDED',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          currentTime: message.currentTime,
          timestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'ROOM_PERMISSIONS_CHANGED': {
        if (!this.room) return;
        // Only host is authorized to change room control permissions
        if (message.senderId !== this.room.hostId) {
          this.sendToSocket(senderWs, {
            type: 'ERROR',
            message: 'تنها مالک اتاق اجازه تغییر دسترسی کنترل ویدیو را دارد.'
          });
          return;
        }

        this.room.allowAnyoneControl = message.allowAnyoneControl;
        await this.persistState();

        const payload: RoomPermissionsChangedMessage = {
          type: 'ROOM_PERMISSIONS_CHANGED',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          allowAnyoneControl: message.allowAnyoneControl,
          timestamp: now
        };
        // Broadcast to everyone (including sender) to ensure immediate sync
        this.broadcast(payload);
        break;
      }

      case 'CHAT_MESSAGE': {
        const chatMsg = message.message;
        this.chatMessages.push(chatMsg);
        if (this.chatMessages.length > 200) {
          this.chatMessages = this.chatMessages.slice(-200);
        }
        await this.persistState();

        const payload: ChatWsMessage = {
          type: 'CHAT_MESSAGE',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          message: chatMsg,
          timestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'WEBRTC_JOIN': {
        console.log('[WEBRTC JOIN RECEIVED IN DO]', {
          roomId: this.roomId,
          senderId: message.senderId
        });
        if (this.room) {
          const userIdx = this.room.users.findIndex((u) => u.userId === message.senderId);
          if (userIdx >= 0) {
            this.room.users[userIdx].callJoined = true;
            await this.persistState();
          }
        }
        const payload: WebRTCJoinMessage = {
          type: 'WEBRTC_JOIN',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          timestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'WEBRTC_LEAVE': {
        console.log('[WEBRTC LEAVE RECEIVED IN DO]', {
          roomId: this.roomId,
          senderId: message.senderId
        });
        if (this.room) {
          const userIdx = this.room.users.findIndex((u) => u.userId === message.senderId);
          if (userIdx >= 0) {
            this.room.users[userIdx].callJoined = false;
            this.room.users[userIdx].micEnabled = false;
            this.room.users[userIdx].cameraEnabled = false;
            await this.persistState();
          }
        }
        const payload: WebRTCLeaveMessage = {
          type: 'WEBRTC_LEAVE',
          roomId: this.roomId,
          senderId: message.senderId,
          timestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'WEBRTC_OFFER': {
        // Targeted Peer-to-Peer Signaling: Route offer specifically to destination user
        const payload: WebRTCOfferMessage = {
          type: 'WEBRTC_OFFER',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          toUserId: message.toUserId,
          payload: message.payload,
          timestamp: now
        };
        this.sendToUser(message.toUserId, payload);
        break;
      }

      case 'WEBRTC_ANSWER': {
        // Targeted Peer-to-Peer Signaling: Route answer specifically to destination user
        const payload: WebRTCAnswerMessage = {
          type: 'WEBRTC_ANSWER',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          toUserId: message.toUserId,
          payload: message.payload,
          timestamp: now
        };
        this.sendToUser(message.toUserId, payload);
        break;
      }

      case 'WEBRTC_ICE_CANDIDATE': {
        // Targeted Peer-to-Peer Signaling: Route candidate specifically to destination user
        const payload: WebRTCIceCandidateMessage = {
          type: 'WEBRTC_ICE_CANDIDATE',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          toUserId: message.toUserId,
          payload: message.payload,
          timestamp: now
        };
        this.sendToUser(message.toUserId, payload);
        break;
      }

      case 'MEDIA_STATE_CHANGED': {
        if (this.room) {
          const userIdx = this.room.users.findIndex((u) => u.userId === message.senderId);
          if (userIdx >= 0) {
            this.room.users[userIdx].micEnabled = message.payload.micEnabled;
            this.room.users[userIdx].cameraEnabled = message.payload.cameraEnabled;
            this.room.users[userIdx].callJoined = message.payload.callJoined;
            if (message.payload.screenSharingEnabled !== undefined) {
              this.room.users[userIdx].screenSharingEnabled = message.payload.screenSharingEnabled;
            }
            await this.persistState();
          }
        }
        const payload: MediaStateChangedMessage = {
          type: 'MEDIA_STATE_CHANGED',
          roomId: this.roomId,
          senderId: message.senderId,
          senderName: message.senderName,
          payload: message.payload,
          timestamp: now
        };
        this.broadcast(payload, senderWs);
        break;
      }

      case 'SCREEN_SHARE_STARTED': {
        console.log('[SCREEN SHARE STARTED RECEIVED IN DO]', {
          roomId: this.roomId,
          senderId: message.senderId
        });
        if (this.room) {
          const userIdx = this.room.users.findIndex((u) => u.userId === message.senderId);
          if (userIdx >= 0) {
            this.room.users[userIdx].screenSharingEnabled = true;
            await this.persistState();
          }
        }
        this.broadcast(
          {
            type: 'SCREEN_SHARE_STARTED',
            roomId: this.roomId,
            senderId: message.senderId,
            senderName: message.senderName,
            payload: (message as any).payload,
            timestamp: now
          },
          senderWs
        );
        break;
      }

      case 'SCREEN_SHARE_STOPPED': {
        console.log('[SCREEN SHARE STOPPED RECEIVED IN DO]', {
          roomId: this.roomId,
          senderId: message.senderId
        });
        if (this.room) {
          const userIdx = this.room.users.findIndex((u) => u.userId === message.senderId);
          if (userIdx >= 0) {
            this.room.users[userIdx].screenSharingEnabled = false;
            await this.persistState();
          }
        }
        this.broadcast(
          {
            type: 'SCREEN_SHARE_STOPPED',
            roomId: this.roomId,
            senderId: message.senderId,
            senderName: message.senderName,
            payload: (message as any).payload,
            timestamp: now
          },
          senderWs
        );
        break;
      }

      case 'MOVIE_STREAM_STARTED': {
        console.log('[MOVIE STREAM STARTED RECEIVED IN DO]', {
          roomId: this.roomId,
          senderId: message.senderId,
          payload: (message as any).payload
        });
        this.broadcast(
          {
            type: 'MOVIE_STREAM_STARTED',
            roomId: this.roomId,
            senderId: message.senderId,
            senderName: message.senderName,
            payload: (message as any).payload,
            timestamp: now
          },
          senderWs
        );
        break;
      }

      case 'MOVIE_STREAM_STOPPED': {
        console.log('[MOVIE STREAM STOPPED RECEIVED IN DO]', {
          roomId: this.roomId,
          senderId: message.senderId
        });
        this.broadcast(
          {
            type: 'MOVIE_STREAM_STOPPED',
            roomId: this.roomId,
            senderId: message.senderId,
            senderName: message.senderName,
            payload: (message as any).payload,
            timestamp: now
          },
          senderWs
        );
        break;
      }

      case 'MOVIE_STREAM_CONTROL': {
        console.log('[MOVIE STREAM CONTROL RECEIVED IN DO]', {
          roomId: this.roomId,
          senderId: message.senderId,
          action: (message as any).action
        });
        // Forward control request to all peers (especially the stream owner)
        this.broadcast(
          {
            type: 'MOVIE_STREAM_CONTROL',
            roomId: this.roomId,
            senderId: message.senderId,
            senderName: message.senderName,
            action: (message as any).action,
            currentTime: (message as any).currentTime,
            timestamp: now
          },
          senderWs
        );
        break;
      }

      case 'MOVIE_STREAM_SEEK': {
        console.log('[MOVIE STREAM SEEK RECEIVED IN DO]', {
          roomId: this.roomId,
          senderId: message.senderId,
          currentTime: (message as any).currentTime
        });
        this.broadcast(
          {
            type: 'MOVIE_STREAM_SEEK',
            roomId: this.roomId,
            senderId: message.senderId,
            senderName: message.senderName,
            currentTime: (message as any).currentTime,
            isPlaying: (message as any).isPlaying,
            timestamp: now
          },
          senderWs
        );
        break;
      }
    }
  }

  private async handleSessionDisconnect(ws: WebSocket): Promise<void> {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);

    if (session && this.room) {
      this.room.users = this.room.users.filter((u) => u.userId !== session.userId);

      // Reassign host if needed
      if (this.room.hostId === session.userId && this.room.users.length > 0) {
        this.room.hostId = this.room.users[0].userId;
        this.room.users[0].isHost = true;
      }

      await this.persistState();

      this.broadcast({
        type: 'USER_LEFT',
        roomId: this.roomId,
        userId: session.userId,
        timestamp: Date.now()
      });
    }
  }

  private broadcast(message: ServerMessage, excludeSocket?: WebSocket): void {
    const recipientCount = Math.max(0, this.sessions.size - (excludeSocket ? 1 : 0));
    console.log('[BROADCAST]', {
      eventType: message.type,
      recipientCount
    });

    const serialized = JSON.stringify(message);
    for (const [ws] of this.sessions.entries()) {
      if (ws === excludeSocket) continue;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(serialized);
        }
      } catch (err) {
        console.warn('Failed to send WebSocket message:', err);
      }
    }
  }

  private sendToSocket(ws: WebSocket, message: ServerMessage): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (err) {
      console.warn('Failed to send to single socket:', err);
    }
  }

  private sendToUser(targetUserId: string, message: ServerMessage): void {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.userId === targetUserId) {
        this.sendToSocket(ws, message);
        return;
      }
    }
  }

  private async persistState(): Promise<void> {
    if (this.room) {
      await this.state.storage.put('room', this.room);
    }
    if (this.chatMessages.length > 0) {
      await this.state.storage.put('chatMessages', this.chatMessages);
    }
  }
}

/**
 * Main Cloudflare Worker router
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Health check
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'Roomy Cloudflare Worker' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. WebSocket & Real-time Room routes (e.g. /api/room/:roomId/ws or /ws/:roomId)
    const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
    const isRoomApi = url.pathname.startsWith('/api/room') || url.pathname.startsWith('/ws');

    if (isWebSocket || isRoomApi) {
      const match = url.pathname.match(/\/(?:api\/room|ws)\/([a-zA-Z0-9_-]+)/);
      const roomId = match ? match[1] : url.searchParams.get('roomId') || '1234';

      if (env.ROOM_DO) {
        const id = env.ROOM_DO.idFromName(roomId);
        const roomDO = env.ROOM_DO.get(id);
        return roomDO.fetch(request);
      }
    }

    // 3. Serve Frontend React Web App & Static Assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Roomy Web App is running.', { status: 200 });
  }
};
