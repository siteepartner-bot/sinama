import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import {
  Room,
  RoomUser,
  MediaState,
  ChatMessage,
  RoomState,
  ViewType,
  ConnectionStatus,
  VideoSource,
  PeerMediaState
} from '../types';
import { roomService } from '../services/roomService';
import { webRTCManager } from '../services/webRTCManager';
import { parseYouTubeUrl, parseAparatUrl } from '../utils/mediaParsers';

interface RoomContextType {
  view: ViewType;
  setView: (view: ViewType) => void;
  roomState: RoomState | null;
  currentUser: RoomUser | null;
  isHost: boolean;
  isLoading: boolean;
  error: string | null;
  pendingRoomId: string | null;
  connectionStatus: ConnectionStatus;
  clearError: () => void;
  createRoom: (userName: string, roomName?: string, customRoomId?: string) => Promise<string>;
  joinRoom: (userName: string, roomId: string, autoCreateIfNotFound?: boolean) => Promise<boolean>;
  joinDirectly: (userName: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  peerMediaStates: Map<string, PeerMediaState>;
  isInCall: boolean;
  joinCall: (initialMic?: boolean, initialCamera?: boolean) => Promise<boolean>;
  leaveCall: () => void;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  sendChatMessage: (text: string) => Promise<void>;
  changeVideoSource: (sourceType: 'youtube' | 'aparat' | 'direct' | 'local', url: string, title?: string) => Promise<void>;
  setVideoPlaying: (isPlaying: boolean, currentTime?: number) => Promise<void>;
  seekVideo: (time: number, isPlaying?: boolean) => Promise<void>;
  setVideoQuality: (quality: string) => Promise<void>;
  setPlaybackRate: (rate: number) => Promise<void>;
  handleVideoEnded: () => Promise<void>;
  allowAnyoneControl: boolean;
  canControlVideo: boolean;
  setRoomControlPermission: (allow: boolean) => Promise<void>;
  toggleRoomControlPermission: () => Promise<void>;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = useState<ViewType>('home');
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<RoomUser | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');

  // WebRTC Media States
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peerMediaStates, setPeerMediaStates] = useState<Map<string, PeerMediaState>>(new Map());
  const [isInCall, setIsInCall] = useState<boolean>(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const statusUnsubRef = useRef<(() => void) | null>(null);

  // Subscribe to connection status changes
  useEffect(() => {
    statusUnsubRef.current = roomService.onConnectionStatus((status) => {
      setConnectionStatus(status);
    });
    return () => {
      if (statusUnsubRef.current) {
        statusUnsubRef.current();
      }
    };
  }, []);

  // Subscribe to WebRTC manager state updates
  useEffect(() => {
    const unsub = webRTCManager.subscribe({
      onLocalStreamChange: (stream) => setLocalStream(stream),
      onRemoteStreamsChange: (streams) => setRemoteStreams(streams),
      onPeerStatesChange: (states) => setPeerMediaStates(states),
      onCallStateChange: (inCall) => setIsInCall(inCall),
      onError: (errMsg) => setError(errMsg)
    });
    return () => unsub();
  }, []);

  // Helper to change view and synchronize URL history
  const setView = useCallback((newView: ViewType, pathOverride?: string) => {
    setViewState(newView);
    setError(null);

    let targetPath = '/';
    if (pathOverride) {
      targetPath = pathOverride;
    } else if (newView === 'create-room') {
      targetPath = '/create-room';
    } else if (newView === 'join-room') {
      targetPath = '/join-room';
    } else if (newView === 'room' && currentRoom) {
      targetPath = `/room/${currentRoom.roomId}`;
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }, [currentRoom]);

  // Subscribe to real-time room updates from service
  const setupRoomSubscription = useCallback((roomId: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const unsub = roomService.subscribe(roomId, (updatedRoom, updatedMessages) => {
      setCurrentRoom(updatedRoom);
      setChatMessages(updatedMessages);

      // Keep currentUser reference synchronized
      const activeSession = roomService.getActiveSession(roomId);
      if (activeSession) {
        const freshUser = updatedRoom.users.find((u) => u.userId === activeSession.userId);
        if (freshUser) {
          setCurrentUser(freshUser);
        }
      }
    });

    unsubscribeRef.current = unsub;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Initialize and parse current URL on load / popstate
  const handleUrlRoute = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const path = window.location.pathname;
    const pathParts = path.split('/').filter(Boolean);

    let roomId: string | null = null;
    if (pathParts[0] === 'room' && pathParts[1]) {
      roomId = pathParts[1];
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#/room/')) {
        roomId = hash.replace('#/room/', '');
      }
    }

    if (roomId) {
      setPendingRoomId(roomId);
      const room = await roomService.getRoom(roomId);

      if (!room) {
        setViewState('room');
        setIsLoading(false);
        return;
      }

      const sessionUser = roomService.getActiveSession(roomId);
      const existingUserInRoom = sessionUser ? room.users.find((u) => u.userId === sessionUser.userId) : null;

      if (existingUserInRoom) {
        setCurrentRoom(room);
        setCurrentUser(existingUserInRoom);
        setupRoomSubscription(roomId);
        setViewState('room');
      } else {
        setCurrentRoom(room);
        setCurrentUser(null);
        setViewState('room');
      }
    } else if (pathParts[0] === 'create-room') {
      setViewState('create-room');
    } else if (pathParts[0] === 'join-room') {
      setViewState('join-room');
    } else {
      setViewState('home');
    }

    setIsLoading(false);
  }, [setupRoomSubscription]);

  useEffect(() => {
    handleUrlRoute();

    const onPopState = () => {
      handleUrlRoute();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleUrlRoute]);

  // Create Room
  const createRoom = async (userName: string, roomName?: string, customRoomId?: string): Promise<string> => {
    try {
      setIsLoading(true);
      setError(null);

      const { room, currentUser: user } = await roomService.createRoom(userName, roomName, customRoomId);

      setCurrentRoom(room);
      setCurrentUser(user);
      setPendingRoomId(null);
      setupRoomSubscription(room.roomId);

      setViewState('room');
      window.history.pushState(null, '', `/room/${room.roomId}`);
      return room.roomId;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطای نامشخص در ایجاد اتاق';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Join Room by Code / ID
  const joinRoom = async (userName: string, roomId: string, autoCreateIfNotFound = true): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const { room, currentUser: user } = await roomService.joinRoom(roomId, userName, autoCreateIfNotFound);

      setCurrentRoom(room);
      setCurrentUser(user);
      setPendingRoomId(null);
      setupRoomSubscription(room.roomId);

      setViewState('room');
      window.history.pushState(null, '', `/room/${room.roomId}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در ورود به اتاق';
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Join directly
  const joinDirectly = async (userName: string): Promise<boolean> => {
    const targetRoomId = currentRoom?.roomId || pendingRoomId || '1234';
    return joinRoom(userName, targetRoomId, true);
  };

  // Leave Room
  const leaveRoom = async () => {
    // Teardown WebRTC call immediately
    webRTCManager.cleanup();

    if (currentRoom && currentUser) {
      try {
        await roomService.leaveRoom(currentRoom.roomId, currentUser.userId);
      } catch (e) {
        console.error('Error leaving room', e);
      }
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    setCurrentRoom(null);
    setCurrentUser(null);
    setChatMessages([]);
    setPendingRoomId(null);
    setError(null);

    setViewState('home');
    window.history.pushState(null, '', '/');
  };

  // WebRTC Real-Time Voice/Video Call Controls
  const joinCall = async (initialMic = true, initialCamera = false): Promise<boolean> => {
    const success = await webRTCManager.joinCall(initialMic, initialCamera);
    if (success && currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, callJoined: true, micEnabled: initialMic, cameraEnabled: initialCamera } : null));
    }
    return success;
  };

  const leaveCall = () => {
    webRTCManager.leaveCall();
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, callJoined: false, micEnabled: false, cameraEnabled: false } : null));
    }
  };

  const toggleMic = async () => {
    if (!isInCall) {
      await joinCall(true, false);
      return;
    }
    const isMicOn = await webRTCManager.toggleMic();
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, micEnabled: isMicOn } : null));
    }
  };

  const toggleCamera = async () => {
    if (!isInCall) {
      await joinCall(true, true);
      return;
    }
    const isCamOn = await webRTCManager.toggleCamera();
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, cameraEnabled: isCamOn } : null));
    }
  };

  const toggleScreenShare = async () => {
    if (!currentRoom || !currentUser) return;
    const nextState = !currentUser.screenSharingEnabled;
    await roomService.updateUserMedia(currentRoom.roomId, currentUser.userId, { screenSharingEnabled: nextState });
    setCurrentUser((prev) => (prev ? { ...prev, screenSharingEnabled: nextState } : null));
  };

  // Send chat message
  const sendChatMessage = async (text: string) => {
    if (!currentRoom || !currentUser) return;
    await roomService.sendChatMessage(currentRoom.roomId, currentUser.userId, currentUser.name, text);
  };

  const isHost = !!(currentUser && currentRoom && (currentUser.isHost || currentUser.userId === currentRoom.hostId));
  // ALL_ROOM_MEMBERS_CAN_CONTROL_MEDIA: Equal media control permissions for Host and all Members
  const allowAnyoneControl = true;
  const canControlVideo = true;

  const setRoomControlPermission = async (allow: boolean) => {
    if (!currentRoom) return;
    roomService.broadcastRoomPermissions(currentRoom.roomId, allow);
  };

  const toggleRoomControlPermission = async () => {
    await setRoomControlPermission(true);
  };

  // Real-Time Video Synchronizers
  const changeVideoSource = async (
    sourceType: 'youtube' | 'aparat' | 'direct' | 'local',
    url: string,
    title?: string
  ) => {
    if (!currentRoom) return;

    console.log('[LOCAL VIDEO EVENT]', {
      userId: currentUser?.userId,
      isHost,
      eventType: 'VIDEO_SOURCE_CHANGED',
      sourceType,
      url,
      title
    });

    if (sourceType === 'local') {
      // Local computer file: notify room about local file without streaming the blob
      const cleanFileName = title || 'فایل ویدیوی سیستم';
      roomService.broadcastLocalFile(currentRoom.roomId, cleanFileName);
      // For local user, set the sourceUrl locally
      roomService.updateMediaState(currentRoom.roomId, {
        sourceType: 'local',
        sourceUrl: url,
        title: cleanFileName,
        fileName: cleanFileName,
        isPlaying: true,
        currentTime: 0
      });
      return;
    }

    let videoId: string | undefined;
    if (sourceType === 'youtube') {
      videoId = parseYouTubeUrl(url).videoId || undefined;
    } else if (sourceType === 'aparat') {
      videoId = parseAparatUrl(url).videoHash || undefined;
    }

    const source: VideoSource = {
      type: sourceType,
      url,
      videoId,
      title: title || (sourceType === 'youtube' ? 'ویدیوی یوتیوب' : sourceType === 'aparat' ? 'ویدیوی آپارات' : 'ویدیوی مستقیم'),
      duration: 360
    };

    roomService.broadcastSourceChange(currentRoom.roomId, source, 0, true);
  };

  const setVideoPlaying = async (isPlaying: boolean, currentTime?: number) => {
    if (!currentRoom) return;

    const time = currentTime !== undefined ? currentTime : currentRoom.mediaState.currentTime || 0;

    console.log('[LOCAL VIDEO EVENT]', {
      userId: currentUser?.userId,
      isHost,
      eventType: isPlaying ? 'VIDEO_PLAY' : 'VIDEO_PAUSE',
      currentTime: time
    });

    if (isPlaying) {
      roomService.broadcastPlay(currentRoom.roomId, time);
    } else {
      roomService.broadcastPause(currentRoom.roomId, time);
    }
  };

  const seekVideo = async (currentTime: number, isPlaying?: boolean) => {
    if (!currentRoom) return;

    console.log('[LOCAL VIDEO EVENT]', {
      userId: currentUser?.userId,
      isHost,
      eventType: 'VIDEO_SEEK',
      currentTime,
      isPlaying
    });

    roomService.broadcastSeek(currentRoom.roomId, currentTime, isPlaying);
  };

  const setPlaybackRate = async (playbackRate: number) => {
    if (!currentRoom) return;

    const currentTime = currentRoom.mediaState.currentTime || 0;

    console.log('[LOCAL VIDEO EVENT]', {
      userId: currentUser?.userId,
      isHost,
      eventType: 'VIDEO_RATE_CHANGED',
      playbackRate,
      currentTime
    });

    roomService.broadcastRateChange(currentRoom.roomId, playbackRate, currentTime);
  };

  const handleVideoEnded = async () => {
    if (!currentRoom) return;

    const currentTime = currentRoom.mediaState.duration || currentRoom.mediaState.currentTime || 0;

    console.log('[LOCAL VIDEO EVENT]', {
      userId: currentUser?.userId,
      isHost,
      eventType: 'VIDEO_ENDED',
      currentTime
    });

    roomService.broadcastVideoEnded(currentRoom.roomId, currentTime);
  };

  const setVideoQuality = async (quality: string) => {
    if (!currentRoom) return;
    await roomService.updateMediaState(currentRoom.roomId, { quality });
  };

  const clearError = () => setError(null);

  // Computed RoomState
  const roomState: RoomState | null = currentRoom
    ? {
        ...currentRoom,
        currentUser,
        members: currentRoom.users.map((u) => ({
          ...u,
          id: u.userId,
          isMe: currentUser?.userId === u.userId,
          isMicActive: u.micEnabled,
          isCameraActive: u.cameraEnabled,
          isScreenSharing: !!u.screenSharingEnabled
        })),
        chatMessages,
        currentVideo: {
          ...currentRoom.mediaState,
          url: currentRoom.mediaState.sourceUrl
        }
      }
    : null;

  return (
    <RoomContext.Provider
      value={{
        view,
        setView,
        roomState,
        currentUser,
        isHost,
        allowAnyoneControl,
        canControlVideo,
        setRoomControlPermission,
        toggleRoomControlPermission,
        isLoading,
        error,
        pendingRoomId,
        connectionStatus,
        clearError,
        createRoom,
        joinRoom,
        joinDirectly,
        leaveRoom,
        localStream,
        remoteStreams,
        peerMediaStates,
        isInCall,
        joinCall,
        leaveCall,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
        sendChatMessage,
        changeVideoSource,
        setVideoPlaying,
        seekVideo,
        setVideoQuality,
        setPlaybackRate,
        handleVideoEnded
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
}
