import React, { useState, useEffect, createContext, useContext } from 'react';
import { Member, ChatMessage, VideoState, RoomState, ViewType } from '../types';

interface RoomContextType {
  view: ViewType;
  setView: (view: ViewType) => void;
  roomState: RoomState | null;
  createRoom: (userName: string, roomName: string) => string;
  joinRoom: (userName: string, roomId: string) => boolean;
  leaveRoom: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  sendChatMessage: (text: string) => void;
  changeVideoSource: (sourceType: 'youtube' | 'aparat' | 'direct' | 'local', url: string, title?: string) => void;
  setVideoPlaying: (isPlaying: boolean) => void;
  seekVideo: (time: number) => void;
  setVideoQuality: (quality: string) => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

// Generate random ID
const generateId = () => Math.random().toString(36).substring(2, 9);

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<ViewType>('home');
  const [roomState, setRoomState] = useState<RoomState | null>(null);

  // Parse initial URL path or hash to see if we should auto-join a room
  useEffect(() => {
    const handleUrlRouting = () => {
      // Support both standard URL path /room/ROOM_ID and hash #/room/ROOM_ID
      const pathParts = window.location.pathname.split('/');
      let roomIdFromUrl = '';

      if (pathParts[1] === 'room' && pathParts[2]) {
        roomIdFromUrl = pathParts[2];
      } else {
        const hashParts = window.location.hash.split('/');
        if (hashParts[0] === '#/room' && hashParts[1]) {
          roomIdFromUrl = hashParts[1];
        }
      }

      if (roomIdFromUrl) {
        // We have a direct room URL, switch to join room view with prefilled ID
        setView('join-room');
        // Initialize a draft state or prefill it
        setRoomState({
          roomId: roomIdFromUrl,
          roomName: `اتاق ${roomIdFromUrl}`,
          currentUser: null,
          members: getMockMembers(''),
          chatMessages: getMockMessages(),
          currentVideo: getInitialVideoState()
        });
      }
    };

    handleUrlRouting();
    window.addEventListener('popstate', handleUrlRouting);
    return () => window.removeEventListener('popstate', handleUrlRouting);
  }, []);

  const getInitialVideoState = (): VideoState => ({
    sourceType: null,
    url: '',
    title: 'ویدیویی انتخاب نشده است',
    isPlaying: false,
    currentTime: 0,
    duration: 360, // 6 minutes mock duration
    quality: '1080p'
  });

  const getMockMembers = (myId: string): Member[] => [
    {
      id: 'member-1',
      name: 'آرمین',
      isMe: false,
      isOnline: true,
      isMicActive: true,
      isCameraActive: true,
      isScreenSharing: false,
    },
    {
      id: 'member-2',
      name: 'سهراب',
      isMe: false,
      isOnline: true,
      isMicActive: false,
      isCameraActive: true,
      isScreenSharing: false,
    },
    {
      id: 'member-3',
      name: 'الناز',
      isMe: false,
      isOnline: true,
      isMicActive: true,
      isCameraActive: false,
      isScreenSharing: false,
    },
    {
      id: 'member-4',
      name: 'بهار',
      isMe: false,
      isOnline: false,
      isMicActive: false,
      isCameraActive: false,
      isScreenSharing: false,
    }
  ];

  const getMockMessages = (): ChatMessage[] => [
    {
      id: 'msg-1',
      senderId: 'member-1',
      senderName: 'آرمین',
      text: 'سلام بچه‌ها! خوش اومدین به واچ پارتی امروز 🙌',
      timestamp: '۱۵:۳۰'
    },
    {
      id: 'msg-2',
      senderId: 'member-2',
      senderName: 'سهراب',
      text: 'سلام! چه فیلمی رو می‌خوایم ببینیم؟ 🍿',
      timestamp: '۱۵:۳۱'
    },
    {
      id: 'msg-3',
      senderId: 'member-3',
      senderName: 'الناز',
      text: 'من یه ویدیوی خفن توی یوتیوب پیدا کردم، لینکش رو بذاریم همگی ببینیم.',
      timestamp: '۱۵:۳۳'
    }
  ];

