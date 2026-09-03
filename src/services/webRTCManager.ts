import {
  RoomUser,
  ServerMessage,
  PeerConnectionState,
  PeerMediaState,
  WebRTCOfferMessage,
  WebRTCAnswerMessage,
  WebRTCIceCandidateMessage,
  MediaStateChangedMessage,
  WebRTCJoinMessage,
  WebRTCLeaveMessage,
  MovieStreamStartedMessage,
  MovieStreamStoppedMessage,
  MovieStreamControlMessage,
  MovieStreamSeekMessage
} from '../types';
import { realTimeClient } from './realtimeClient';
import { roomService } from './roomService';

export interface WebRTCManagerListeners {
  onLocalStreamChange?: (stream: MediaStream | null) => void;
  onLocalScreenStreamChange?: (stream: MediaStream | null) => void;
  onLocalMovieStreamChange?: (stream: MediaStream | null) => void;
  onRemoteStreamsChange?: (remoteStreams: Map<string, MediaStream>) => void;
  onRemoteScreenStreamsChange?: (remoteScreenStreams: Map<string, MediaStream>) => void;
  onRemoteMovieStreamChange?: (stream: MediaStream | null, ownerInfo?: { userId: string; fileName: string } | null) => void;
  onPeerStatesChange?: (peerStates: Map<string, PeerMediaState>) => void;
  onError?: (errorMessage: string) => void;
  onCallStateChange?: (isInCall: boolean) => void;
  onScreenSharingChange?: (isScreenSharing: boolean) => void;
  onMovieStreamingChange?: (isMovieStreaming: boolean) => void;
}

/**
 * WebRTCManager - Modular Multi-User WebRTC Mesh Service.
 * Manages MediaStreams, RTCPeerConnections per peer, deterministic collision-free Perfect Negotiation,
 * ICE candidates queuing, graceful fallback, Screen Sharing, Local Video File Live Streaming via captureStream(),
 * and clean lifecycle teardown.
 */
