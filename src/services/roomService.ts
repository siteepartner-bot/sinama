import {
  Room,
  RoomUser,
  MediaState,
  ChatMessage,
  ServerMessage,
  VideoSource,
  ConnectionStatus
} from '../types';
import { realTimeClient, RealTimeClient } from './realtimeClient';

/**
 * Interface representing the Room Service contract.
 */
export interface IRoomService {
  generateRoomId(): string;
  generateUserId(): string;
  createRoom(hostName: string, roomName?: string, customRoomId?: string): Promise<{ room: Room; currentUser: RoomUser }>;
  getRoom(roomId: string): Promise<Room | null>;
  joinRoom(roomId: string, userName: string, autoCreateIfNotFound?: boolean): Promise<{ room: Room; currentUser: RoomUser }>;
  leaveRoom(roomId: string, userId: string): Promise<void>;
  updateUserMedia(
    roomId: string,
    userId: string,
    update: Partial<Pick<RoomUser, 'micEnabled' | 'cameraEnabled' | 'screenSharingEnabled' | 'isOnline'>>
  ): Promise<void>;
  updateMediaState(roomId: string, update: Partial<MediaState>, skipBroadcast?: boolean): Promise<void>;
  sendChatMessage(roomId: string, senderId: string, senderName: string, text: string): Promise<ChatMessage>;
  getChatMessages(roomId: string): Promise<ChatMessage[]>;
  subscribe(roomId: string, onUpdate: (room: Room, messages: ChatMessage[]) => void): () => void;
  onConnectionStatus(onStatus: (status: ConnectionStatus) => void): () => void;
  getConnectionStatus(): ConnectionStatus;
  getCurrentRoom(): Room | null;
  getCurrentActiveRoomId(): string | null;
  getRoomUsers(roomId?: string): RoomUser[];
  
  // Real-Time Video Event Broadcasters
  broadcastPlay(roomId: string, currentTime: number): void;
  broadcastPause(roomId: string, currentTime: number): void;
  broadcastSeek(roomId: string, currentTime: number, isPlaying?: boolean): void;
  broadcastSourceChange(roomId: string, source: VideoSource, currentTime?: number, isPlaying?: boolean): void;
  broadcastLocalFile(roomId: string, fileName: string): void;
  broadcastRateChange(roomId: string, rate: number, currentTime: number): void;
  broadcastVideoEnded(roomId: string, currentTime: number): void;
}

// Storage keys
const STORAGE_PREFIX = 'roomy_v4_';
const ROOMS_KEY = `${STORAGE_PREFIX}rooms`;
const MESSAGES_KEY_PREFIX = `${STORAGE_PREFIX}messages_`;
const SESSION_KEY = `${STORAGE_PREFIX}active_session`;

/**
 * Default Media State template
 */
export const getDefaultMediaState = (): MediaState => ({
  sourceType: null,
  sourceUrl: '',
  title: 'هنوز ویدیویی انتخاب نشده است',
  isPlaying: false,
  currentTime: 0,
  duration: 360,
  quality: '1080p',
  playbackRate: 1,
  updatedAt: Date.now()
});

/**
 * Helper to generate Persian formatted time (HH:MM)
 */
export const getPersianTimeStr = (): string => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * RoomService - Manages Room State & Real-Time Sync.
 * Integrates with Cloudflare Workers Durable Objects and multi-tab RealTimeClient.
 */
class DurableRoomService implements IRoomService {
  private listeners: Map<string, Set<(room: Room, messages: ChatMessage[]) => void>> = new Map();
  private realTimeUnsub: (() => void) | null = null;
  private currentActiveRoomId: string | null = null;

  constructor() {
    // Attach real-time message handler
    this.setupRealTimeMessageRouting();
  }

  private setupRealTimeMessageRouting(): void {
    if (this.realTimeUnsub) {
      this.realTimeUnsub();
    }

    this.realTimeUnsub = realTimeClient.onMessage((msg: ServerMessage) => {
      this.handleRemoteServerMessage(msg);
    });
  }

  /**
   * Generates a 4-digit numeric Room ID (e.g., 4829, 1234, 8591)
   */
  generateRoomId(): string {
    const existingRooms = this.getRoomsMap();
    let id = '';
    let attempts = 0;

    do {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const num = 1000 + (array[0] % 9000);
      id = num.toString();
      attempts++;
    } while (existingRooms[id] && attempts < 100);

    return id;
  }

