import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { Room, RoomUser, MediaState, ChatMessage, RoomState, ViewType } from '../types';
import { roomService } from '../services/roomService';

interface RoomContextType {
  view: ViewType;
  setView: (view: ViewType) => void;
  roomState: RoomState | null;
  currentUser: RoomUser | null;
  isHost: boolean;
  isLoading: boolean;
  error: string | null;
  pendingRoomId: string | null;
  clearError: () => void;
  createRoom: (userName: string, roomName?: string) => Promise<string>;
  joinRoom: (userName: string, roomId: string) => Promise<boolean>;
  joinDirectly: (userName: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  sendChatMessage: (text: string) => Promise<void>;
  changeVideoSource: (sourceType: 'youtube' | 'aparat' | 'direct' | 'local', url: string, title?: string) => Promise<void>;
  setVideoPlaying: (isPlaying: boolean) => Promise<void>;
  seekVideo: (time: number) => Promise<void>;
  setVideoQuality: (quality: string) => Promise<void>;
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

  const unsubscribeRef = useRef<(() => void) | null>(null);

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
        const freshUser = updatedRoom.users.find(u => u.userId === activeSession.userId);
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

    // Check if URL is /room/:roomId
    let roomId: string | null = null;
    if (pathParts[0] === 'room' && pathParts[1]) {
      roomId = pathParts[1];
    } else {
      // Hash fallback check: #/room/XYZ
      const hash = window.location.hash;
      if (hash.startsWith('#/room/')) {
        roomId = hash.replace('#/room/', '');
      }
    }

    if (roomId) {
      setPendingRoomId(roomId);
      const room = await roomService.getRoom(roomId);

      if (!room) {
        setError('این اتاق وجود ندارد یا منقضی شده است.');
        setViewState('room'); // Let RoomPage display the "Room Not Found" error card
        setIsLoading(false);
        return;
      }

      // Check if user already has an active session in this room
      const sessionUser = roomService.getActiveSession(roomId);
      const existingUserInRoom = sessionUser ? room.users.find(u => u.userId === sessionUser.userId) : null;

      if (existingUserInRoom) {
        // Automatically rejoin
        setCurrentRoom(room);
        setCurrentUser(existingUserInRoom);
        setupRoomSubscription(roomId);
        setViewState('room');
      } else {
        // Room exists, but user needs to enter their name
        setCurrentRoom(room);
        setCurrentUser(null);
        setViewState('room'); // RoomPage will show the friendly "Enter Name to Join" modal
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
  const createRoom = async (userName: string, roomName?: string): Promise<string> => {
    try {
      setIsLoading(true);
      setError(null);

      const { room, currentUser: user } = await roomService.createRoom(userName, roomName);

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
  const joinRoom = async (userName: string, roomId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const { room, currentUser: user } = await roomService.joinRoom(roomId, userName);

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

  // Join directly for users who clicked a shared link
  const joinDirectly = async (userName: string): Promise<boolean> => {
    if (!pendingRoomId && !currentRoom?.roomId) {
      setError('شناسه اتاق نامعتبر است.');
      return false;
    }
    const targetRoomId = (currentRoom?.roomId || pendingRoomId)!;
    return joinRoom(userName, targetRoomId);
  };

  // Leave Room
  const leaveRoom = async () => {
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

  // Toggle user audio
  const toggleMic = async () => {
    if (!currentRoom || !currentUser) return;
    const nextState = !currentUser.micEnabled;
    await roomService.updateUserMedia(currentRoom.roomId, currentUser.userId, { micEnabled: nextState });
    setCurrentUser(prev => prev ? { ...prev, micEnabled: nextState } : null);
  };

  // Toggle user camera
  const toggleCamera = async () => {
    if (!currentRoom || !currentUser) return;
    const nextState = !currentUser.cameraEnabled;
    await roomService.updateUserMedia(currentRoom.roomId, currentUser.userId, { cameraEnabled: nextState });
    setCurrentUser(prev => prev ? { ...prev, cameraEnabled: nextState } : null);
  };

  // Toggle screen share
  const toggleScreenShare = async () => {
    if (!currentRoom || !currentUser) return;
    const nextState = !currentUser.screenSharingEnabled;
    await roomService.updateUserMedia(currentRoom.roomId, currentUser.userId, { screenSharingEnabled: nextState });
    setCurrentUser(prev => prev ? { ...prev, screenSharingEnabled: nextState } : null);
  };

  // Send chat message
  const sendChatMessage = async (text: string) => {
    if (!currentRoom || !currentUser) return;
    await roomService.sendChatMessage(currentRoom.roomId, currentUser.userId, currentUser.name, text);
  };

  // Video state controls (Authorized for all members as requested in Phase 2)
  const changeVideoSource = async (
    sourceType: 'youtube' | 'aparat' | 'direct' | 'local',
    url: string,
    title?: string
  ) => {
    if (!currentRoom) return;
    const updatedMedia: Partial<MediaState> = {
      sourceType,
      sourceUrl: url,
      title: title || (sourceType === 'local' ? 'ویدیوی محلی کاربر' : 'ویدیوی جدید'),
      isPlaying: true,
      currentTime: 0
    };
    await roomService.updateMediaState(currentRoom.roomId, updatedMedia);
  };

  const setVideoPlaying = async (isPlaying: boolean) => {
    if (!currentRoom) return;
    await roomService.updateMediaState(currentRoom.roomId, { isPlaying });
  };

  const seekVideo = async (currentTime: number) => {
    if (!currentRoom) return;
    await roomService.updateMediaState(currentRoom.roomId, { currentTime });
  };

  const setVideoQuality = async (quality: string) => {
    if (!currentRoom) return;
    await roomService.updateMediaState(currentRoom.roomId, { quality });
  };

  const clearError = () => setError(null);

  // Computed RoomState object providing backward-compatible props
  const roomState: RoomState | null = currentRoom
    ? {
        ...currentRoom,
        currentUser,
        members: currentRoom.users.map(u => ({
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

  const isHost = !!(currentUser && currentRoom && (currentUser.isHost || currentUser.userId === currentRoom.hostId));

  return (
    <RoomContext.Provider
      value={{
        view,
        setView,
        roomState,
        currentUser,
        isHost,
        isLoading,
        error,
        pendingRoomId,
        clearError,
        createRoom,
        joinRoom,
        joinDirectly,
        leaveRoom,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
        sendChatMessage,
        changeVideoSource,
        setVideoPlaying,
        seekVideo,
        setVideoQuality
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