export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private localMovieStream: MediaStream | null = null;
  private remoteMovieStream: MediaStream | null = null;
  private isScreenSharing = false;
  private isMovieStreaming = false;
  private movieStreamOwnerInfo: { userId: string; fileName: string } | null = null;

  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private remoteScreenStreams: Map<string, MediaStream> = new Map();
  private peerMediaStates: Map<string, PeerMediaState> = new Map();
  private iceCandidatesQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  private makingOffer: Map<string, boolean> = new Map();
  private isSettingRemoteAnswerPending: Map<string, boolean> = new Map();
  private remotePeerScreenStreamIds: Map<string, string> = new Map();
  private knownRemoteScreenStreams: Map<string, { userId: string; screenStreamId?: string; receivedAt: number }> = new Map();
  private knownRemoteMovieStreams: Map<string, { ownerUserId: string; movieStreamId: string; fileName: string; duration?: number; receivedAt: number }> = new Map();
  private bufferedVideoTracks: Map<string, Array<{ track: MediaStreamTrack; stream: MediaStream; addedAt: number }>> = new Map();
  private bufferedMovieTracks: Map<string, Array<{ track: MediaStreamTrack; stream: MediaStream; addedAt: number }>> = new Map();
  private movieControlListeners: Set<(data: { action: 'play' | 'pause' | 'stop'; currentTime?: number; senderId: string }) => void> = new Set();
  private movieSeekListeners: Set<(data: { currentTime: number; isPlaying?: boolean; senderId: string }) => void> = new Set();
  private negotiationPending: Map<string, boolean> = new Map();

  private isInCall = false;
  private localMicEnabled = false;
  private localCameraEnabled = false;
  private isCleaningUpScreenShare = false;

  private listeners: Set<WebRTCManagerListeners> = new Set();
  private realTimeUnsub: (() => void) | null = null;

  // Configurable ICE Configuration (Defaults to standard public Google STUN servers)
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
  };

  constructor() {
    this.setupSignalingListener();
  }

  /**
   * Sets custom ICE / TURN configuration for production deployment without client hard-coding.
   */
  public setRtcConfiguration(config: RTCConfiguration): void {
    this.rtcConfig = { ...this.rtcConfig, ...config };
  }

  public getRtcConfiguration(): RTCConfiguration {
    return this.rtcConfig;
  }

  public subscribe(listener: WebRTCManagerListeners): () => void {
    this.listeners.add(listener);
    // Initial emit
    listener.onLocalStreamChange?.(this.localStream);
    listener.onLocalScreenStreamChange?.(this.localScreenStream);
    listener.onLocalMovieStreamChange?.(this.localMovieStream);
    listener.onRemoteStreamsChange?.(new Map(this.remoteStreams));
    listener.onRemoteScreenStreamsChange?.(new Map(this.remoteScreenStreams));
    listener.onRemoteMovieStreamChange?.(this.remoteMovieStream, this.movieStreamOwnerInfo);
    listener.onPeerStatesChange?.(new Map(this.peerMediaStates));
    listener.onCallStateChange?.(this.isInCall);
    listener.onScreenSharingChange?.(this.isScreenSharing);
    listener.onMovieStreamingChange?.(this.isMovieStreaming);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyLocalStream(): void {
    this.listeners.forEach((l) => l.onLocalStreamChange?.(this.localStream));
  }

  private notifyLocalScreenStream(): void {
    this.listeners.forEach((l) => l.onLocalScreenStreamChange?.(this.localScreenStream));
  }

  private notifyLocalMovieStream(): void {
    this.listeners.forEach((l) => l.onLocalMovieStreamChange?.(this.localMovieStream));
  }

  private notifyRemoteStreams(): void {
    const copy = new Map(this.remoteStreams);
    this.listeners.forEach((l) => l.onRemoteStreamsChange?.(copy));
  }

  private notifyRemoteScreenStreams(): void {
    const copy = new Map(this.remoteScreenStreams);
    this.listeners.forEach((l) => l.onRemoteScreenStreamsChange?.(copy));
  }

  private notifyRemoteMovieStream(): void {
    this.listeners.forEach((l) => l.onRemoteMovieStreamChange?.(this.remoteMovieStream, this.movieStreamOwnerInfo));
  }

  private notifyScreenSharing(): void {
    this.listeners.forEach((l) => l.onScreenSharingChange?.(this.isScreenSharing));
  }

  private notifyMovieStreaming(): void {
    this.listeners.forEach((l) => l.onMovieStreamingChange?.(this.isMovieStreaming));
  }

  private notifyPeerStates(): void {
    const copy = new Map(this.peerMediaStates);
    this.listeners.forEach((l) => l.onPeerStatesChange?.(copy));
  }

  private notifyCallState(): void {
    this.listeners.forEach((l) => l.onCallStateChange?.(this.isInCall));
  }

  private notifyError(msg: string): void {
    console.error('[WEBRTC ERROR]', msg);
    this.listeners.forEach((l) => l.onError?.(msg));
  }

  // --- Signaling Message Router ---

  private setupSignalingListener(): void {
    if (this.realTimeUnsub) {
      this.realTimeUnsub();
    }

    this.realTimeUnsub = realTimeClient.onMessage((message: ServerMessage) => {
      this.handleSignalingMessage(message);
    });
  }

  private async handleSignalingMessage(message: ServerMessage): Promise<void> {
    const currentUser = realTimeClient.getCurrentUser();
    if (!currentUser) return;

    switch (message.type) {
      case 'WEBRTC_JOIN': {
        const joinMsg = message as WebRTCJoinMessage;
        const remoteUserId = joinMsg.senderId;
        if (remoteUserId === currentUser.userId) return;

        console.log('[WEBRTC JOIN RECEIVED FROM PEER]', { remoteUserId, remoteName: joinMsg.senderName });

        // Update peer presence state
        const existingState = this.peerMediaStates.get(remoteUserId) || {
          userId: remoteUserId,
          name: joinMsg.senderName || 'کاربر',
          micEnabled: true,
          cameraEnabled: false,
          callJoined: true,
          updatedAt: Date.now()
        };
        existingState.callJoined = true;
        this.peerMediaStates.set(remoteUserId, existingState);
        this.notifyPeerStates();

        // If local user is in call, screen sharing, or movie streaming, connect to joining peer
        if (this.isInCall || this.isScreenSharing || this.isMovieStreaming) {
          console.log('[CONNECTING TO NEW PEER]', { remoteUserId });
          this.getOrCreatePeerConnection(remoteUserId, joinMsg.senderName);
          // If we are the impolite peer or caller, request negotiation
          if (!this.isPolitePeer(remoteUserId)) {
            await this.requestNegotiation(remoteUserId);
          }
        }
        break;
      }

      case 'WEBRTC_LEAVE': {
        const leaveMsg = message as WebRTCLeaveMessage;
        const remoteUserId = leaveMsg.senderId;
        console.log('[WEBRTC LEAVE RECEIVED]', { remoteUserId });
        this.closePeerConnection(remoteUserId);
        break;
      }

      case 'USER_JOINED': {
        const remoteUser = (message as any).user;
        if (!remoteUser || remoteUser.userId === currentUser.userId) break;
        const remoteUserId = remoteUser.userId;
        console.log('[USER JOINED SIGNAL RECEIVED IN WEBRTC]', { remoteUserId, name: remoteUser.name });

        if (this.isMovieStreaming && this.localMovieStream) {
          console.log('[MOVIE] Connecting to new room member for live movie stream:', remoteUserId);
          this.getOrCreatePeerConnection(remoteUserId, remoteUser.name);
          if (!this.isPolitePeer(remoteUserId)) {
            await this.requestNegotiation(remoteUserId);
          }
        }
        break;
      }

      case 'USER_LEFT': {
        const leftUserId = message.userId;
        console.log('[USER LEFT ROOM CLEANUP]', { leftUserId });
        this.closePeerConnection(leftUserId);
        break;
      }

      case 'WEBRTC_OFFER': {
        const offerMsg = message as WebRTCOfferMessage;
        if (offerMsg.toUserId !== currentUser.userId) return;
        console.log('[WEBRTC DEBUG] offer received', offerMsg.senderId);
        await this.handleOffer(offerMsg.senderId, offerMsg.payload, offerMsg.senderName);
        break;
      }

      case 'WEBRTC_ANSWER': {
        const answerMsg = message as WebRTCAnswerMessage;
        if (answerMsg.toUserId !== currentUser.userId) return;
        console.log('[WEBRTC DEBUG] answer received', answerMsg.senderId);
        await this.handleAnswer(answerMsg.senderId, answerMsg.payload);
        break;
      }

      case 'WEBRTC_ICE_CANDIDATE': {
        const iceMsg = message as WebRTCIceCandidateMessage;
        if (iceMsg.toUserId !== currentUser.userId) return;
        console.log('[ICE CANDIDATE RECEIVED]', { fromUserId: iceMsg.senderId });
        await this.handleRemoteIceCandidate(iceMsg.senderId, iceMsg.payload);
        break;
      }

      case 'MEDIA_STATE_CHANGED': {
        const mediaMsg = message as MediaStateChangedMessage;
        const remoteUserId = mediaMsg.senderId;
        if (remoteUserId === currentUser.userId) return;

        const peer = this.peerMediaStates.get(remoteUserId) || {
          userId: remoteUserId,
          name: mediaMsg.senderName || 'کاربر',
          micEnabled: mediaMsg.payload.micEnabled,
          cameraEnabled: mediaMsg.payload.cameraEnabled,
          callJoined: mediaMsg.payload.callJoined,
          updatedAt: mediaMsg.payload.updatedAt
        };

        peer.micEnabled = mediaMsg.payload.micEnabled;
        peer.cameraEnabled = mediaMsg.payload.cameraEnabled;
        peer.callJoined = mediaMsg.payload.callJoined;
        peer.updatedAt = mediaMsg.payload.updatedAt;

        if (mediaMsg.payload.screenSharingEnabled !== undefined) {
          peer.screenSharing = mediaMsg.payload.screenSharingEnabled;
          if (!mediaMsg.payload.screenSharingEnabled) {
            peer.screenStream = undefined;
            this.remotePeerScreenStreamIds.delete(remoteUserId);
            const st = this.remoteScreenStreams.get(remoteUserId);
            if (st) {
              st.getTracks().forEach((t) => t.stop());
              this.remoteScreenStreams.delete(remoteUserId);
            }
            this.notifyRemoteScreenStreams();
          }
        }

        this.peerMediaStates.set(remoteUserId, peer);
        this.notifyPeerStates();
        break;
      }

      case 'SCREEN_SHARE_STARTED': {
        const remoteUserId = message.senderId;
        const screenStreamId = (message as any).payload?.screenStreamId;
        console.log('[REMOTE SCREEN] SIGNAL RECEIVED', { remoteUserId, screenStreamId });
        if (remoteUserId === currentUser.userId) return;

        // Store metadata unconditionally, decoupled from local screen state
        this.knownRemoteScreenStreams.set(remoteUserId, {
          userId: remoteUserId,
          screenStreamId,
          receivedAt: Date.now()
        });
        if (screenStreamId) {
          this.remotePeerScreenStreamIds.set(remoteUserId, screenStreamId);
        }
        console.log('[REMOTE SCREEN] Metadata stored', { remoteUserId, screenStreamId });

        const peer = this.peerMediaStates.get(remoteUserId) || {
          userId: remoteUserId,
          name: message.senderName || 'کاربر',
          micEnabled: true,
          cameraEnabled: false,
          callJoined: true,
          updatedAt: Date.now()
        };
        peer.screenSharing = true;

        // Race Condition Handling:
        // Check if a video track arrived earlier and was buffered in bufferedVideoTracks
        const buffered = this.bufferedVideoTracks.get(remoteUserId);
        if (buffered && buffered.length > 0) {
          let matchIndex = -1;
          if (screenStreamId) {
            matchIndex = buffered.findIndex((item) => item.stream.id === screenStreamId);
          }
          if (matchIndex === -1) {
            matchIndex = buffered.length - 1; // Take latest buffered track
          }

          if (matchIndex !== -1) {
            const matchedItem = buffered[matchIndex];
            buffered.splice(matchIndex, 1);
            if (buffered.length === 0) {
              this.bufferedVideoTracks.delete(remoteUserId);
            }
            console.log('[REMOTE SCREEN] Buffered track matched and routed', {
              remoteUserId,
              trackId: matchedItem.track.id,
              streamId: matchedItem.stream.id,
              screenStreamId
            });
            this.routeTrackToScreen(remoteUserId, matchedItem.track, matchedItem.stream);
            console.log('[REMOTE SCREEN] Stream routed to ScreenSharePanel', {
              remoteUserId,
              streamId: matchedItem.stream.id
            });
            this.notifyRemoteScreenStreams();
            this.notifyPeerStates();
            console.log('[REMOTE SCREEN] React state updated');
            break;
          }
        }

        // Check if cameraStream was tentatively assigned this video track while peer has camera off
        const existingCamera = this.remoteStreams.get(remoteUserId);
        if (existingCamera) {
          const videoTracks = existingCamera.getVideoTracks();
          if (videoTracks.length > 0) {
            const shouldMigrate =
              (screenStreamId && existingCamera.id === screenStreamId) ||
              !peer.cameraEnabled ||
              videoTracks.length > 1;

            if (shouldMigrate) {
              const videoTrack = videoTracks[videoTracks.length - 1];
              console.log('[REMOTE SCREEN] Migrating tentatively assigned camera video track to screen share:', {
                remoteUserId,
                trackId: videoTrack.id
              });
              existingCamera.removeTrack(videoTrack);
              if (existingCamera.getTracks().length === 0) {
                this.remoteStreams.delete(remoteUserId);
              }
              this.notifyRemoteStreams();

              const screenStream = new MediaStream([videoTrack]);
              this.remoteScreenStreams.set(remoteUserId, screenStream);
              peer.screenStream = screenStream;
              console.log('[REMOTE SCREEN] Stream routed to ScreenSharePanel', {
                remoteUserId,
                streamId: screenStream.id
              });
              this.notifyRemoteScreenStreams();
              this.notifyPeerStates();
              console.log('[REMOTE SCREEN] React state updated');
              break;
            }
          }
        }

        // Check peer connection receivers for any unrouted video track
        const pc = this.peerConnections.get(remoteUserId);
        if (pc) {
          pc.getReceivers().forEach((receiver) => {
            if (receiver.track && receiver.track.kind === 'video' && receiver.track.readyState === 'live') {
              const currentScreenStream = this.remoteScreenStreams.get(remoteUserId);
              const alreadyInScreen = currentScreenStream && currentScreenStream.getTracks().some((t) => t.id === receiver.track.id);
              if (!alreadyInScreen) {
                const isKnownCamera = this.remoteStreams.get(remoteUserId)?.getVideoTracks().some((t) => t.id === receiver.track.id);
                if (!isKnownCamera || !peer.cameraEnabled) {
                  console.log('[REMOTE SCREEN] Found unrouted receiver video track, routing to screen:', receiver.track.id);
                  this.routeTrackToScreen(remoteUserId, receiver.track, new MediaStream([receiver.track]));
                  console.log('[REMOTE SCREEN] Stream routed to ScreenSharePanel', {
                    remoteUserId,
                    trackId: receiver.track.id
                  });
                  this.notifyRemoteScreenStreams();
                  this.notifyPeerStates();
                  console.log('[REMOTE SCREEN] React state updated');
                }
              }
            }
          });
        }

        this.peerMediaStates.set(remoteUserId, peer);
        this.notifyRemoteScreenStreams();
        this.notifyPeerStates();
        break;
      }

      case 'SCREEN_SHARE_STOPPED': {
        const remoteUserId = message.senderId;
        console.log('[SCREEN SHARE STOPPED SIGNAL RECEIVED]', { remoteUserId });
        if (remoteUserId === currentUser.userId) return;

        this.knownRemoteScreenStreams.delete(remoteUserId);
        this.bufferedVideoTracks.delete(remoteUserId);
        this.remotePeerScreenStreamIds.delete(remoteUserId);

        const peer = this.peerMediaStates.get(remoteUserId);
        if (peer) {
          peer.screenSharing = false;
          peer.screenStream = undefined;
        }
        const st = this.remoteScreenStreams.get(remoteUserId);
        if (st) {
          st.getTracks().forEach((t) => t.stop());
          this.remoteScreenStreams.delete(remoteUserId);
        }
        this.notifyRemoteScreenStreams();
        this.notifyPeerStates();
        break;
      }

      case 'MOVIE_STREAM_STARTED': {
        const movieMsg = message as MovieStreamStartedMessage;
        const remoteUserId = movieMsg.senderId;
        const payload = movieMsg.payload;
        console.log('[MOVIE] Remote movie stream signal received', {
          remoteUserId,
          movieStreamId: payload?.movieStreamId,
          fileName: payload?.fileName
        });
        if (remoteUserId === currentUser.userId) return;

        // Save metadata unconditionally
        this.knownRemoteMovieStreams.set(remoteUserId, {
          ownerUserId: remoteUserId,
          movieStreamId: payload?.movieStreamId,
          fileName: payload?.fileName || 'ویدیوی محلی',
          duration: payload?.duration,
          receivedAt: Date.now()
        });

        this.movieStreamOwnerInfo = {
          userId: remoteUserId,
          fileName: payload?.fileName || 'ویدیوی محلی'
        };

        const peer = this.peerMediaStates.get(remoteUserId) || {
          userId: remoteUserId,
          name: movieMsg.senderName || 'کاربر',
          micEnabled: true,
          cameraEnabled: false,
          callJoined: true,
          updatedAt: Date.now()
        };
        peer.isMovieStreaming = true;

        // Ensure peer connection with the movie streamer
        const pc = this.getOrCreatePeerConnection(remoteUserId, movieMsg.senderName);

        // 1. Check if movie tracks were buffered before this signal arrived
        const buffered = this.bufferedMovieTracks.get(remoteUserId);
        if (buffered && buffered.length > 0) {
          console.log('[MOVIE] Flushing buffered tracks for movie stream:', buffered.length);
          buffered.forEach((item) => {
            this.routeTrackToMovie(remoteUserId, item.track, item.stream, payload?.fileName);
          });
          this.bufferedMovieTracks.delete(remoteUserId);
        }

        // 2. Check peer connection receivers for any unrouted movie tracks
        if (pc) {
          pc.getReceivers().forEach((receiver) => {
            if (receiver.track && receiver.track.readyState === 'live') {
              const currentMovieStream = this.remoteMovieStream;
              const alreadyInMovie = currentMovieStream && currentMovieStream.getTracks().some((t) => t.id === receiver.track.id);
              if (!alreadyInMovie) {
                const isKnownCamera = this.remoteStreams.get(remoteUserId)?.getVideoTracks().some((t) => t.id === receiver.track.id);
                const isKnownMic = this.remoteStreams.get(remoteUserId)?.getAudioTracks().some((t) => t.id === receiver.track.id);
                if (!isKnownCamera && !isKnownMic) {
                  console.log('[MOVIE] Found unrouted receiver track, routing to movie stream:', receiver.track.id, receiver.track.kind);
                  this.routeTrackToMovie(remoteUserId, receiver.track, new MediaStream([receiver.track]), payload?.fileName);
                }
              }
            }
          });
        }

        // Request negotiation if needed
        if (!this.isPolitePeer(remoteUserId)) {
          await this.requestNegotiation(remoteUserId);
        }

        this.peerMediaStates.set(remoteUserId, peer);
        this.notifyRemoteMovieStream();
        this.notifyPeerStates();
        break;
      }

      case 'MOVIE_STREAM_STOPPED': {
        const remoteUserId = message.senderId;
        console.log('[MOVIE] Remote movie stream stopped signal received', { remoteUserId });
        if (remoteUserId === currentUser.userId) return;

        this.knownRemoteMovieStreams.delete(remoteUserId);
        this.bufferedMovieTracks.delete(remoteUserId);

        if (this.remoteMovieStream) {
          this.remoteMovieStream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
          this.remoteMovieStream = null;
        }
        this.movieStreamOwnerInfo = null;

        const peer = this.peerMediaStates.get(remoteUserId);
        if (peer) {
          peer.isMovieStreaming = false;
          peer.movieStream = undefined;
        }

        this.notifyRemoteMovieStream();
        this.notifyPeerStates();
        break;
      }

      case 'MOVIE_STREAM_CONTROL': {
        const ctrlMsg = message as MovieStreamControlMessage;
        console.log('[MOVIE] Control request received', {
          action: ctrlMsg.action,
          currentTime: ctrlMsg.currentTime,
          senderId: ctrlMsg.senderId
        });
        this.movieControlListeners.forEach((listener) => {
          listener({
            action: ctrlMsg.action,
            currentTime: ctrlMsg.currentTime,
            senderId: ctrlMsg.senderId
          });
        });
        break;
      }

      case 'MOVIE_STREAM_SEEK': {
        const seekMsg = message as MovieStreamSeekMessage;
        console.log('[MOVIE] Seek request received', {
          currentTime: seekMsg.currentTime,
          isPlaying: seekMsg.isPlaying,
          senderId: seekMsg.senderId
        });
        this.movieSeekListeners.forEach((listener) => {
          listener({
            currentTime: seekMsg.currentTime,
            isPlaying: seekMsg.isPlaying,
            senderId: seekMsg.senderId
          });
        });
        break;
      }
    }
  }

  // --- Perfect Negotiation Deterministic Rule ---

  /**
   * Deterministic tie-breaker for Perfect Negotiation collision avoidance.
   * If localUserId < remoteUserId, local peer is Polite; otherwise Impolite.
   */
  private isPolitePeer(remoteUserId: string): boolean {
    const localUserId = realTimeClient.getCurrentUser()?.userId || '';
    return localUserId < remoteUserId;
  }

  // --- PeerConnection Factory & Management ---

  public getOrCreatePeerConnection(remoteUserId: string, remoteUserName?: string): RTCPeerConnection {
    let pc = this.peerConnections.get(remoteUserId);
    if (pc && pc.signalingState !== 'closed') {
      return pc;
    }

    console.log('[CREATE PEER]', { remoteUserId });

    pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(remoteUserId, pc);
    this.makingOffer.set(remoteUserId, false);
    this.isSettingRemoteAnswerPending.set(remoteUserId, false);

    // Initial peer state tracking
    if (!this.peerMediaStates.has(remoteUserId)) {
      this.peerMediaStates.set(remoteUserId, {
        userId: remoteUserId,
        name: remoteUserName || 'هم‌اتاقی',
        micEnabled: true,
        cameraEnabled: false,
        callJoined: true,
        connectionState: 'new',
        updatedAt: Date.now()
      });
    }

    // 1. Send Local Camera/Mic Tracks to Peer
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        if (this.localStream) {
          try {
            pc!.addTrack(track, this.localStream);
          } catch (err) {
            console.warn('Track already added or failed to add track', err);
          }
        }
      });
    }

    // 1b. Send Local Screen Share Tracks to Peer if active
    if (this.localScreenStream && this.isScreenSharing) {
      this.localScreenStream.getTracks().forEach((track) => {
        try {
          pc!.addTrack(track, this.localScreenStream!);
          console.log('[SCREEN] Adding screen track to late-joining peer:', remoteUserId, {
            kind: track.kind,
            trackId: track.id,
            readyState: track.readyState
          });
        } catch (err) {
          console.warn('[SCREEN] Failed to add screen track to late-joining peer:', remoteUserId, err);
        }
      });
    }

    // 1c. Send Local Movie Live Stream Tracks to Peer if active (Late-Join Support)
    if (this.localMovieStream && this.isMovieStreaming) {
      this.localMovieStream.getTracks().forEach((track) => {
        try {
          pc!.addTrack(track, this.localMovieStream!);
          console.log('[MOVIE] Track added to peer (late join):', remoteUserId, {
            kind: track.kind,
            trackId: track.id,
            readyState: track.readyState
          });
        } catch (err) {
          console.warn('[MOVIE] Failed to add movie track to late-joining peer:', remoteUserId, err);
        }
      });
    }

    // 1d. Ensure Transceivers for receiving Video & Audio
    // independent of local media, so remote peer video/movie tracks can be received immediately
    const videoTransceivers = pc.getTransceivers().filter((t) => t.receiver.track.kind === 'video');
    if (videoTransceivers.length === 0) {
      try {
        pc.addTransceiver('video', { direction: 'recvonly' });
      } catch (err) {
        console.warn('[WEBRTC] Add initial video recvonly transceiver error:', err);
      }
    }
    const audioTransceivers = pc.getTransceivers().filter((t) => t.receiver.track.kind === 'audio');
    if (audioTransceivers.length === 0) {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch (err) {
        console.warn('[WEBRTC] Add initial audio recvonly transceiver error:', err);
      }
    }

    // 2. Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        realTimeClient.emitWebRTCIceCandidate(remoteUserId, event.candidate.toJSON());
      }
    };

    // 3. Handle Remote Track
    pc.ontrack = (event) => {
      console.log('[REMOTE TRACK RECEIVED]', {
        peerId: remoteUserId,
        trackId: event.track.id,
        kind: event.track.kind,
        label: event.track.label,
        streams: event.streams.map((stream) => ({
          id: stream.id,
          tracks: stream.getTracks().map((track) => ({
            id: track.id,
            kind: track.kind,
            label: track.label
          }))
        }))
      });

      const incomingStream = event.streams[0] || new MediaStream([event.track]);
      const cameraStream = this.remoteStreams.get(remoteUserId);
      const peerState = this.peerMediaStates.get(remoteUserId);
      const screenMeta = this.knownRemoteScreenStreams.get(remoteUserId);
      const movieMeta = this.knownRemoteMovieStreams.get(remoteUserId);

      // Handle AUDIO track
      if (event.track.kind === 'audio') {
        // 1. Movie Stream Audio Detection
        if (
          (movieMeta?.movieStreamId && incomingStream.id === movieMeta.movieStreamId) ||
          peerState?.isMovieStreaming ||
          event.track.label.toLowerCase().includes('movie') ||
          event.track.label.toLowerCase().includes('capture')
        ) {
          console.log('[MOVIE] Remote movie audio track received', { remoteUserId, trackId: event.track.id, streamId: incomingStream.id });
          this.routeTrackToMovie(remoteUserId, event.track, incomingStream, movieMeta?.fileName);
          this.notifyRemoteMovieStream();
          return;
        }

        // 2. Screen Share Audio Detection
        if (screenMeta?.screenStreamId && incomingStream.id === screenMeta.screenStreamId) {
          console.log('[REMOTE SCREEN] Audio track matched screen share stream:', incomingStream.id);
          this.routeTrackToScreen(remoteUserId, event.track, incomingStream);
          this.notifyRemoteScreenStreams();
          return;
        }

        // 3. Standard Camera / Mic Audio
        let remoteStream = cameraStream;
        if (!remoteStream) {
          remoteStream = incomingStream;
          this.remoteStreams.set(remoteUserId, remoteStream);
        } else {
          if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
            remoteStream.addTrack(event.track);
          }
        }
        if (peerState) {
          peerState.stream = remoteStream;
        }
        this.notifyRemoteStreams();
        this.notifyPeerStates();
        return;
      }

      // Handle VIDEO track
      if (event.track.kind === 'video') {
        console.log('[REMOTE VIDEO TRACK RECEIVED]', {
          remoteUserId,
          trackId: event.track.id,
          streamId: incomingStream.id,
          label: event.track.label
        });

        // 1. Determine if this video track is a MOVIE stream track
        let isMovieStream = false;
        if (movieMeta?.movieStreamId && incomingStream.id === movieMeta.movieStreamId) {
          isMovieStream = true;
        } else if (peerState?.isMovieStreaming) {
          if (!peerState.cameraEnabled || !cameraStream || incomingStream.id !== cameraStream.id) {
            isMovieStream = true;
          }
        } else if (
          event.track.label.toLowerCase().includes('movie') ||
          incomingStream.id.toLowerCase().includes('movie') ||
          event.track.label.toLowerCase().includes('capture')
        ) {
          isMovieStream = true;
        }

        if (isMovieStream) {
          console.log('[MOVIE] Matching movie stream metadata', { remoteUserId, trackId: event.track.id });
          this.routeTrackToMovie(remoteUserId, event.track, incomingStream, movieMeta?.fileName);
          console.log('[MOVIE] Remote movie stream attached', {
            remoteUserId,
            streamId: incomingStream.id
          });
          this.notifyRemoteMovieStream();
          this.notifyPeerStates();
          return;
        }

        // 2. Determine if this video track is a screen share track
        let isScreenShare = false;

        // Matches known screen stream ID from signaling metadata
        if (screenMeta?.screenStreamId && incomingStream.id === screenMeta.screenStreamId) {
          isScreenShare = true;
        }
        // Peer is already flagged as screen sharing
        else if (peerState?.screenSharing) {
          if (!peerState.cameraEnabled || !cameraStream || incomingStream.id !== cameraStream.id) {
            isScreenShare = true;
          } else if (cameraStream.getVideoTracks().length > 0) {
            isScreenShare = true;
          }
        }
        // Track or stream label explicitly indicates screen share
        else if (
          event.track.label.toLowerCase().includes('screen') ||
          incomingStream.id.toLowerCase().includes('screen')
        ) {
          isScreenShare = true;
        }

        if (isScreenShare) {
          console.log('[REMOTE SCREEN] Matching metadata', { remoteUserId, trackId: event.track.id });
          this.routeTrackToScreen(remoteUserId, event.track, incomingStream);
          console.log('[REMOTE SCREEN] Stream routed to ScreenSharePanel', {
            remoteUserId,
            streamId: incomingStream.id
          });
          this.notifyRemoteScreenStreams();
          this.notifyPeerStates();
          console.log('[REMOTE SCREEN] React state updated');
          return;
        }

        // If metadata has not arrived yet: BUFFER the video track!
        console.log('[REMOTE TRACK] Track arrived before metadata, buffering', {
          remoteUserId,
          trackId: event.track.id,
          streamId: incomingStream.id
        });
        const buffer = this.bufferedVideoTracks.get(remoteUserId) || [];
        buffer.push({ track: event.track, stream: incomingStream, addedAt: Date.now() });
        this.bufferedVideoTracks.set(remoteUserId, buffer);

        const movieBuf = this.bufferedMovieTracks.get(remoteUserId) || [];
        movieBuf.push({ track: event.track, stream: incomingStream, addedAt: Date.now() });
        this.bufferedMovieTracks.set(remoteUserId, movieBuf);

        // Tentatively attach to cameraStream ONLY if camera is explicitly enabled by peer
        if (peerState?.cameraEnabled) {
          console.log('[CAMERA TRACK] Assigned video track to camera stream (peer camera enabled):', remoteUserId);
          let remoteStream = cameraStream;
          if (!remoteStream) {
            remoteStream = incomingStream;
            this.remoteStreams.set(remoteUserId, remoteStream);
          } else {
            if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
              remoteStream.addTrack(event.track);
            }
          }
          if (peerState) {
            peerState.stream = remoteStream;
          }
          this.notifyRemoteStreams();
          this.notifyPeerStates();
        } else {
          // If peer camera is NOT enabled, check again after short delay in case signal was slightly delayed
          setTimeout(() => {
            const currentMovieMeta = this.knownRemoteMovieStreams.get(remoteUserId);
            const currentPeer = this.peerMediaStates.get(remoteUserId);
            if (currentMovieMeta || currentPeer?.isMovieStreaming) {
              console.log('[MOVIE] Delayed check matched movie stream:', { remoteUserId, trackId: event.track.id });
              this.routeTrackToMovie(remoteUserId, event.track, incomingStream, currentMovieMeta?.fileName);
              this.notifyRemoteMovieStream();
              this.notifyPeerStates();
              return;
            }

            const currentMeta = this.knownRemoteScreenStreams.get(remoteUserId);
            if (currentMeta || currentPeer?.screenSharing) {
              const currentBuf = this.bufferedVideoTracks.get(remoteUserId);
              if (currentBuf && currentBuf.some((b) => b.track.id === event.track.id)) {
                console.log('[REMOTE SCREEN] Buffered track matched and routed (delayed check):', {
                  remoteUserId,
                  trackId: event.track.id
                });
                this.routeTrackToScreen(remoteUserId, event.track, incomingStream);
                this.notifyRemoteScreenStreams();
                this.notifyPeerStates();
                console.log('[REMOTE SCREEN] React state updated');
              }
            }
          }, 60);
        }
      }
    };

    // 4. Handle Negotiation Needed with centralized queue (Step 3 & Step 8)
    pc.onnegotiationneeded = async () => {
      console.log('[WEBRTC DEBUG] negotiationneeded', remoteUserId, {
        signalingState: pc!.signalingState
      });
      await this.requestNegotiation(remoteUserId);
    };

    // 5. Handle Connection State Changes
    pc.onconnectionstatechange = () => {
      const state = pc!.connectionState as PeerConnectionState;
      console.log(`[PEER CONNECTION STATE: ${state.toUpperCase()}]`, { remoteUserId });

      const peerState = this.peerMediaStates.get(remoteUserId);
      if (peerState) {
        peerState.connectionState = state;
        this.notifyPeerStates();
      }

      if (state === 'connected') {
        console.log('[PEER CONNECTED]', { remoteUserId });
      } else if (state === 'failed') {
        console.warn('[PEER FAILED - ATTEMPTING ICE RESTART]', { remoteUserId });
        this.attemptIceRestart(remoteUserId, pc!);
      } else if (state === 'closed' || state === 'disconnected') {
        // Handled gracefully
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc!.iceConnectionState;
      console.log(`[ICE STATE: ${iceState}]`, { remoteUserId });
      if (iceState === 'failed') {
        this.attemptIceRestart(remoteUserId, pc!);
      }
    };

    this.notifyPeerStates();
    return pc;
  }

  private async attemptIceRestart(remoteUserId: string, pc: RTCPeerConnection): Promise<void> {
    try {
      if (pc.signalingState === 'closed') return;
      console.log('[ICE RESTART INITIATED]', { remoteUserId });
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      realTimeClient.emitWebRTCOffer(remoteUserId, pc.localDescription!);
    } catch (err) {
      console.warn('ICE Restart failed', err);
    }
  }

  /**
   * Safe, centralized negotiation trigger and queue manager (Step 3, 4, 8).
   * Ensures no negotiation needed event is dropped due to makingOffer or non-stable state.
   */
  public async requestNegotiation(remoteUserId: string): Promise<void> {
    const pc = this.peerConnections.get(remoteUserId);
    if (!pc || pc.signalingState === 'closed') return;

    console.log('[WEBRTC DEBUG] requestNegotiation called', remoteUserId, {
      signalingState: pc.signalingState,
      makingOffer: !!this.makingOffer.get(remoteUserId),
      isSettingRemoteAnswerPending: !!this.isSettingRemoteAnswerPending.get(remoteUserId)
    });

    if (
      pc.signalingState !== 'stable' ||
      this.makingOffer.get(remoteUserId) ||
      this.isSettingRemoteAnswerPending.get(remoteUserId)
    ) {
      console.log('[WEBRTC DEBUG] Queueing renegotiation for peer (not stable or operation in progress):', remoteUserId, {
        signalingState: pc.signalingState
      });
      this.negotiationPending.set(remoteUserId, true);
      return;
    }

    this.negotiationPending.set(remoteUserId, false);

    try {
      this.makingOffer.set(remoteUserId, true);
      console.log('[WEBRTC DEBUG] creating offer', remoteUserId);
      const offer = await pc.createOffer();

      if (pc.signalingState !== 'stable') {
        console.log('[WEBRTC DEBUG] Signaling state changed during createOffer, queueing again:', remoteUserId, {
          signalingState: pc.signalingState
        });
        this.negotiationPending.set(remoteUserId, true);
        return;
      }

      const videoMLines = (offer.sdp?.match(/^m=video /gm) || []).length;
      const audioMLines = (offer.sdp?.match(/^m=audio /gm) || []).length;
      console.log(`[SDP DEBUG] offer video m-lines: ${videoMLines}, audio m-lines: ${audioMLines}`, remoteUserId);
      console.log('[WEBRTC DEBUG] offer created', remoteUserId, offer.sdp);

      await pc.setLocalDescription(offer);
      console.log('[WEBRTC DEBUG] sending renegotiation offer', remoteUserId);

      if (pc.localDescription) {
        realTimeClient.emitWebRTCOffer(remoteUserId, pc.localDescription);
      }
    } catch (err) {
      console.error('[WEBRTC DEBUG] offer creation failed for peer:', remoteUserId, err);
    } finally {
      this.makingOffer.set(remoteUserId, false);
    }
  }

  private async handleOffer(
    fromUserId: string,
    offer: RTCSessionDescriptionInit,
    senderName?: string
  ): Promise<void> {
    console.log('[WEBRTC DEBUG] offer received', fromUserId);
    const pc = this.getOrCreatePeerConnection(fromUserId, senderName);
    const isPolite = this.isPolitePeer(fromUserId);
    const offerCollision =
      this.makingOffer.get(fromUserId) || pc.signalingState !== 'stable';

    const ignoreOffer = !isPolite && offerCollision;
    if (ignoreOffer) {
      console.log('[OFFER IGNORED (IMPOLITE PEER COLLISION)]', { fromUserId });
      return;
    }

    try {
      if (offerCollision) {
        console.log('[PERFECT NEGOTIATION ROLLBACK (POLITE PEER)]', { fromUserId });
        await Promise.all([
          pc.setLocalDescription({ type: 'rollback' }),
          pc.setRemoteDescription(offer)
        ]);
      } else {
        await pc.setRemoteDescription(offer);
      }
      console.log('[WEBRTC DEBUG] remote description applied');

      await this.flushIceCandidatesQueue(fromUserId, pc);

      const answer = await pc.createAnswer();
      const videoMLines = (answer.sdp?.match(/^m=video /gm) || []).length;
      const audioMLines = (answer.sdp?.match(/^m=audio /gm) || []).length;
      console.log(`[SDP DEBUG] answer video m-lines: ${videoMLines}, audio m-lines: ${audioMLines}`, fromUserId);
      console.log('[WEBRTC DEBUG] answer created', fromUserId, answer.sdp);

      await pc.setLocalDescription(answer);
      console.log('[WEBRTC DEBUG] sending answer', fromUserId);
      realTimeClient.emitWebRTCAnswer(fromUserId, pc.localDescription!);

      // Check queued renegotiation after answering
      if (this.negotiationPending.get(fromUserId)) {
        console.log('[WEBRTC DEBUG] executing queued negotiation after handling offer:', fromUserId);
        await this.requestNegotiation(fromUserId);
      }
    } catch (err) {
      console.error('[HANDLE OFFER FAILED]', err);
    }
  }

  private async handleAnswer(
    fromUserId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    console.log('[WEBRTC DEBUG] answer received', fromUserId);
    const pc = this.peerConnections.get(fromUserId);
    if (!pc) return;

    try {
      this.isSettingRemoteAnswerPending.set(fromUserId, true);
      await pc.setRemoteDescription(answer);
      console.log('[WEBRTC DEBUG] remote description (answer) applied');
      await this.flushIceCandidatesQueue(fromUserId, pc);

      // Check queued renegotiation after answer applied and connection returned to stable
      if (this.negotiationPending.get(fromUserId)) {
        console.log('[WEBRTC DEBUG] executing queued negotiation after answer:', fromUserId);
        await this.requestNegotiation(fromUserId);
      }
    } catch (err) {
      console.error('[HANDLE ANSWER FAILED]', err);
    } finally {
      this.isSettingRemoteAnswerPending.set(fromUserId, false);
    }
  }

  private async handleRemoteIceCandidate(
    fromUserId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const pc = this.peerConnections.get(fromUserId);
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('Error adding ICE candidate directly', err);
      }
    } else {
      // Queue until remote description is set
      const queue = this.iceCandidatesQueue.get(fromUserId) || [];
      queue.push(candidate);
      this.iceCandidatesQueue.set(fromUserId, queue);
    }
  }

  private async flushIceCandidatesQueue(fromUserId: string, pc: RTCPeerConnection): Promise<void> {
    const queue = this.iceCandidatesQueue.get(fromUserId) || [];
    if (queue.length === 0) return;

    this.iceCandidatesQueue.delete(fromUserId);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('Error adding queued ICE candidate', err);
      }
    }
  }

  // --- Media Stream & Hardware Access with Clear Persian Error Handling ---

  public async requestMediaStream(audio: boolean, video: boolean): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errStr = 'مرورگر شما از قابلیت تماس صوتی و تصویری (WebRTC) پشتیبانی نمی‌کند.';
      this.notifyError(errStr);
      throw new Error(errStr);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          : false,
        video: video
          ? {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 24 }
            }
          : false
      });

      return stream;
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      let persianMsg = 'خطا در برقراری ارتباط با میکروفون و دوربین.';

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        persianMsg = 'اجازه دسترسی به میکروفون یا دوربین داده نشده است. لطفاً از نوار آدرس مرورگر دسترسی را تأیید کنید.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        persianMsg = 'دوربین یا میکروفونی در دستگاه شما پیدا نشد.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        persianMsg = 'دوربین یا میکروفون در حال حاضر توسط برنامه دیگری در سیستم شما اشغال شده است.';
      } else if (error.name === 'OverconstrainedError') {
        persianMsg = 'تنظیمات کیفیت درخواستی توسط دوربین شما پشتیبانی نمی‌شود.';
      }

      this.notifyError(persianMsg);
      throw new Error(persianMsg);
    }
  }

  /**
   * Enters the WebRTC Voice/Video Call session.
   */
  public async joinCall(initialMic = true, initialCamera = false): Promise<boolean> {
    if (this.isInCall) return true;

    try {
      const stream = await this.requestMediaStream(initialMic, initialCamera);
      this.localStream = stream;

      this.localMicEnabled = initialMic;
      this.localCameraEnabled = initialCamera;

      // Ensure track enabled state matches request
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = initialMic;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = initialCamera;

      this.isInCall = true;
      this.notifyLocalStream();
      this.notifyCallState();

      // Broadcast WEBRTC_JOIN to all peers in the room
      realTimeClient.emitWebRTCJoin();

      // Emit media state
      realTimeClient.emitMediaStateChanged({
        micEnabled: this.localMicEnabled,
        cameraEnabled: this.localCameraEnabled,
        callJoined: true,
        updatedAt: Date.now()
      });

      // Synchronize tracks with any existing peer connections
      this.syncLocalTracksWithAllPeers();
      return true;
    } catch (err: unknown) {
      console.error('Failed to join call', err);
      return false;
    }
  }

  /**
   * Toggles Microphone On/Off using audioTrack.enabled without tearing down RTCPeerConnection.
   */
  public async toggleMic(): Promise<boolean> {
    if (!this.isInCall || !this.localStream) {
      // First interaction: Join call with mic on
      return this.joinCall(true, false);
    }

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.localMicEnabled = !audioTrack.enabled;
      audioTrack.enabled = this.localMicEnabled;
    } else if (!this.localMicEnabled) {
      // Stream was created without audio track, acquire and add track
      try {
        const audioStream = await this.requestMediaStream(true, false);
        const newAudioTrack = audioStream.getAudioTracks()[0];
        if (newAudioTrack) {
          this.localStream.addTrack(newAudioTrack);
          this.localMicEnabled = true;
          this.syncLocalTracksWithAllPeers();
        }
      } catch {
        return false;
      }
    }

    this.notifyLocalStream();

    realTimeClient.emitMediaStateChanged({
      micEnabled: this.localMicEnabled,
      cameraEnabled: this.localCameraEnabled,
      callJoined: this.isInCall,
      updatedAt: Date.now()
    });

    return this.localMicEnabled;
  }

  /**
   * Toggles Camera On/Off using videoTrack.enabled without tearing down RTCPeerConnection.
   */
  public async toggleCamera(): Promise<boolean> {
    if (!this.isInCall || !this.localStream) {
      // First interaction: Join call with camera on
      return this.joinCall(true, true);
    }

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.localCameraEnabled = !videoTrack.enabled;
      videoTrack.enabled = this.localCameraEnabled;
    } else {
      // Acquire video track dynamically
      try {
        const videoStream = await this.requestMediaStream(false, true);
        const newVideoTrack = videoStream.getVideoTracks()[0];
        if (newVideoTrack) {
          this.localStream.addTrack(newVideoTrack);
          this.localCameraEnabled = true;
          this.syncLocalTracksWithAllPeers();
        }
      } catch {
        return false;
      }
    }

    this.notifyLocalStream();

    realTimeClient.emitMediaStateChanged({
      micEnabled: this.localMicEnabled,
      cameraEnabled: this.localCameraEnabled,
      callJoined: this.isInCall,
      updatedAt: Date.now()
    });

    return this.localCameraEnabled;
  }

  /**
   * Synchronizes local tracks across all open RTCPeerConnections using sender.replaceTrack or pc.addTrack.
   */
  private syncLocalTracksWithAllPeers(): void {
    if (!this.localStream) return;
    const tracks = this.localStream.getTracks();

    this.peerConnections.forEach((pc) => {
      if (pc.signalingState === 'closed') return;
      const senders = pc.getSenders();

      tracks.forEach((track) => {
        const sender = senders.find((s) => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch((err) => {
            console.warn('Failed to replace track on sender', err);
          });
        } else {
          try {
            pc.addTrack(track, this.localStream!);
          } catch (err) {
            console.warn('Failed to add track to peer connection', err);
          }
        }
      });
    });
  }

  /**
   * Starts sharing local screen using getDisplayMedia without tearing down WebRTC call or camera stream.
   */
  public async startScreenShare(): Promise<boolean> {
    if (this.isScreenSharing) return true;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      const errStr = 'مرورگر یا دستگاه شما از اشتراک‌گذاری صفحه نمایش پشتیبانی نمی‌کند.';
      this.notifyError(errStr);
      return false;
    }

    try {
      console.log('[SCREEN] Start screen share requested');
      let displayStream: MediaStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
      } catch (err) {
        console.warn('[SCREEN] getDisplayMedia with system audio failed, falling back to video only:', err);
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
      }

      // Step 1: Debug local screen stream
      console.log('[SCREEN DEBUG] stream created', {
        streamId: displayStream.id,
        tracks: displayStream.getTracks().map((track) => ({
          id: track.id,
          kind: track.kind,
          label: track.label,
          readyState: track.readyState
        }))
      });

      const screenVideoTrack = displayStream.getVideoTracks()[0];
      if (!screenVideoTrack) {
        throw new Error('هیچ تصویر ویدیویی از صفحه نمایش دریافت نشد.');
      }

      this.localScreenStream = displayStream;
      this.isScreenSharing = true;

      // Handle browser's native "Stop Sharing" UI banner click
      screenVideoTrack.onended = () => {
        console.log('[SCREEN] Track ended via browser UI banner');
        this.stopScreenShare();
      };

      // 1. Transmit screenStreamId to all peers via signaling FIRST so remote peers are prepared
      realTimeClient.emitScreenShareStarted({ screenStreamId: displayStream.id });
      realTimeClient.emitMediaStateChanged({
        micEnabled: this.localMicEnabled,
        cameraEnabled: this.localCameraEnabled,
        callJoined: this.isInCall,
        screenSharingEnabled: true,
        updatedAt: Date.now()
      });

      // 2. Add screen tracks to all peer connections and initiate negotiation
      this.syncScreenTracksWithAllPeers();

      this.notifyLocalScreenStream();
      this.notifyScreenSharing();
      this.notifyPeerStates();

      return true;
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      console.warn('[SCREEN] Screen share cancelled or failed:', err);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        // User cancelled dialog
        return false;
      }
      const msg = error.message || 'خطا در اشتراک‌گذاری صفحه نمایش.';
      this.notifyError(msg);
      return false;
    }
  }

  /**
   * Synchronizes local screen share tracks across all room peers (Step 2 & Step 3).
   */
  public syncScreenTracksWithAllPeers(): void {
    if (!this.localScreenStream) return;
    const screenTracks = this.localScreenStream.getTracks();

    // Gather all remote user IDs in the room
    const remoteUserIds = new Set<string>();
    const currentUserId = realTimeClient.getCurrentUser()?.userId;

    this.peerMediaStates.forEach((_, userId) => {
      if (userId && userId !== currentUserId) remoteUserIds.add(userId);
    });

    this.peerConnections.forEach((_, userId) => {
      if (userId && userId !== currentUserId) remoteUserIds.add(userId);
    });

    console.log('[SCREEN DEBUG] Synchronizing screen tracks with remote users count:', remoteUserIds.size);

    remoteUserIds.forEach((remoteUserId) => {
      const pc = this.getOrCreatePeerConnection(remoteUserId);
      if (pc.signalingState === 'closed') return;

      // Step 2: Debug peer state before adding screen track
      console.log('[SCREEN DEBUG] peer', {
        peerId: remoteUserId,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
        senders: pc.getSenders().map((sender) => ({
          trackId: sender.track?.id,
          kind: sender.track?.kind
        })),
        transceivers: pc.getTransceivers().map((t) => ({
          mid: t.mid,
          direction: t.direction,
          currentDirection: t.currentDirection
        }))
      });

      const senders = pc.getSenders();
      let tracksAdded = false;

      screenTracks.forEach((track) => {
        const alreadyAdded = senders.some((s) => s.track?.id === track.id);
        if (!alreadyAdded) {
          try {
            console.log('[SCREEN DEBUG] Adding screen track to peer:', remoteUserId, track.id);
            const sender = pc.addTrack(track, this.localScreenStream!);
            tracksAdded = true;
            console.log('[SCREEN DEBUG] sender added', {
              peerId: remoteUserId,
              senderTrackId: sender.track?.id
            });
          } catch (err) {
            console.warn('[SCREEN DEBUG] Failed to add screen track to peer:', remoteUserId, err);
          }
        } else {
          console.log('[SCREEN DEBUG] Screen track already added to peer:', remoteUserId);
        }
      });

      // Verify screen sender exists
      const screenVideoTrack = this.localScreenStream.getVideoTracks()[0];
      if (screenVideoTrack) {
        const hasScreenSender = pc.getSenders().some((sender) => sender.track?.id === screenVideoTrack.id);
        console.log('[SCREEN DEBUG] screen sender exists:', hasScreenSender, { peerId: remoteUserId });
      }

      // Step 2 (after): Debug peer state after adding track
      console.log('[SCREEN DEBUG] peer (after adding track)', {
        peerId: remoteUserId,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
        senders: pc.getSenders().map((sender) => ({
          trackId: sender.track?.id,
          kind: sender.track?.kind
        }))
      });

      // Request renegotiation cleanly using centralized queue (Step 3)
      if (tracksAdded) {
        this.requestNegotiation(remoteUserId);
      }
    });
  }

  /**
   * Stops screen sharing, removes screen tracks from peer connections, and notifies room without breaking call.
   */
  public async stopScreenShare(): Promise<void> {
    if (this.isCleaningUpScreenShare || (!this.isScreenSharing && !this.localScreenStream)) return;
    this.isCleaningUpScreenShare = true;

    console.log('[SCREEN] Stop screen share requested');

    try {
      if (this.localScreenStream) {
        const screenTrackIds = new Set(this.localScreenStream.getTracks().map((t) => t.id));

        this.peerConnections.forEach((pc, remoteUserId) => {
          if (pc.signalingState === 'closed') return;
          const senders = pc.getSenders();
          let tracksRemoved = false;

          senders.forEach((sender) => {
            if (sender.track && screenTrackIds.has(sender.track.id)) {
              try {
                pc.removeTrack(sender);
                tracksRemoved = true;
                console.log('[SCREEN DEBUG] sender removed', { remoteUserId, trackId: sender.track?.id });
              } catch (err) {
                console.warn('[SCREEN] Failed to remove screen track sender:', err);
              }
            }
          });

          if (tracksRemoved) {
            this.requestNegotiation(remoteUserId);
          }
        });

        this.localScreenStream.getTracks().forEach((track) => {
          try {
            track.onended = null;
            track.stop();
          } catch {}
        });
      }

      this.localScreenStream = null;
      this.isScreenSharing = false;

      realTimeClient.emitScreenShareStopped();
      realTimeClient.emitMediaStateChanged({
        micEnabled: this.localMicEnabled,
        cameraEnabled: this.localCameraEnabled,
        callJoined: this.isInCall,
        screenSharingEnabled: false,
        updatedAt: Date.now()
      });

      this.notifyLocalScreenStream();
      this.notifyScreenSharing();
      this.notifyPeerStates();
    } finally {
      this.isCleaningUpScreenShare = false;
    }
  }

  /**
   * Toggles screen sharing on or off.
   */
  public async toggleScreenShare(): Promise<boolean> {
    if (this.isScreenSharing) {
      await this.stopScreenShare();
      return false;
    } else {
      return await this.startScreenShare();
    }
  }

  /**
   * Routes a remote video or audio track to the peer's remoteScreenStream unconditionally.
   * Attaches onended handler to cleanly remove the screen stream when remote peer stops sharing.
   */
  private routeTrackToScreen(remoteUserId: string, track: MediaStreamTrack, incomingStream: MediaStream): void {
    let screenStream = this.remoteScreenStreams.get(remoteUserId);
    if (!screenStream) {
      screenStream = new MediaStream([track]);
      this.remoteScreenStreams.set(remoteUserId, screenStream);
    } else {
      if (!screenStream.getTracks().some((t) => t.id === track.id)) {
        screenStream.addTrack(track);
      }
    }

    // Attach onended to clean up when remote track finishes
    track.onended = () => {
      this.handleRemoteScreenTrackEnded(remoteUserId, track.id);
    };

    const peer = this.peerMediaStates.get(remoteUserId) || {
      userId: remoteUserId,
      name: 'هم‌اتاقی',
      micEnabled: true,
      cameraEnabled: false,
      callJoined: true,
      updatedAt: Date.now()
    };
    peer.screenStream = screenStream;
    peer.screenSharing = true;
    this.peerMediaStates.set(remoteUserId, peer);
  }

  /**
   * Handles remote screen track ending
   */
  private handleRemoteScreenTrackEnded(remoteUserId: string, trackId: string): void {
    console.log('[REMOTE SCREEN TRACK ENDED]', { remoteUserId, trackId });
    const screenStream = this.remoteScreenStreams.get(remoteUserId);
    if (screenStream) {
      const remainingTracks = screenStream.getTracks().filter((t) => t.id !== trackId);
      if (remainingTracks.length === 0) {
        this.remoteScreenStreams.delete(remoteUserId);
        this.knownRemoteScreenStreams.delete(remoteUserId);
        const peer = this.peerMediaStates.get(remoteUserId);
        if (peer) {
          peer.screenSharing = false;
          peer.screenStream = undefined;
        }
        this.notifyRemoteScreenStreams();
        this.notifyPeerStates();
      }
    }
  }

  // --- Movie Live Stream Engine (Phase 7: captureStream) ---

  /**
   * Captures the MediaStream from an HTMLVideoElement and broadcasts it to all peers via WebRTC Mesh.
   */
  public async startMovieStream(
    videoElement: HTMLVideoElement,
    fileName: string,
    duration?: number
  ): Promise<{ stream: MediaStream | null; success: boolean; error?: string }> {
    try {
      if (!videoElement) {
        return { stream: null, success: false, error: 'المان ویدیو پیدا نشد.' };
      }

      const captureFunc = (videoElement as any).captureStream || (videoElement as any).mozCaptureStream;
      if (!captureFunc || typeof captureFunc !== 'function') {
        const err = 'مرورگر شما از ویژگی اشتراک ویدیوی محلی (captureStream) پشتیبانی نمی‌کند.';
        this.notifyError(err);
        return { stream: null, success: false, error: err };
      }

      // If existing movie stream is active, stop it first
      if (this.isMovieStreaming) {
        await this.stopMovieStream();
      }

      console.log('[MOVIE] Capturing stream from video element...', { fileName, duration });
      const stream: MediaStream = captureFunc.call(videoElement);
      console.log('[MOVIE] Capture stream created', {
        streamId: stream.id,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });

      this.localMovieStream = stream;
      this.isMovieStreaming = true;
      const currentUser = realTimeClient.getCurrentUser();
      this.movieStreamOwnerInfo = {
        userId: currentUser?.userId || '',
        fileName
      };

      // Collect target peers from roomService, peerConnections, and peerMediaStates
      const roomMembers = roomService.getRoomUsers();
      const targetPeers: Array<{ userId: string; name: string }> = [];

      roomMembers.forEach((u) => {
        if (u.userId !== currentUser?.userId && !targetPeers.some((p) => p.userId === u.userId)) {
          targetPeers.push({ userId: u.userId, name: u.name });
        }
      });

      this.peerMediaStates.forEach((state, peerId) => {
        if (peerId !== currentUser?.userId && !targetPeers.some((p) => p.userId === peerId)) {
          targetPeers.push({ userId: peerId, name: state.name });
        }
      });

      this.peerConnections.forEach((_, peerId) => {
        if (peerId !== currentUser?.userId && !targetPeers.some((p) => p.userId === peerId)) {
          targetPeers.push({ userId: peerId, name: 'کاربر' });
        }
      });

      console.log('[MOVIE] Broadcasting tracks to target peers:', targetPeers.map((p) => p.userId));

      // Broadcast tracks to all peers
      const tracks = stream.getTracks();
      for (const peer of targetPeers) {
        const pc = this.getOrCreatePeerConnection(peer.userId, peer.name);
        tracks.forEach((track) => {
          try {
            const senders = pc.getSenders();
            const existingSender = senders.find((s) => s.track && s.track.id === track.id);
            if (!existingSender) {
              pc.addTrack(track, stream);
              console.log('[MOVIE] Track added to peer:', peer.userId, {
                kind: track.kind,
                trackId: track.id,
                readyState: track.readyState
              });
            }
          } catch (err) {
            console.warn('[MOVIE] Failed to add movie track to peer:', peer.userId, err);
          }
        });
        await this.requestNegotiation(peer.userId);
      }

      // Handle track endings
      tracks.forEach((track) => {
        track.onended = () => {
          console.log('[MOVIE] Local movie track ended:', track.kind, track.id);
        };
      });

      // Emit MOVIE_STREAM_STARTED signaling message
      realTimeClient.emitMovieStreamStarted({
        movieStreamId: stream.id,
        fileName,
        duration
      });

      this.notifyLocalMovieStream();
      this.notifyMovieStreaming();
      return { stream, success: true };
    } catch (err: unknown) {
      const msg = 'خطا در ایجاد استریم ویدیو از فایل سیستم.';
      console.error('[MOVIE ERROR]', err);
      this.notifyError(msg);
      return { stream: null, success: false, error: msg };
    }
  }

  /**
   * Stops the active local movie stream, removes senders, and signals other peers.
   */
  public async stopMovieStream(): Promise<void> {
    if (!this.isMovieStreaming && !this.localMovieStream) return;

    console.log('[MOVIE] Stream stopped');
    if (this.localMovieStream) {
      const tracks = this.localMovieStream.getTracks();
      this.peerConnections.forEach((pc, peerId) => {
        const senders = pc.getSenders();
        senders.forEach((sender) => {
          if (sender.track && tracks.some((t) => t.id === sender.track!.id)) {
            try {
              pc.removeTrack(sender);
              console.log('[MOVIE] Track removed from peer sender:', peerId, sender.track.id);
            } catch (err) {
              console.warn('[MOVIE] Error removing movie sender track:', err);
            }
          }
        });
        this.requestNegotiation(peerId);
      });

      tracks.forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.localMovieStream = null;
    }

    this.isMovieStreaming = false;
    this.movieStreamOwnerInfo = null;

    realTimeClient.emitMovieStreamStopped();
    this.notifyLocalMovieStream();
    this.notifyMovieStreaming();
  }

  /**
   * Routes an incoming movie video or audio track to the remoteMovieStream.
   */
  private routeTrackToMovie(
    remoteUserId: string,
    track: MediaStreamTrack,
    incomingStream: MediaStream,
    fileName?: string
  ): void {
    if (!this.remoteMovieStream) {
      this.remoteMovieStream = new MediaStream([track]);
      console.log('[MOVIE] Created new remote movie stream with track:', track.kind, track.id);
    } else {
      if (!this.remoteMovieStream.getTracks().some((t) => t.id === track.id)) {
        this.remoteMovieStream.addTrack(track);
        console.log('[MOVIE] Added track to existing remote movie stream:', track.kind, track.id);
      }
      // Re-instantiate MediaStream container to ensure React state updates detect changes
      this.remoteMovieStream = new MediaStream(this.remoteMovieStream.getTracks());
    }

    this.movieStreamOwnerInfo = {
      userId: remoteUserId,
      fileName: fileName || this.knownRemoteMovieStreams.get(remoteUserId)?.fileName || 'ویدیوی محلی'
    };

    track.onended = () => {
      this.handleRemoteMovieTrackEnded(remoteUserId, track.id);
    };

    const peer = this.peerMediaStates.get(remoteUserId) || {
      userId: remoteUserId,
      name: 'هم‌اتاقی',
      micEnabled: true,
      cameraEnabled: false,
      callJoined: true,
      updatedAt: Date.now()
    };
    peer.isMovieStreaming = true;
    peer.movieStream = this.remoteMovieStream;
    this.peerMediaStates.set(remoteUserId, peer);
    this.notifyRemoteMovieStream();
    this.notifyPeerStates();
  }

  /**
   * Handles remote movie track ending
   */
  private handleRemoteMovieTrackEnded(remoteUserId: string, trackId: string): void {
    console.log('[MOVIE] Remote movie track ended:', { remoteUserId, trackId });
    if (this.remoteMovieStream) {
      const remainingTracks = this.remoteMovieStream.getTracks().filter((t) => t.id !== trackId);
      if (remainingTracks.length === 0) {
        this.remoteMovieStream = null;
        this.movieStreamOwnerInfo = null;
        this.knownRemoteMovieStreams.delete(remoteUserId);
        const peer = this.peerMediaStates.get(remoteUserId);
        if (peer) {
          peer.isMovieStreaming = false;
          peer.movieStream = undefined;
        }
        this.notifyRemoteMovieStream();
        this.notifyPeerStates();
      }
    }
  }

  /**
   * Adjusts maximum bitrate for video stream adaptation.
   */
  public async setMovieVideoMaxBitrate(maxBitrateBps: number | null): Promise<void> {
    if (!this.localMovieStream) return;
    const videoTrack = this.localMovieStream.getVideoTracks()[0];
    if (!videoTrack) return;

    for (const [peerId, pc] of this.peerConnections) {
      const sender = pc.getSenders().find((s) => s.track && s.track.id === videoTrack.id);
      if (sender && sender.getParameters) {
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          if (maxBitrateBps !== null) {
            params.encodings[0].maxBitrate = maxBitrateBps;
          } else {
            delete params.encodings[0].maxBitrate;
          }
          await sender.setParameters(params);
          console.log('[MOVIE] Max bitrate adjusted for peer:', peerId, maxBitrateBps);
        } catch (err) {
          console.warn('[MOVIE] Failed to set max bitrate on peer sender:', peerId, err);
        }
      }
    }
  }

  /**
   * Subscribes to Movie Stream Control requests from other peers (Play/Pause/Stop).
   */
  public onMovieControlRequest(
    listener: (data: { action: 'play' | 'pause' | 'stop'; currentTime?: number; senderId: string }) => void
  ): () => void {
    this.movieControlListeners.add(listener);
    return () => {
      this.movieControlListeners.delete(listener);
    };
  }

  /**
   * Subscribes to Movie Stream Seek requests from other peers.
   */
  public onMovieSeekRequest(
    listener: (data: { currentTime: number; isPlaying?: boolean; senderId: string }) => void
  ): () => void {
    this.movieSeekListeners.add(listener);
    return () => {
      this.movieSeekListeners.delete(listener);
    };
  }

  /**
   * Closes a single peer connection and cleans up its remote stream & screen stream.
   */
  public closePeerConnection(remoteUserId: string): void {
    console.log('[PEER CLOSED]', { remoteUserId });
    const pc = this.peerConnections.get(remoteUserId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // Ignore
      }
      this.peerConnections.delete(remoteUserId);
    }

    const stream = this.remoteStreams.get(remoteUserId);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      this.remoteStreams.delete(remoteUserId);
    }

    const screenSt = this.remoteScreenStreams.get(remoteUserId);
    if (screenSt) {
      screenSt.getTracks().forEach((t) => t.stop());
      this.remoteScreenStreams.delete(remoteUserId);
    }

    this.knownRemoteScreenStreams.delete(remoteUserId);
    this.knownRemoteMovieStreams.delete(remoteUserId);
    this.bufferedVideoTracks.delete(remoteUserId);
    this.bufferedMovieTracks.delete(remoteUserId);
    this.iceCandidatesQueue.delete(remoteUserId);
    this.makingOffer.delete(remoteUserId);
    this.isSettingRemoteAnswerPending.delete(remoteUserId);
    this.remotePeerScreenStreamIds.delete(remoteUserId);
    this.negotiationPending.delete(remoteUserId);
    this.peerMediaStates.delete(remoteUserId);

    this.notifyRemoteStreams();
    this.notifyRemoteScreenStreams();
    this.notifyRemoteMovieStream();
    this.notifyPeerStates();
  }

  /**
   * Leaves the WebRTC Call session and stops local camera, screen & movie tracks.
   */
  public leaveCall(): void {
    if (this.isScreenSharing) {
      this.stopScreenShare();
    }
    if (this.isMovieStreaming) {
      this.stopMovieStream();
    }

    if (!this.isInCall && !this.localStream) return;
    console.log('[LEAVE CALL CLEANUP]');

    this.isInCall = false;
    this.localMicEnabled = false;
    this.localCameraEnabled = false;

    // 1. Emit WEBRTC_LEAVE to other peers
    realTimeClient.emitWebRTCLeave();
    realTimeClient.emitMediaStateChanged({
      micEnabled: false,
      cameraEnabled: false,
      callJoined: false,
      updatedAt: Date.now()
    });

    // 2. Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      this.localStream = null;
    }

    // 3. Close all peer connections & clean remote streams
    this.peerConnections.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // Ignore
      }
    });
    this.peerConnections.clear();

    this.remoteStreams.forEach((st) => {
      st.getTracks().forEach((t) => t.stop());
    });
    this.remoteStreams.clear();

    this.remoteScreenStreams.forEach((st) => {
      st.getTracks().forEach((t) => t.stop());
    });
    this.remoteScreenStreams.clear();

    if (this.remoteMovieStream) {
      this.remoteMovieStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.remoteMovieStream = null;
    }

    this.knownRemoteScreenStreams.clear();
    this.knownRemoteMovieStreams.clear();
    this.bufferedVideoTracks.clear();
    this.bufferedMovieTracks.clear();
    this.iceCandidatesQueue.clear();
    this.makingOffer.clear();
    this.isSettingRemoteAnswerPending.clear();
    this.remotePeerScreenStreamIds.clear();
    this.negotiationPending.clear();
    this.peerMediaStates.clear();

    this.notifyLocalStream();
    this.notifyLocalScreenStream();
    this.notifyLocalMovieStream();
    this.notifyRemoteStreams();
    this.notifyRemoteScreenStreams();
    this.notifyRemoteMovieStream();
    this.notifyPeerStates();
    this.notifyCallState();
  }

  /**
   * Complete teardown on room exit or component unmount.
   */
  public cleanup(): void {
    this.leaveCall();
    if (this.realTimeUnsub) {
      this.realTimeUnsub();
      this.realTimeUnsub = null;
    }
  }

  // --- Getters ---

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream;
  }

  public getLocalMovieStream(): MediaStream | null {
    return this.localMovieStream;
  }

  public getRemoteMovieStream(): MediaStream | null {
    return this.remoteMovieStream;
  }

  public getMovieStreamOwnerInfo(): { userId: string; fileName: string } | null {
    return this.movieStreamOwnerInfo;
  }

  public getIsMovieStreaming(): boolean {
    return this.isMovieStreaming;
  }

  public getRemoteStreams(): Map<string, MediaStream> {
    return new Map(this.remoteStreams);
  }

  public getRemoteScreenStreams(): Map<string, MediaStream> {
    return new Map(this.remoteScreenStreams);
  }

  public getPeerMediaStates(): Map<string, PeerMediaState> {
    return new Map(this.peerMediaStates);
  }

  public getIsCallActive(): boolean {
    return this.isInCall;
  }

  public isLocalMicOn(): boolean {
    return this.localMicEnabled;
  }

  public isLocalCameraOn(): boolean {
    return this.localCameraEnabled;
  }

  public isLocalScreenSharingOn(): boolean {
    return this.isScreenSharing;
  }
}

// Global Singleton Manager
export const webRTCManager = new WebRTCManager();
