export interface RoomUser {
  userId: string;
  name: string;
  joinedAt: number;
  isHost: boolean;
  role?: 'host' | 'member';
  canControlMedia?: boolean;
  isOnline: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  callJoined?: boolean;
  screenSharingEnabled?: boolean;
}

/**
 * Core Permission Rule:
 * In the current Roomy architecture, ALL room members have equal permission to control media.
 * Play, Pause, Seek, Rate Change, and Video Source Selection are open to Host and all Members.
 */
export const ALL_ROOM_MEMBERS_CAN_CONTROL_MEDIA = true;

// Backward compatibility alias for UI components
export type Member = RoomUser;

export type VideoSourceType = 'youtube' | 'aparat' | 'direct' | 'local' | 'none';

export interface VideoSource {
  type: VideoSourceType;
  url: string;
  videoId?: string;
  fileName?: string;
  title: string;
  duration?: number;
}

export interface MediaState {
  sourceType: 'youtube' | 'aparat' | 'direct' | 'local' | null;
  sourceUrl: string;
  title: string;
  isPlaying: boolean;
  currentTime: number; // in seconds
  duration: number; // in seconds
  quality: string; // e.g. '1080p', '720p', etc.
  playbackRate?: number; // 0.5 to 2.0
  fileName?: string;
  videoId?: string;
  updatedAt?: number; // timestamp of last play/pause/seek for sync calculation
  updatedBy?: string; // userId who triggered the last action
  updatedByName?: string; // name of the user who triggered the last action
  localFileOwner?: {
    userId: string;
    userName: string;
    fileName: string;
  } | null;
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
  allowAnyoneControl?: boolean; // If true: anyone can play/pause/seek; if false: only host can control
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

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

// --------------------------------------------------------------------------
// Phase 4: Real-time Message Types (Cloudflare Worker + Durable Objects + WS)
// --------------------------------------------------------------------------

export type VideoEventType =
  | 'VIDEO_SOURCE_CHANGED'
  | 'VIDEO_PLAY'
  | 'VIDEO_PAUSE'
  | 'VIDEO_SEEK'
  | 'VIDEO_RATE_CHANGED'
  | 'VIDEO_ENDED'
  | 'LOCAL_FILE_SELECTED';

export type WebRTCEventType =
  | 'WEBRTC_JOIN'
  | 'WEBRTC_LEAVE'
  | 'WEBRTC_OFFER'
  | 'WEBRTC_ANSWER'
  | 'WEBRTC_ICE_CANDIDATE'
  | 'MEDIA_STATE_CHANGED'
  | 'SCREEN_SHARE_STARTED'
  | 'SCREEN_SHARE_STOPPED'
  | 'MOVIE_STREAM_STARTED'
  | 'MOVIE_STREAM_STOPPED'
  | 'MOVIE_STREAM_CONTROL'
  | 'MOVIE_STREAM_SEEK';

export type ClientMessageType =
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'PING'
  | 'CHAT_MESSAGE'
  | 'ROOM_PERMISSIONS_CHANGED'
  | VideoEventType
  | WebRTCEventType;

export type ServerMessageType =
  | 'ROOM_STATE_SYNC'
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'PONG'
  | 'CHAT_MESSAGE'
  | 'ROOM_PERMISSIONS_CHANGED'
  | 'ERROR'
  | VideoEventType
  | WebRTCEventType;

export interface BaseWsMessage {
  roomId: string;
  senderId: string;
  senderName?: string;
  timestamp: number;
}

export interface JoinRoomMessage extends BaseWsMessage {
  type: 'JOIN_ROOM';
  user: RoomUser;
}

export interface LeaveRoomMessage extends BaseWsMessage {
  type: 'LEAVE_ROOM';
}

export interface WebRTCJoinMessage extends BaseWsMessage {
  type: 'WEBRTC_JOIN';
}

export interface WebRTCLeaveMessage extends BaseWsMessage {
  type: 'WEBRTC_LEAVE';
}

export interface WebRTCOfferMessage extends BaseWsMessage {
  type: 'WEBRTC_OFFER';
  toUserId: string;
  payload: RTCSessionDescriptionInit;
}

export interface WebRTCAnswerMessage extends BaseWsMessage {
  type: 'WEBRTC_ANSWER';
  toUserId: string;
  payload: RTCSessionDescriptionInit;
}

export interface WebRTCIceCandidateMessage extends BaseWsMessage {
  type: 'WEBRTC_ICE_CANDIDATE';
  toUserId: string;
  payload: RTCIceCandidateInit;
}

export interface MediaStateChangedMessage extends BaseWsMessage {
  type: 'MEDIA_STATE_CHANGED';
  payload: {
    micEnabled: boolean;
    cameraEnabled: boolean;
    callJoined: boolean;
    screenSharingEnabled?: boolean;
    updatedAt: number;
  };
}

export interface ScreenShareStartedMessage extends BaseWsMessage {
  type: 'SCREEN_SHARE_STARTED';
  payload?: {
    screenStreamId?: string;
    timestamp: number;
  };
}

export interface ScreenShareStoppedMessage extends BaseWsMessage {
  type: 'SCREEN_SHARE_STOPPED';
  payload?: {
    timestamp: number;
  };
}

export interface MovieStreamStartedMessage extends BaseWsMessage {
  type: 'MOVIE_STREAM_STARTED';
  payload: {
    ownerUserId: string;
    movieStreamId: string;
    fileName: string;
    duration?: number;
    timestamp: number;
  };
}

export interface MovieStreamStoppedMessage extends BaseWsMessage {
  type: 'MOVIE_STREAM_STOPPED';
  payload?: {
    ownerUserId?: string;
    timestamp: number;
  };
}

export interface MovieStreamControlMessage extends BaseWsMessage {
  type: 'MOVIE_STREAM_CONTROL';
  action: 'play' | 'pause' | 'stop';
  currentTime?: number;
}

export interface MovieStreamSeekMessage extends BaseWsMessage {
  type: 'MOVIE_STREAM_SEEK';
  currentTime: number;
  isPlaying?: boolean;
}

export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface PeerMediaState {
  userId: string;
  name: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  callJoined: boolean;
  screenSharing?: boolean;
  isMovieStreaming?: boolean;
  isHost?: boolean;
  stream?: MediaStream;
  screenStream?: MediaStream;
  movieStream?: MediaStream;
  connectionState?: PeerConnectionState;
  updatedAt?: number;
}

export interface VideoPlayMessage extends BaseWsMessage {
  type: 'VIDEO_PLAY';
  currentTime: number;
  serverTimestamp?: number;
}

export interface VideoPauseMessage extends BaseWsMessage {
  type: 'VIDEO_PAUSE';
  currentTime: number;
  serverTimestamp?: number;
}

export interface VideoSeekMessage extends BaseWsMessage {
  type: 'VIDEO_SEEK';
  currentTime: number;
  isPlaying?: boolean;
  serverTimestamp?: number;
}

export interface VideoSourceChangedMessage extends BaseWsMessage {
  type: 'VIDEO_SOURCE_CHANGED';
  source: VideoSource;
  currentTime?: number;
  isPlaying?: boolean;
}

export interface VideoRateChangedMessage extends BaseWsMessage {
  type: 'VIDEO_RATE_CHANGED';
  playbackRate: number;
  currentTime: number;
}

export interface VideoEndedMessage extends BaseWsMessage {
  type: 'VIDEO_ENDED';
  currentTime: number;
}

export interface LocalFileSelectedMessage extends BaseWsMessage {
  type: 'LOCAL_FILE_SELECTED';
  fileName: string;
  senderName: string;
}

export interface ChatWsMessage extends BaseWsMessage {
  type: 'CHAT_MESSAGE';
  message: ChatMessage;
}

export interface PingMessage {
  type: 'PING';
  timestamp: number;
}

export interface RoomPermissionsChangedMessage extends BaseWsMessage {
  type: 'ROOM_PERMISSIONS_CHANGED';
  allowAnyoneControl: boolean;
}

export type ClientMessage =
  | JoinRoomMessage
  | LeaveRoomMessage
  | WebRTCJoinMessage
  | WebRTCLeaveMessage
  | WebRTCOfferMessage
  | WebRTCAnswerMessage
  | WebRTCIceCandidateMessage
  | MediaStateChangedMessage
  | ScreenShareStartedMessage
  | ScreenShareStoppedMessage
  | MovieStreamStartedMessage
  | MovieStreamStoppedMessage
  | MovieStreamControlMessage
  | MovieStreamSeekMessage
  | VideoPlayMessage
  | VideoPauseMessage
  | VideoSeekMessage
  | VideoSourceChangedMessage
  | VideoRateChangedMessage
  | VideoEndedMessage
  | LocalFileSelectedMessage
  | ChatWsMessage
  | RoomPermissionsChangedMessage
  | PingMessage;

export interface RoomStateSyncMessage {
  type: 'ROOM_STATE_SYNC';
  roomId: string;
  room: Room;
  chatMessages: ChatMessage[];
  serverTimestamp: number;
}

export interface UserJoinedMessage {
  type: 'USER_JOINED';
  roomId: string;
  user: RoomUser;
  timestamp: number;
}

export interface UserLeftMessage {
  type: 'USER_LEFT';
  roomId: string;
  userId: string;
  timestamp: number;
}

export interface PongMessage {
  type: 'PONG';
  timestamp: number;
}

export interface ErrorMessage {
  type: 'ERROR';
  message: string;
  code?: string;
}

export type ServerMessage =
  | RoomStateSyncMessage
  | UserJoinedMessage
  | UserLeftMessage
  | WebRTCJoinMessage
  | WebRTCLeaveMessage
  | WebRTCOfferMessage
  | WebRTCAnswerMessage
  | WebRTCIceCandidateMessage
  | MediaStateChangedMessage
  | ScreenShareStartedMessage
  | ScreenShareStoppedMessage
  | MovieStreamStartedMessage
  | MovieStreamStoppedMessage
  | MovieStreamControlMessage
  | MovieStreamSeekMessage
  | VideoPlayMessage
  | VideoPauseMessage
  | VideoSeekMessage
  | VideoSourceChangedMessage
  | VideoRateChangedMessage
  | VideoEndedMessage
  | LocalFileSelectedMessage
  | ChatWsMessage
  | RoomPermissionsChangedMessage
  | PongMessage
  | ErrorMessage;

// Legacy alias for compatibility
export type VideoSyncEventType = VideoEventType;
export interface VideoSyncEvent {
  type: VideoSyncEventType;
  roomId: string;
  senderId: string;
  source?: VideoSource;
  isPlaying?: boolean;
  currentTime?: number;
  playbackRate?: number;
  timestamp: number;
}
