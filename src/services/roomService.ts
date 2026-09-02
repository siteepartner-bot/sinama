import { Room, RoomUser, MediaState, ChatMessage } from '../types';

/**
 * Interface representing the Room Service contract.
 * Designed to be seamlessly replaced with Cloudflare Workers + Durable Objects + WebSockets in Phase 3.
 */
export interface IRoomService {
  generateRoomId(): string;
  generateUserId(): string;
  createRoom(hostName: string, roomName?: string): Promise<{ room: Room; currentUser: RoomUser }>;
  getRoom(roomId: string): Promise<Room | null>;
  joinRoom(roomId: string, userName: string): Promise<{ room: Room; currentUser: RoomUser }>;
  leaveRoom(roomId: string, userId: string): Promise<void>;
  updateUserMedia(
    roomId: string,
    userId: string,
    update: Partial<Pick<RoomUser, 'micEnabled' | 'cameraEnabled' | 'screenSharingEnabled' | 'isOnline'>>
  ): Promise<void>;
  updateMediaState(roomId: string, update: Partial<MediaState>): Promise<void>;
  sendChatMessage(roomId: string, senderId: string, senderName: string, text: string): Promise<ChatMessage>;
  getChatMessages(roomId: string): Promise<ChatMessage[]>;
  subscribe(roomId: string, onUpdate: (room: Room, messages: ChatMessage[]) => void): () => void;
}

// Storage keys
const STORAGE_PREFIX = 'roomy_v2_';
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
  quality: '1080p'
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
 * Local Durable Room Service implementation.
 * Stores room data locally and broadcasts events via BroadcastChannel for real-time multi-tab testing.
 * Prepared for Cloudflare Durable Objects backend transition.
 */
class LocalDurableRoomService implements IRoomService {
  private channels: Map<string, BroadcastChannel> = new Map();
  private listeners: Map<string, Set<(room: Room, messages: ChatMessage[]) => void>> = new Map();