  // Create room
  const createRoom = (userName: string, roomName: string): string => {
    const roomId = generateId();
    const myId = 'me-' + generateId();
    
    const me: Member = {
      id: myId,
      name: userName || 'کاربر جدید',
      isMe: true,
      isOnline: true,
      isMicActive: true,
      isCameraActive: false,
      isScreenSharing: false
    };

    const newRoomState: RoomState = {
      roomId,
      roomName: roomName || 'اتاق دوستانه',
      currentUser: me,
      members: [me, ...getMockMembers(myId)],
      chatMessages: [
        {
          id: 'system-1',
          senderId: 'system',
          senderName: 'سیستم',
          text: `اتاق «${roomName || 'اتاق دوستانه'}» با موفقیت ساخته شد.`,
          timestamp: getCurrentTimeStr()
        }
      ],
      currentVideo: getInitialVideoState()
    };

    setRoomState(newRoomState);
    setView('room');

    // Update URL pathname cleanly
    window.history.pushState(null, '', `/room/${roomId}`);
    return roomId;
  };

  // Join room
  const joinRoom = (userName: string, roomId: string): boolean => {
    if (!roomId) return false;
    const cleanRoomId = roomId.trim();
    const myId = 'me-' + generateId();

    const me: Member = {
      id: myId,
      name: userName || 'مهمان جدید',
      isMe: true,
      isOnline: true,
      isMicActive: true,
      isCameraActive: false,
      isScreenSharing: false
    };

    const targetRoomName = roomState?.roomId === cleanRoomId ? roomState.roomName : `اتاق ${cleanRoomId}`;
    const existingVideo = roomState?.roomId === cleanRoomId ? roomState.currentVideo : getInitialVideoState();

    const newRoomState: RoomState = {
      roomId: cleanRoomId,
      roomName: targetRoomName,
      currentUser: me,
      members: [me, ...getMockMembers(myId)],
      chatMessages: [
        ...getMockMessages(),
        {
          id: 'system-join',
          senderId: 'system',
          senderName: 'سیستم',
          text: `کاربر ${me.name} وارد اتاق شد.`,
          timestamp: getCurrentTimeStr()
        }
      ],
      currentVideo: existingVideo
    };

    setRoomState(newRoomState);
    setView('room');

    window.history.pushState(null, '', `/room/${cleanRoomId}`);
    return true;
  };

  // Leave room
  const leaveRoom = () => {
    setRoomState(null);
    setView('home');
    window.history.pushState(null, '', '/');
  };

  // Toggle user microphone
  const toggleMic = () => {
    if (!roomState || !roomState.currentUser) return;
    
    const updatedUser = {
      ...roomState.currentUser,
      isMicActive: !roomState.currentUser.isMicActive
    };

    setRoomState({
      ...roomState,
      currentUser: updatedUser,
      members: roomState.members.map(m => m.isMe ? updatedUser : m)
    });
  };

  // Toggle user camera
  const toggleCamera = () => {
    if (!roomState || !roomState.currentUser) return;

    const updatedUser = {
      ...roomState.currentUser,
      isCameraActive: !roomState.currentUser.isCameraActive
    };

    setRoomState({
      ...roomState,
      currentUser: updatedUser,
      members: roomState.members.map(m => m.isMe ? updatedUser : m)
    });
  };

  // Toggle screen sharing
  const toggleScreenShare = () => {
    if (!roomState || !roomState.currentUser) return;

    const nextSharing = !roomState.currentUser.isScreenSharing;
    const updatedUser = {
      ...roomState.currentUser,
      isScreenSharing: nextSharing
    };

    // If starting to share, change video source type to 'local' or show mock stream
    let updatedVideo = { ...roomState.currentVideo };
    if (nextSharing) {
      updatedVideo = {
        sourceType: 'local',
        url: 'screen-share',
        title: `صفحه نمایش ${roomState.currentUser.name}`,
        isPlaying: true,
        currentTime: 0,
        duration: 0,
        quality: '720p'
      };
    } else if (roomState.currentVideo.sourceType === 'local' && roomState.currentVideo.url === 'screen-share') {
      // Revert to null state
      updatedVideo = getInitialVideoState();
    }

    setRoomState({
      ...roomState,
      currentUser: updatedUser,
      currentVideo: updatedVideo,
      members: roomState.members.map(m => m.isMe ? updatedUser : m)
    });
  };