  /**
   * Generates a unique user ID
   */
  generateUserId(): string {
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    return 'usr_' + Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // --- Internal storage helpers ---

  private getRoomsMap(): Record<string, Room> {
    try {
      const data = localStorage.getItem(ROOMS_KEY);
      if (data) {
        return JSON.parse(data);
      }

      // Default initial demo room (Code: 1234)
      const defaultRoomId = '1234';
      const defaultHostId = 'usr_demo_host';
      const defaultRoom: Room = {
        roomId: defaultRoomId,
        roomName: 'اتاق عمومی واچ‌پارتی',
        hostId: defaultHostId,
        createdAt: Date.now() - 3600000,
        users: [
          {
            userId: defaultHostId,
            name: 'میزبان اتاق',
            joinedAt: Date.now() - 3600000,
            isHost: true,
            isOnline: true,
            micEnabled: true,
            cameraEnabled: false,
            screenSharingEnabled: false
          }
        ],
        mediaState: {
          sourceType: 'direct',
          sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          title: 'Big Buck Bunny (ویدیوی نمونه)',
          isPlaying: false,
          currentTime: 0,
          duration: 596,
          quality: '1080p',
          playbackRate: 1,
          updatedAt: Date.now()
        }
      };

      const initialRooms: Record<string, Room> = {
        [defaultRoomId]: defaultRoom
      };

      this.saveRoomsMap(initialRooms);
      this.saveMessagesForRoom(defaultRoomId, [
        {
          id: 'msg_welcome_1234',
          senderId: 'system',
          senderName: 'سیستم',
          text: 'به اتاق عمومی واچ‌پارتی (کد ۱۲۳۴) خوش آمدید!',
          timestamp: getPersianTimeStr(),
          isSystem: true
        }
      ]);

      return initialRooms;
    } catch {
      return {};
    }
  }

  private saveRoomsMap(rooms: Record<string, Room>): void {
    try {
      localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    } catch (e) {
      console.error('Failed to save rooms to localStorage', e);
    }
  }

  private getMessagesForRoom(roomId: string): ChatMessage[] {
    try {
      const data = localStorage.getItem(`${MESSAGES_KEY_PREFIX}${roomId}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveMessagesForRoom(roomId: string, messages: ChatMessage[]): void {
    try {
      localStorage.setItem(`${MESSAGES_KEY_PREFIX}${roomId}`, JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save messages to localStorage', e);
    }
  }

  private notifySubscribers(roomId: string): void {
    const subs = this.listeners.get(roomId);
    if (!subs || subs.size === 0) return;
    const room = this.getRoomsMap()[roomId] || null;
    const messages = this.getMessagesForRoom(roomId);
    if (room) {
      subs.forEach((cb) => {
        try {
          cb(room, messages);
        } catch (err) {
          console.error('Error in room subscriber callback:', err);
        }
      });
    }
  }

  // --- Real-Time Server Message Handler (Remote Events) ---

  private handleRemoteServerMessage(msg: ServerMessage): void {
    const roomId = 'roomId' in msg ? msg.roomId : this.currentActiveRoomId;
    if (!roomId) return;

    const rooms = this.getRoomsMap();
    const room = rooms[roomId];
    if (!room) return;

    const now = Date.now();

    switch (msg.type) {
      case 'ROOM_STATE_SYNC': {
        // Late Join snapshot from authoritative Durable Object
        const incomingRoom = msg.room;
        if (incomingRoom) {
          // Calculate drift offset for media playback time
          const media = incomingRoom.mediaState;
          if (media && media.isPlaying && media.updatedAt) {
            media.currentTime = RealTimeClient.calculateSynchronizedTime(
              media.currentTime,
              msg.serverTimestamp || media.updatedAt,
              media.playbackRate || 1
            );
          }
          rooms[roomId] = incomingRoom;
          this.saveRoomsMap(rooms);
          if (msg.chatMessages) {
            this.saveMessagesForRoom(roomId, msg.chatMessages);
          }
          this.notifySubscribers(roomId);
        }
        break;
      }

      case 'VIDEO_PLAY': {
        // Calculate drift-corrected playback time
        const syncTime = RealTimeClient.calculateSynchronizedTime(
          msg.currentTime,
          msg.serverTimestamp || msg.timestamp
        );
        room.mediaState = {
          ...room.mediaState,
          isPlaying: true,
          currentTime: syncTime,
          updatedAt: now,
          updatedBy: msg.senderId,
          updatedByName: msg.senderName
        };
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);
        this.notifySubscribers(roomId);
        break;
      }

      case 'VIDEO_PAUSE': {
        room.mediaState = {
          ...room.mediaState,
          isPlaying: false,
          currentTime: msg.currentTime,
          updatedAt: now,
          updatedBy: msg.senderId,
          updatedByName: msg.senderName
        };
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);
        this.notifySubscribers(roomId);
        break;
      }

      case 'VIDEO_SEEK': {
        room.mediaState = {
          ...room.mediaState,
          currentTime: msg.currentTime,
          isPlaying: msg.isPlaying !== undefined ? msg.isPlaying : room.mediaState.isPlaying,
          updatedAt: now,
          updatedBy: msg.senderId,
          updatedByName: msg.senderName
        };
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);
        this.notifySubscribers(roomId);
        break;
      }

      case 'VIDEO_SOURCE_CHANGED': {
        const source = msg.source;
        room.mediaState = {
          ...room.mediaState,
          sourceType: source.type === 'none' ? null : source.type,
          sourceUrl: source.url,
          title: source.title || 'ویدیوی جدید',
          videoId: source.videoId,
          fileName: source.fileName,
          isPlaying: msg.isPlaying !== undefined ? msg.isPlaying : true,
          currentTime: msg.currentTime || 0,
          duration: source.duration || 360,
          updatedAt: now,
          updatedBy: msg.senderId,
          updatedByName: msg.senderName,
          localFileOwner: null
        };
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);
        this.notifySubscribers(roomId);
        break;
      }

      case 'LOCAL_FILE_SELECTED': {
        room.mediaState = {
          ...room.mediaState,
          sourceType: 'local',
          sourceUrl: '',
          title: msg.fileName,
          fileName: msg.fileName,
          isPlaying: true,
          currentTime: 0,
          updatedAt: now,
          updatedBy: msg.senderId,
          updatedByName: msg.senderName,
          localFileOwner: {
            userId: msg.senderId,
            userName: msg.senderName || 'کاربر',
            fileName: msg.fileName
          }
        };
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);
        this.notifySubscribers(roomId);
        break;
      }

      case 'VIDEO_RATE_CHANGED': {
        room.mediaState = {
          ...room.mediaState,
          playbackRate: msg.playbackRate,
          currentTime: msg.currentTime,
          updatedAt: now
        };
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);
        this.notifySubscribers(roomId);
        break;
      }

      case 'VIDEO_ENDED': {
        room.mediaState = {
          ...room.mediaState,
          isPlaying: false,
          currentTime: msg.currentTime,
          updatedAt: now
        };
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);
        this.notifySubscribers(roomId);
        break;
      }

      case 'USER_JOINED': {
        const user = msg.user;
        const existingIndex = room.users.findIndex((u) => u.userId === user.userId);
        if (existingIndex >= 0) {
          room.users[existingIndex] = { ...room.users[existingIndex], ...user, isOnline: true };
        } else {
          room.users.push(user);
        }
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);

        const msgs = this.getMessagesForRoom(roomId);
        msgs.push({
          id: 'msg_join_' + now,
          senderId: 'system',
          senderName: 'سیستم',
          text: `کاربر ${user.name} وارد اتاق شد.`,
          timestamp: getPersianTimeStr(),
          isSystem: true
        });
        this.saveMessagesForRoom(roomId, msgs);
        this.notifySubscribers(roomId);
        break;
      }

      case 'USER_LEFT': {
        const leftUserId = msg.userId;
        const user = room.users.find((u) => u.userId === leftUserId);
        room.users = room.users.filter((u) => u.userId !== leftUserId);
        if (room.hostId === leftUserId && room.users.length > 0) {
          room.hostId = room.users[0].userId;
          room.users[0].isHost = true;
        }
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);

        if (user) {
          const msgs = this.getMessagesForRoom(roomId);
          msgs.push({
            id: 'msg_leave_' + now,
            senderId: 'system',
            senderName: 'سیستم',
            text: `کاربر ${user.name} از اتاق خارج شد.`,
            timestamp: getPersianTimeStr(),
            isSystem: true
          });
          this.saveMessagesForRoom(roomId, msgs);
        }
        this.notifySubscribers(roomId);
        break;
      }

      case 'CHAT_MESSAGE': {
        const msgs = this.getMessagesForRoom(roomId);
        if (!msgs.some((m) => m.id === msg.message.id)) {
          msgs.push(msg.message);
          this.saveMessagesForRoom(roomId, msgs);
          this.notifySubscribers(roomId);
        }
        break;
      }

      case 'ROOM_PERMISSIONS_CHANGED': {
        room.allowAnyoneControl = msg.allowAnyoneControl;
        rooms[roomId] = room;
        this.saveRoomsMap(rooms);

        const msgs = this.getMessagesForRoom(roomId);
        msgs.push({
          id: 'msg_perm_' + now,
          senderId: 'system',
          senderName: 'سیستم',
          text: msg.allowAnyoneControl
            ? 'مالک اتاق کنترل ویدیو را برای همه اعضا باز کرد (هر کسی می‌تواند ویدیو را متوقف یا پخش کند).'
            : 'مالک اتاق کنترل ویدیو را محدود به خود کرد (کنترل فقط توسط مالک).',
          timestamp: getPersianTimeStr(),
          isSystem: true
        });
        this.saveMessagesForRoom(roomId, msgs);
        this.notifySubscribers(roomId);
        break;
      }

      case 'WEBRTC_JOIN': {
        const uIdx = room.users.findIndex((u) => u.userId === msg.senderId);
        if (uIdx >= 0) {
          room.users[uIdx].callJoined = true;
          rooms[roomId] = room;
          this.saveRoomsMap(rooms);
          this.notifySubscribers(roomId);
        }
        break;
      }

      case 'WEBRTC_LEAVE': {
        const uIdx = room.users.findIndex((u) => u.userId === msg.senderId);
        if (uIdx >= 0) {
          room.users[uIdx].callJoined = false;
          room.users[uIdx].micEnabled = false;
          room.users[uIdx].cameraEnabled = false;
          rooms[roomId] = room;
          this.saveRoomsMap(rooms);
          this.notifySubscribers(roomId);
        }
        break;
      }

      case 'MEDIA_STATE_CHANGED': {
        const uIdx = room.users.findIndex((u) => u.userId === msg.senderId);
        if (uIdx >= 0) {
          room.users[uIdx].micEnabled = msg.payload.micEnabled;
          room.users[uIdx].cameraEnabled = msg.payload.cameraEnabled;
          room.users[uIdx].callJoined = msg.payload.callJoined;
          rooms[roomId] = room;
          this.saveRoomsMap(rooms);
          this.notifySubscribers(roomId);
        }
        break;
      }
    }
  }

  // --- Real-Time Broadcaster Methods (Local User Actions) ---

  broadcastRoomPermissions(roomId: string, allowAnyoneControl: boolean): void {
    const rooms = this.getRoomsMap();
    const room = rooms[roomId];
    if (room) {
      room.allowAnyoneControl = allowAnyoneControl;
      rooms[roomId] = room;
      this.saveRoomsMap(rooms);
      this.notifySubscribers(roomId);
    }
    realTimeClient.emitRoomPermissionsChanged(allowAnyoneControl);
  }

  broadcastPlay(roomId: string, currentTime: number): void {
    if (realTimeClient.isRemoteEventActive) return;
    this.updateMediaState(roomId, { isPlaying: true, currentTime, updatedAt: Date.now() }, true);
    realTimeClient.emitPlay(currentTime);
  }

  broadcastPause(roomId: string, currentTime: number): void {
    if (realTimeClient.isRemoteEventActive) return;
    this.updateMediaState(roomId, { isPlaying: false, currentTime, updatedAt: Date.now() }, true);
    realTimeClient.emitPause(currentTime);
  }

  broadcastSeek(roomId: string, currentTime: number, isPlaying?: boolean): void {
    if (realTimeClient.isRemoteEventActive) return;
    this.updateMediaState(roomId, { currentTime, isPlaying, updatedAt: Date.now() }, true);
    realTimeClient.emitSeek(currentTime, isPlaying);
  }

  broadcastSourceChange(roomId: string, source: VideoSource, currentTime = 0, isPlaying = true): void {
    if (realTimeClient.isRemoteEventActive) return;
    this.updateMediaState(
      roomId,
      {
        sourceType: source.type === 'none' ? null : source.type,
        sourceUrl: source.url,
        title: source.title,
        videoId: source.videoId,
        fileName: source.fileName,
        isPlaying,
        currentTime,
        localFileOwner: null,
        updatedAt: Date.now()
      },
      true
    );
    realTimeClient.emitSourceChange(source, currentTime, isPlaying);
  }

  broadcastLocalFile(roomId: string, fileName: string): void {
    const session = this.getActiveSession(roomId);
    const userName = session?.name || 'کاربر';
    this.updateMediaState(
      roomId,
      {
        sourceType: 'local',
        title: fileName,
        fileName,
        isPlaying: true,
        currentTime: 0,
        localFileOwner: session
          ? {
              userId: session.userId,
              userName,
              fileName
            }
          : null,
        updatedAt: Date.now()
      },
      true
    );
    realTimeClient.emitLocalFileSelected(fileName);
  }

  broadcastRateChange(roomId: string, rate: number, currentTime: number): void {
    if (realTimeClient.isRemoteEventActive) return;
    this.updateMediaState(roomId, { playbackRate: rate, currentTime, updatedAt: Date.now() }, true);
    realTimeClient.emitRateChange(rate, currentTime);
  }

  broadcastVideoEnded(roomId: string, currentTime: number): void {
    if (realTimeClient.isRemoteEventActive) return;
    this.updateMediaState(roomId, { isPlaying: false, currentTime, updatedAt: Date.now() }, true);
    realTimeClient.emitVideoEnded(currentTime);
  }

  sendMovieControl(action: 'play' | 'pause' | 'stop', currentTime?: number): void {
    realTimeClient.emitMovieStreamControl(action, currentTime);
  }

  sendMovieSeek(currentTime: number, isPlaying?: boolean): void {
    realTimeClient.emitMovieStreamSeek(currentTime, isPlaying);
  }

  // --- Public API Methods ---

  async createRoom(hostName: string, roomName?: string, customRoomId?: string): Promise<{ room: Room; currentUser: RoomUser }> {
    const cleanHostName = hostName.trim();
    if (!cleanHostName) {
      throw new Error('لطفاً نام خود را وارد کنید.');
    }

    const roomId = customRoomId && customRoomId.trim().length > 0 ? customRoomId.trim() : this.generateRoomId();
    const hostId = this.generateUserId();
    const cleanRoomName = roomName && roomName.trim() ? roomName.trim() : `اتاق ${cleanHostName}`;

    const hostUser: RoomUser = {
      userId: hostId,
      name: cleanHostName,
      joinedAt: Date.now(),
      isHost: true,
      isOnline: true,
      micEnabled: true,
      cameraEnabled: false,
      screenSharingEnabled: false
    };

    const newRoom: Room = {
      roomId,
      roomName: cleanRoomName,
      hostId,
      createdAt: Date.now(),
      users: [hostUser],
      mediaState: getDefaultMediaState(),
      allowAnyoneControl: true
    };

    const initialMessage: ChatMessage = {
      id: 'msg_init_' + Date.now(),
      senderId: 'system',
      senderName: 'سیستم',
      text: `اتاق «${cleanRoomName}» (کد ${roomId}) توسط ${cleanHostName} با موفقیت ساخته شد.`,
      timestamp: getPersianTimeStr(),
      isSystem: true
    };

    const rooms = this.getRoomsMap();
    rooms[roomId] = newRoom;
    this.saveRoomsMap(rooms);
    this.saveMessagesForRoom(roomId, [initialMessage]);

    this.saveActiveSession(roomId, hostUser);
    this.currentActiveRoomId = roomId;

    // Connect real-time transport
    realTimeClient.connect(roomId, hostUser);

    this.notifySubscribers(roomId);
    return { room: newRoom, currentUser: hostUser };
  }

  private getDriftCorrectedRoom(room: Room): Room {
    if (!room) return room;
    const media = room.mediaState;
    if (media && media.isPlaying && media.updatedAt) {
      const elapsed = (Date.now() - media.updatedAt) / 1000;
      const rate = media.playbackRate || 1;
      const dur = media.duration > 0 ? media.duration : Infinity;
      const correctedTime = Math.min(dur, Math.max(0, (media.currentTime || 0) + elapsed * rate));
      return {
        ...room,
        mediaState: {
          ...media,
          currentTime: correctedTime
        }
      };
    }
    return room;
  }

  async getRoom(roomId: string): Promise<Room | null> {
    if (!roomId) return null;
    const rooms = this.getRoomsMap();
    const room = rooms[roomId.trim()];
    return room ? this.getDriftCorrectedRoom(room) : null;
  }

  async joinRoom(roomId: string, userName: string, autoCreateIfNotFound = false): Promise<{ room: Room; currentUser: RoomUser }> {
    const cleanRoomId = roomId.trim();
    const cleanUserName = userName.trim();

    if (!cleanUserName) {
      throw new Error('لطفاً نام خود را وارد کنید.');
    }

    const rooms = this.getRoomsMap();
    let room = rooms[cleanRoomId];

    if (!room) {
      if (autoCreateIfNotFound) {
        return this.createRoom(cleanUserName, `اتاق ${cleanUserName}`, cleanRoomId);
      }
      throw new Error(`اتاق با کد ${cleanRoomId} وجود ندارد یا منقضی شده است.`);
    }

    const existingSession = this.getActiveSession(cleanRoomId);
    let currentUser: RoomUser;

    const existingUserIndex = room.users.findIndex(
      (u) => (existingSession && u.userId === existingSession.userId) || u.name === cleanUserName
    );

    if (existingUserIndex >= 0) {
      currentUser = {
        ...room.users[existingUserIndex],
        name: cleanUserName,
        isOnline: true
      };
      room.users[existingUserIndex] = currentUser;
    } else {
      const newUserId = this.generateUserId();
      currentUser = {
        userId: newUserId,
        name: cleanUserName,
        joinedAt: Date.now(),
        isHost: room.users.length === 0 || room.hostId === newUserId,
        isOnline: true,
        micEnabled: true,
        cameraEnabled: false,
        screenSharingEnabled: false
      };
      room.users.push(currentUser);

      const messages = this.getMessagesForRoom(cleanRoomId);
      messages.push({
        id: 'msg_join_' + Date.now(),
        senderId: 'system',
        senderName: 'سیستم',
        text: `کاربر ${cleanUserName} وارد اتاق شد.`,
        timestamp: getPersianTimeStr(),
        isSystem: true
      });
      this.saveMessagesForRoom(cleanRoomId, messages);
    }

    // Late Join Synchronization: Calculate elapsed time for active video
    const media = room.mediaState;
    if (media.isPlaying && media.updatedAt) {
      media.currentTime = RealTimeClient.calculateSynchronizedTime(
        media.currentTime,
        media.updatedAt,
        media.playbackRate || 1
      );
    }

    rooms[cleanRoomId] = room;
    this.saveRoomsMap(rooms);
    this.saveActiveSession(cleanRoomId, currentUser);
    this.currentActiveRoomId = cleanRoomId;

    // Connect real-time transport
    realTimeClient.connect(cleanRoomId, currentUser);

    this.notifySubscribers(cleanRoomId);
    return { room, currentUser };
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const cleanRoomId = roomId.trim();
    const rooms = this.getRoomsMap();
    const room = rooms[cleanRoomId];

    if (room) {
      const userToLeave = room.users.find((u) => u.userId === userId);
      room.users = room.users.filter((u) => u.userId !== userId);

      if (userToLeave) {
        const messages = this.getMessagesForRoom(cleanRoomId);
        messages.push({
          id: 'msg_leave_' + Date.now(),
          senderId: 'system',
          senderName: 'سیستم',
          text: `کاربر ${userToLeave.name} از اتاق خارج شد.`,
          timestamp: getPersianTimeStr(),
          isSystem: true
        });
        this.saveMessagesForRoom(cleanRoomId, messages);
      }

      if (room.hostId === userId && room.users.length > 0) {
        room.users[0].isHost = true;
        room.hostId = room.users[0].userId;
      }

      rooms[cleanRoomId] = room;
      this.saveRoomsMap(rooms);
      this.clearActiveSession(cleanRoomId);
      this.notifySubscribers(cleanRoomId);
    }

    realTimeClient.disconnect();
    this.currentActiveRoomId = null;
  }

  async updateUserMedia(
    roomId: string,
    userId: string,
    update: Partial<Pick<RoomUser, 'micEnabled' | 'cameraEnabled' | 'screenSharingEnabled' | 'isOnline'>>
  ): Promise<void> {
    const cleanRoomId = roomId.trim();
    const rooms = this.getRoomsMap();
    const room = rooms[cleanRoomId];
    if (!room) return;

    const userIndex = room.users.findIndex((u) => u.userId === userId);
    if (userIndex >= 0) {
      room.users[userIndex] = {
        ...room.users[userIndex],
        ...update
      };
      rooms[cleanRoomId] = room;
      this.saveRoomsMap(rooms);
      this.notifySubscribers(cleanRoomId);
    }
  }

  async updateMediaState(roomId: string, update: Partial<MediaState>, skipBroadcast = false): Promise<void> {
    const cleanRoomId = roomId.trim();
    const rooms = this.getRoomsMap();
    const room = rooms[cleanRoomId];
    if (!room) return;

    room.mediaState = {
      ...room.mediaState,
      ...update,
      updatedAt: update.updatedAt || Date.now()
    };

    rooms[cleanRoomId] = room;
    this.saveRoomsMap(rooms);
    this.notifySubscribers(cleanRoomId);
  }

  async sendChatMessage(roomId: string, senderId: string, senderName: string, text: string): Promise<ChatMessage> {
    const cleanText = text.trim();
    if (!cleanText) {
      throw new Error('متن پیام نمی‌تواند خالی باشد.');
    }

    const newMessage: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      senderId,
      senderName,
      text: cleanText,
      timestamp: getPersianTimeStr()
    };

    const messages = this.getMessagesForRoom(roomId);
    messages.push(newMessage);
    this.saveMessagesForRoom(roomId, messages);

    // Broadcast chat to other room members
    realTimeClient.sendMessage({
      type: 'CHAT_MESSAGE',
      roomId,
      senderId,
      senderName,
      message: newMessage,
      timestamp: Date.now()
    });

    this.notifySubscribers(roomId);
    return newMessage;
  }

  async getChatMessages(roomId: string): Promise<ChatMessage[]> {
    return this.getMessagesForRoom(roomId);
  }

  subscribe(roomId: string, onUpdate: (room: Room, messages: ChatMessage[]) => void): () => void {
    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, new Set());
    }
    this.listeners.get(roomId)!.add(onUpdate);

    const room = this.getRoomsMap()[roomId];
    if (room) {
      onUpdate(room, this.getMessagesForRoom(roomId));
    }

    return () => {
      const subs = this.listeners.get(roomId);
      if (subs) {
        subs.delete(onUpdate);
        if (subs.size === 0) {
          this.listeners.delete(roomId);
        }
      }
    };
  }

  onConnectionStatus(onStatus: (status: ConnectionStatus) => void): () => void {
    return realTimeClient.onStatusChange(onStatus);
  }

  getConnectionStatus(): ConnectionStatus {
    return realTimeClient.getStatus();
  }

  getCurrentRoom(): Room | null {
    if (!this.currentActiveRoomId) return null;
    const rooms = this.getRoomsMap();
    return rooms[this.currentActiveRoomId] || null;
  }

  getCurrentActiveRoomId(): string | null {
    return this.currentActiveRoomId;
  }

  getRoomUsers(roomId?: string): RoomUser[] {
    const targetRoomId = roomId || this.currentActiveRoomId;
    if (!targetRoomId) return [];
    const rooms = this.getRoomsMap();
    const room = rooms[targetRoomId];
    return room?.users || [];
  }

  // --- Session persistence helpers ---

  saveActiveSession(roomId: string, user: RoomUser): void {
    try {
      sessionStorage.setItem(`${SESSION_KEY}_${roomId}`, JSON.stringify(user));
    } catch {
      // Ignore
    }
  }

  getActiveSession(roomId: string): RoomUser | null {
    try {
      const data = sessionStorage.getItem(`${SESSION_KEY}_${roomId}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  clearActiveSession(roomId: string): void {
    try {
      sessionStorage.removeItem(`${SESSION_KEY}_${roomId}`);
    } catch {
      // Ignore
    }
  }
}

// Export singleton instance
export const roomService = new DurableRoomService();
