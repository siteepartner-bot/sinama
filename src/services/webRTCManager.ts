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
  WebRTCLeaveMessage
} from '../types';
import { realTimeClient } from './realtimeClient';

export interface WebRTCManagerListeners {
  onLocalStreamChange?: (stream: MediaStream | null) => void;
  onLocalScreenStreamChange?: (stream: MediaStream | null) => void;
  onRemoteStreamsChange?: (remoteStreams: Map<string, MediaStream>) => void;
  onRemoteScreenStreamsChange?: (remoteScreenStreams: Map<string, MediaStream>) => void;
  onPeerStatesChange?: (peerStates: Map<string, PeerMediaState>) => void;
  onError?: (errorMessage: string) => void;
  onCallStateChange?: (isInCall: boolean) => void;
  onScreenSharingChange?: (isScreenSharing: boolean) => void;
}

/**
 * WebRTCManager - Modular Multi-User WebRTC Mesh Service.
 * Manages MediaStreams, RTCPeerConnections per peer, deterministic collision-free Perfect Negotiation,
 * ICE candidates queuing, graceful fallback, Screen Sharing, and clean lifecycle teardown.
 */
export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private isScreenSharing = false;

  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private remoteScreenStreams: Map<string, MediaStream> = new Map();
  private peerMediaStates: Map<string, PeerMediaState> = new Map();
  private iceCandidatesQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  private makingOffer: Map<string, boolean> = new Map();
  private isSettingRemoteAnswerPending: Map<string, boolean> = new Map();

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
    listener.onRemoteStreamsChange?.(new Map(this.remoteStreams));
    listener.onRemoteScreenStreamsChange?.(new Map(this.remoteScreenStreams));
    listener.onPeerStatesChange?.(new Map(this.peerMediaStates));
    listener.onCallStateChange?.(this.isInCall);
    listener.onScreenSharingChange?.(this.isScreenSharing);

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

  private notifyRemoteStreams(): void {
    const copy = new Map(this.remoteStreams);
    this.listeners.forEach((l) => l.onRemoteStreamsChange?.(copy));
  }

  private notifyRemoteScreenStreams(): void {
    const copy = new Map(this.remoteScreenStreams);
    this.listeners.forEach((l) => l.onRemoteScreenStreamsChange?.(copy));
  }

  private notifyScreenSharing(): void {
    this.listeners.forEach((l) => l.onScreenSharingChange?.(this.isScreenSharing));
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

        // If local user is in call, connect to joining peer
        if (this.isInCall) {
          console.log('[CONNECTING TO NEW PEER]', { remoteUserId });
          const pc = this.getOrCreatePeerConnection(remoteUserId, joinMsg.senderName);
          // If we are the impolite peer or the caller, we can proactively create offer
          if (!this.isPolitePeer(remoteUserId)) {
            await this.initiateOffer(remoteUserId, pc);
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

      case 'USER_LEFT': {
        const leftUserId = message.userId;
        console.log('[USER LEFT ROOM CLEANUP]', { leftUserId });
        this.closePeerConnection(leftUserId);
        break;
      }

      case 'WEBRTC_OFFER': {
        const offerMsg = message as WebRTCOfferMessage;
        if (offerMsg.toUserId !== currentUser.userId) return;
        console.log('[OFFER RECEIVED]', { fromUserId: offerMsg.senderId });
        await this.handleOffer(offerMsg.senderId, offerMsg.payload, offerMsg.senderName);
        break;
      }

      case 'WEBRTC_ANSWER': {
        const answerMsg = message as WebRTCAnswerMessage;
        if (answerMsg.toUserId !== currentUser.userId) return;
        console.log('[ANSWER RECEIVED]', { fromUserId: answerMsg.senderId });
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
        console.log('[SCREEN SHARE STARTED SIGNAL RECEIVED]', { remoteUserId });
        if (remoteUserId === currentUser.userId) return;

        const peer = this.peerMediaStates.get(remoteUserId) || {
          userId: remoteUserId,
          name: message.senderName || 'کاربر',
          micEnabled: true,
          cameraEnabled: false,
          callJoined: true,
          updatedAt: Date.now()
        };
        peer.screenSharing = true;
        this.peerMediaStates.set(remoteUserId, peer);
        this.notifyPeerStates();
        break;
      }

      case 'SCREEN_SHARE_STOPPED': {
        const remoteUserId = message.senderId;
        console.log('[SCREEN SHARE STOPPED SIGNAL RECEIVED]', { remoteUserId });
        if (remoteUserId === currentUser.userId) return;

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

    // 2. Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        realTimeClient.emitWebRTCIceCandidate(remoteUserId, event.candidate.toJSON());
      }
    };

    // 3. Handle Remote Track
    pc.ontrack = (event) => {
      console.log('[SCREEN] Remote track received:', {
        fromUserId: remoteUserId,
        trackId: event.track.id,
        kind: event.track.kind,
        readyState: event.track.readyState,
        streamId: event.streams[0]?.id
      });

      const incomingStream = event.streams[0] || new MediaStream([event.track]);
      const cameraStream = this.remoteStreams.get(remoteUserId);
      const peerState = this.peerMediaStates.get(remoteUserId);

      // Distinguish screen share track vs camera/mic track
      if (event.track.kind === 'video') {
        const isScreenTrack =
          (peerState?.screenSharing === true && (!cameraStream || incomingStream.id !== cameraStream.id || !peerState.cameraEnabled)) ||
          (cameraStream && cameraStream.getVideoTracks().length > 0 && !cameraStream.getVideoTracks().some((t) => t.id === event.track.id)) ||
          (cameraStream && incomingStream.id !== cameraStream.id);

        if (isScreenTrack) {
          let screenStream = this.remoteScreenStreams.get(remoteUserId);
          if (!screenStream || screenStream.id !== incomingStream.id) {
            screenStream = incomingStream;
            this.remoteScreenStreams.set(remoteUserId, screenStream);
          } else {
            if (!screenStream.getTracks().some((t) => t.id === event.track.id)) {
              screenStream.addTrack(event.track);
            }
          }

          if (peerState) {
            peerState.screenStream = screenStream;
            peerState.screenSharing = true;
          }

          console.log('[SCREEN] Remote stream attached for peer:', remoteUserId, {
            screenStreamId: screenStream.id,
            videoTrackCount: screenStream.getVideoTracks().length,
            trackId: event.track.id
          });

          this.notifyRemoteScreenStreams();
          this.notifyPeerStates();
          return;
        }
      }

      // Default: Camera / Microphone Stream
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
    };

    // 4. Handle Negotiation Needed (Polite / Impolite collision avoidance)
    pc.onnegotiationneeded = async () => {
      try {
        console.log('[SCREEN] Negotiation needed event for peer:', remoteUserId);
        if (pc!.signalingState !== 'stable') {
          console.log('[SCREEN] Negotiation needed ignored, signalingState is:', pc!.signalingState);
          return;
        }
        this.makingOffer.set(remoteUserId, true);
        const offer = await pc!.createOffer();
        await pc!.setLocalDescription(offer);
        console.log('[SCREEN] Offer sent from negotiationneeded to:', remoteUserId);
        if (pc!.localDescription) {
          realTimeClient.emitWebRTCOffer(remoteUserId, pc!.localDescription);
        }
      } catch (err) {
        console.error('[SCREEN] Offer generation failed on negotiationneeded for:', remoteUserId, err);
      } finally {
        this.makingOffer.set(remoteUserId, false);
      }
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

  private async initiateOffer(remoteUserId: string, pc: RTCPeerConnection): Promise<void> {
    try {
      this.makingOffer.set(remoteUserId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      realTimeClient.emitWebRTCOffer(remoteUserId, pc.localDescription!);
    } catch (err) {
      console.error('[INITIATE OFFER ERROR]', err);
    } finally {
      this.makingOffer.set(remoteUserId, false);
    }
  }

  private async handleOffer(
    fromUserId: string,
    offer: RTCSessionDescriptionInit,
    senderName?: string
  ): Promise<void> {
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

      await this.flushIceCandidatesQueue(fromUserId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      realTimeClient.emitWebRTCAnswer(fromUserId, pc.localDescription!);
    } catch (err) {
      console.error('[HANDLE OFFER FAILED]', err);
    }
  }

  private async handleAnswer(
    fromUserId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const pc = this.peerConnections.get(fromUserId);
    if (!pc) return;

    try {
      this.isSettingRemoteAnswerPending.set(fromUserId, true);
      await pc.setRemoteDescription(answer);
      await this.flushIceCandidatesQueue(fromUserId, pc);
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

      console.log('[SCREEN] Local stream created:', displayStream.id);

      const screenVideoTrack = displayStream.getVideoTracks()[0];
      if (!screenVideoTrack) {
        throw new Error('هیچ تصویر ویدیویی از صفحه نمایش دریافت نشد.');
      }

      console.log('[SCREEN] Video track:', {
        id: screenVideoTrack.id,
        kind: screenVideoTrack.kind,
        readyState: screenVideoTrack.readyState
      });

      this.localScreenStream = displayStream;
      this.isScreenSharing = true;

      // Handle browser's native "Stop Sharing" UI banner click
      screenVideoTrack.onended = () => {
        console.log('[SCREEN] Track ended via browser UI banner');
        this.stopScreenShare();
      };

      // Add screen tracks to all peer connections and initiate negotiation
      this.syncScreenTracksWithAllPeers();

      realTimeClient.emitScreenShareStarted();
      realTimeClient.emitMediaStateChanged({
        micEnabled: this.localMicEnabled,
        cameraEnabled: this.localCameraEnabled,
        callJoined: this.isInCall,
        screenSharingEnabled: true,
        updatedAt: Date.now()
      });

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
   * Synchronizes local screen share tracks across all open RTCPeerConnections.
   */
  public syncScreenTracksWithAllPeers(): void {
    if (!this.localScreenStream) return;
    const screenTracks = this.localScreenStream.getTracks();
    console.log('[SCREEN] Active peers count:', this.peerConnections.size);

    this.peerConnections.forEach((pc, remoteUserId) => {
      if (pc.signalingState === 'closed') return;
      const senders = pc.getSenders();

      screenTracks.forEach((track) => {
        const alreadyAdded = senders.some((s) => s.track?.id === track.id);
        if (!alreadyAdded) {
          try {
            console.log('[SCREEN] Adding screen track to peer:', remoteUserId);
            const sender = pc.addTrack(track, this.localScreenStream!);
            console.log('[SCREEN] Sender created:', sender.track?.id || track.id);

            // Force renegotiation if signalingState is stable
            if (pc.signalingState === 'stable') {
              this.initiateOffer(remoteUserId, pc);
            }
          } catch (err) {
            console.warn('[SCREEN] Failed to add screen track to peer:', remoteUserId, err);
          }
        } else {
          console.log('[SCREEN] Screen track already added to peer:', remoteUserId);
        }
      });
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
          senders.forEach((sender) => {
            if (sender.track && screenTrackIds.has(sender.track.id)) {
              try {
                pc.removeTrack(sender);
                console.log('[SCREEN] Removed screen track sender from peer:', remoteUserId);
              } catch (err) {
                console.warn('[SCREEN] Failed to remove screen track sender:', err);
              }
            }
          });

          if (pc.signalingState === 'stable') {
            this.initiateOffer(remoteUserId, pc);
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

    this.iceCandidatesQueue.delete(remoteUserId);
    this.makingOffer.delete(remoteUserId);
    this.isSettingRemoteAnswerPending.delete(remoteUserId);
    this.peerMediaStates.delete(remoteUserId);

    this.notifyRemoteStreams();
    this.notifyRemoteScreenStreams();
    this.notifyPeerStates();
  }

  /**
   * Leaves the WebRTC Call session and stops local camera & screen tracks.
   */
  public leaveCall(): void {
    if (this.isScreenSharing) {
      this.stopScreenShare();
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

    this.iceCandidatesQueue.clear();
    this.makingOffer.clear();
    this.isSettingRemoteAnswerPending.clear();
    this.peerMediaStates.clear();

    this.notifyLocalStream();
    this.notifyLocalScreenStream();
    this.notifyRemoteStreams();
    this.notifyRemoteScreenStreams();
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