  /**
   * Generates a cryptographically secure, clean 8-character alphanumeric Room ID.
   * e.g., '8Kx29LmP' or '7f82a91c'
   */
  generateRoomId(): string {
    const chars = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[array[i] % chars.length];
    }
    return id;
  }

  /**
   * Generates a unique user ID
   */
  generateUserId(): string {
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    return 'usr_' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  // --- Internal storage helpers ---

  private getRoomsMap(): Record<string, Room> {
    try {
      const data = localStorage.getItem(ROOMS_KEY);
      return data ? JSON.parse(data) : {};
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

  private getChannel(roomId: string): BroadcastChannel | null {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (!this.channels.has(roomId)) {
      const channel = new BroadcastChannel(`roomy_channel_${roomId}`);
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC') {
          this.notifySubscribers(roomId);
        }
      };
      this.channels.set(roomId, channel);
    }
    return this.channels.get(roomId)!;
  }

  private broadcastUpdate(roomId: string): void {
    const channel = this.getChannel(roomId);
    if (channel) {
      channel.postMessage({ type: 'SYNC', timestamp: Date.now() });
    }
    this.notifySubscribers(roomId);
  }

  private notifySubscribers(roomId: string): void {
    const subs = this.listeners.get(roomId);
    if (!subs || subs.size === 0) return;
    const room = this.getRoomsMap()[roomId] || null;
    const messages = this.getMessagesForRoom(roomId);
    if (room) {
      subs.forEach(cb => cb(room, messages));
    }
  }

  // --- Public API Methods ---

  async createRoom(hostName: string, roomName?: string): Promise<{ room: Room; currentUser: RoomUser }> {
    const cleanHostName = hostName.trim();
    if (!cleanHostName) {
      throw new Error('لطفاً نام خود را وارد کنید.');
    }

    const roomId = this.generateRoomId();
    const hostId = this.generateUserId();
    const cleanRoomName = (roomName && roomName.trim()) ? roomName.trim() : `اتاق ${cleanHostName}`;

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
      mediaState: getDefaultMediaState()
    };

    const initialMessage: ChatMessage = {
      id: 'msg_init_' + Date.now(),
      senderId: 'system',
      senderName: 'سیستم',
      text: `اتاق «${cleanRoomName}» توسط ${cleanHostName} با موفقیت ساخته شد.`,
      timestamp: getPersianTimeStr(),
      isSystem: true
    };

    // Save to store
    const rooms = this.getRoomsMap();
    rooms[roomId] = newRoom;
    this.saveRoomsMap(rooms);
    this.saveMessagesForRoom(roomId, [initialMessage]);

    // Save active session
    this.saveActiveSession(roomId, hostUser);

    this.broadcastUpdate(roomId);
    return { room: newRoom, currentUser: hostUser };
  }

  async getRoom(roomId: string): Promise<Room | null> {
    if (!roomId) return null;
    const rooms = this.getRoomsMap();
    return rooms[roomId.trim()] || null;
  }

  async joinRoom(roomId: string, userName: string): Promise<{ room: Room; currentUser: RoomUser }> {
    const cleanRoomId = roomId.trim();
    const cleanUserName = userName.trim();

    if (!cleanUserName) {
      throw new Error('لطفاً نام خود را وارد کنید.');
    }

    const rooms = this.getRoomsMap();
    const room = rooms[cleanRoomId];

    if (!room) {
      throw new Error('این اتاق وجود ندارد یا منقضی شده است.');
    }

    // Check if we have an existing session in this room
    const existingSession = this.getActiveSession(cleanRoomId);
    let currentUser: RoomUser;

    const existingUserIndex = room.users.findIndex(
      u => (existingSession && u.userId === existingSession.userId) || u.name === cleanUserName
    );

    if (existingUserIndex >= 0) {
      // Reconnect existing user
      currentUser = {
        ...room.users[existingUserIndex],
        name: cleanUserName,
        isOnline: true
      };
      room.users[existingUserIndex] = currentUser;
    } else {
      // New member
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

      // System notification
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

    rooms[cleanRoomId] = room;
    this.saveRoomsMap(rooms);
    this.saveActiveSession(cleanRoomId, currentUser);

    this.broadcastUpdate(cleanRoomId);
    return { room, currentUser };
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const cleanRoomId = roomId.trim();
    const rooms = this.getRoomsMap();
    const room = rooms[cleanRoomId];

    if (!room) return;

    const userToLeave = room.users.find(u => u.userId === userId);
    // Remove or mark offline
    room.users = room.users.filter(u => u.userId !== userId);

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

    // Reassign host if host left and there are other users
    if (room.hostId === userId && room.users.length > 0) {
      room.users[0].isHost = true;
      room.hostId = room.users[0].userId;
    }

    rooms[cleanRoomId] = room;
    this.saveRoomsMap(rooms);
    this.clearActiveSession(cleanRoomId);

    this.broadcastUpdate(cleanRoomId);
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

    const userIndex = room.users.findIndex(u => u.userId === userId);
    if (userIndex >= 0) {
      room.users[userIndex] = {
        ...room.users[userIndex],
        ...update
      };
      rooms[cleanRoomId] = room;
      this.saveRoomsMap(rooms);
      this.broadcastUpdate(cleanRoomId);
    }
  }

  async updateMediaState(roomId: string, update: Partial<MediaState>): Promise<void> {
    const cleanRoomId = roomId.trim();
    const rooms = this.getRoomsMap();
    const room = rooms[cleanRoomId];
    if (!room) return;

    room.mediaState = {
      ...room.mediaState,
      ...update
    };

    rooms[cleanRoomId] = room;
    this.saveRoomsMap(rooms);
    this.broadcastUpdate(cleanRoomId);
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

    this.broadcastUpdate(roomId);
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
    this.getChannel(roomId); // Ensure channel is active

    // Send initial snapshot immediately
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
          const channel = this.channels.get(roomId);
          if (channel) {
            channel.close();
            this.channels.delete(roomId);
          }
        }
      }
    };
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

// Export singleton instance ready for use
export const roomService: IRoomService & {
  getActiveSession: (roomId: string) => RoomUser | null;
  clearActiveSession: (roomId: string) => void;
} = new LocalDurableRoomService();
