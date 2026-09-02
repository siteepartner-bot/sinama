export interface Member {
  id: string;
  name: string;
  isMe: boolean;
  isOnline: boolean;
  isMicActive: boolean;
  isCameraActive: boolean;
  isScreenSharing: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string; // HH:MM
}

export interface VideoState {
  sourceType: 'youtube' | 'aparat' | 'direct' | 'local' | null;
  url: string;
  title: string;
  isPlaying: boolean;
  currentTime: number; // in seconds
  duration: number; // in seconds
  quality: string; // e.g. '1080p', '720p', etc.
}

export interface RoomState {
  roomId: string;
  roomName: string;
  currentUser: Member | null;
  members: Member[];
  chatMessages: ChatMessage[];
  currentVideo: VideoState;
}

export type ViewType = 'home' | 'create-room' | 'join-room' | 'room';