  // Send Chat message
  const sendChatMessage = (text: string) => {
    if (!roomState || !roomState.currentUser || !text.trim()) return;

    const newMessage: ChatMessage = {
      id: 'msg-' + generateId(),
      senderId: roomState.currentUser.id,
      senderName: roomState.currentUser.name,
      text: text.trim(),
      timestamp: getCurrentTimeStr()
    };

    const updatedMessages = [...roomState.chatMessages, newMessage];

    setRoomState({
      ...roomState,
      chatMessages: updatedMessages
    });

    // Simulated responses after sending a message to make it interactive and alive
    setTimeout(() => {
      const responses = [
        'عالیه دمت گرم 👍',
        'صدات یکم ضعیفه سهراب',
        'به به بالاخره جمعمون جمع شد 🎉',
        'من موافقم، بریم ویدیو رو ببینیم',
        'من پاپ‌کورنم آماده‌ست🍿🍿',
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      const randomMember = roomState.members.filter(m => !m.isMe && m.isOnline)[Math.floor(Math.random() * (roomState.members.length - 1))] || roomState.members[1];
      
      const simulatedMsg: ChatMessage = {
        id: 'msg-sim-' + generateId(),
        senderId: randomMember.id,
        senderName: randomMember.name,
        text: randomResponse,
        timestamp: getCurrentTimeStr()
      };

      setRoomState(prev => {
        if (!prev) return null;
        return {
          ...prev,
          chatMessages: [...prev.chatMessages, simulatedMsg]
        };
      });
    }, 2000);
  };

  // Helper to format Persian numbers for current time
  const getCurrentTimeStr = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Change video source
  const changeVideoSource = (
    sourceType: 'youtube' | 'aparat' | 'direct' | 'local',
    url: string,
    title?: string
  ) => {
    if (!roomState) return;

    let defaultTitle = 'ویدیو از آدرس مستقیم';
    if (sourceType === 'youtube') {
      defaultTitle = 'ویدیوی یوتیوب';
    } else if (sourceType === 'aparat') {
      defaultTitle = 'ویدیوی آپارات';
    } else if (sourceType === 'local') {
      defaultTitle = title || 'فایل ویدیوی محلی';
    }

    // Clean URL parsing or display title extraction
    let cleanTitle = title || defaultTitle;
    if (sourceType === 'youtube') {
      try {
        const urlObj = new URL(url);
        const vParam = urlObj.searchParams.get('v');
        if (vParam) {
          cleanTitle = `ویدیوی یوتیوب (${vParam})`;
        } else {
          const parts = url.split('/');
          cleanTitle = `ویدیوی یوتیوب (${parts[parts.length - 1]})`;
        }
      } catch (e) {
        cleanTitle = 'ویدیوی یوتیوب';
      }
    } else if (sourceType === 'aparat') {
      const parts = url.split('/');
      cleanTitle = `ویدیوی آپارات (${parts[parts.length - 1] || ''})`;
    }

    const updatedVideo: VideoState = {
      sourceType,
      url,
      title: cleanTitle,
      isPlaying: true,
      currentTime: 0,
      duration: sourceType === 'local' ? 720 : 450, // mock duration
      quality: '1080p'
    };

    const systemMsg: ChatMessage = {
      id: 'system-' + generateId(),
      senderId: 'system',
      senderName: 'سیستم',
      text: `منبع ویدیو تغییر کرد به: ${cleanTitle}`,
      timestamp: getCurrentTimeStr()
    };

    setRoomState({
      ...roomState,
      currentVideo: updatedVideo,
      chatMessages: [...roomState.chatMessages, systemMsg]
    });
  };

  // Set video playing status
  const setVideoPlaying = (isPlaying: boolean) => {
    if (!roomState) return;

    const updatedVideo = {
      ...roomState.currentVideo,
      isPlaying
    };

    const systemMsg: ChatMessage = {
      id: 'system-' + generateId(),
      senderId: 'system',
      senderName: 'سیستم',
      text: isPlaying ? 'ویدیو پخش شد' : 'ویدیو متوقف شد',
      timestamp: getCurrentTimeStr()
    };

    setRoomState({
      ...roomState,
      currentVideo: updatedVideo,
      chatMessages: [...roomState.chatMessages, systemMsg]
    });
  };

  // Seek video
  const seekVideo = (time: number) => {
    if (!roomState) return;

    const updatedVideo = {
      ...roomState.currentVideo,
      currentTime: Math.min(Math.max(0, time), roomState.currentVideo.duration)
    };

    setRoomState({
      ...roomState,
      currentVideo: updatedVideo
    });
  };

  // Set Video Quality
  const setVideoQuality = (quality: string) => {
    if (!roomState) return;

    const updatedVideo = {
      ...roomState.currentVideo,
      quality
    };

    setRoomState({
      ...roomState,
      currentVideo: updatedVideo
    });
  };

  return (
    <RoomContext.Provider value={{
      view,
      setView,
      roomState,
      createRoom,
      joinRoom,
      leaveRoom,
      toggleMic,
      toggleCamera,
      toggleScreenShare,
      sendChatMessage,
      changeVideoSource,
      setVideoPlaying,
      seekVideo,
      setVideoQuality
    }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (context === undefined) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
}
