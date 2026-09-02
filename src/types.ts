export interface RoomUser {
  userId: string;
  name: string;
  joinedAt: number;
  isHost: boolean;
  isOnline: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharingEnabled?: boolean;
}

// Backward compatibility alias for UI components
export type Member = RoomUser;

export interface MediaState {
  sourceType: 'youtube' | 'aparat' | 'direct' | 'local' | null;
  sourceUrl: string;
  title: string;
  isPlaying: boolean;
  currentTime: number; // in seconds
  duration: number; // in seconds
  quality: string; // e.g. '1080p', '720p', etc.
}

// Backward compatibility alias
export type VideoState = MediaState;

export interface Room {
  roomId: string;
  roomName: string;
  hostId: string;
  createdAt: number;
  users: RoomUser[];
  mediaState: MediaState;
}

// Backward compatibility alias for RoomState
export interface RoomState extends Room {
  currentUser: RoomUser | null;
  members: RoomUser[];
  chatMessages: ChatMessage[];
  currentVideo: MediaState;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string; // HH:MM
  isSystem?: boolean;
}

export type ViewType = 'home' | 'create-room' | 'join-room' | 'room';
