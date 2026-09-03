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
  onRemoteStreamsChange?: (remoteStreams: Map<string, MediaStream>) => void;
  onPeerStatesChange?: (peerStates: Map<string, PeerMediaState>) => void;
  onError?: (errorMessage: string) => void;
  onCallStateChange?: (isInCall: boolean) => void;
}

/**
 * WebRTCManager - Modular Multi-User WebRTC Mesh Service.
 * Manages MediaStreams, RTCPeerConnections per peer, deterministic collision-free Perfect Negotiation,
 * ICE candidates queuing, graceful fallback, and clean lifecycle teardown.
 */
export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private peerMediaStates: Map<string, PeerMediaState> = new Map();
  private iceCandidatesQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  private makingOffer: Map<string, boolean> = new Map();
  private isSettingRemoteAnswerPending: Map<string, boolean> = new Map();

  private isInCall = false;
  private localMicEnabled = false;
  private localCameraEnabled = false;

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
    listener.onRemoteStreamsChange?.(new Map(this.remoteStreams));
    listener.onPeerStatesChange?.(new Map(this.peerMediaStates));
    listener.onCallStateChange?.(this.isInCall);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyLocalStream(): void {
    this.listeners.forEach((l) => l.onLocalStreamChange?.(this.localStream));
  }

  private notifyRemoteStreams(): void {
    const copy = new Map(this.remoteStreams);
    this.listeners.forEach((l) => l.onRemoteStreamsChange?.(copy));
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

        this.peerMediaStates.set(remoteUserId, peer);
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

    // 1. Send Local Tracks to Peer
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

    // 2. Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        realTimeClient.emitWebRTCIceCandidate(remoteUserId, event.candidate.toJSON());
      }
    };

    // 3. Handle Remote Track
    pc.ontrack = (event) => {
      console.log('[REMOTE TRACK]', {
        remoteUserId,
        kind: event.track.kind,
        streamsLength: event.streams.length
      });

      let remoteStream = this.remoteStreams.get(remoteUserId);
      if (!remoteStream) {
        remoteStream = event.streams[0] || new MediaStream();
        this.remoteStreams.set(remoteUserId, remoteStream);
      } else {
        if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }
      }

      const peerState = this.peerMediaStates.get(remoteUserId);
      if (peerState) {
        peerState.stream = remoteStream;
      }

      this.notifyRemoteStreams();
      this.notifyPeerStates();
    };

    // 4. Handle Negotiation Needed (Polite / Impolite collision avoidance)
    pc.onnegotiationneeded = async () => {
      try {
        console.log('[NEGOTIATION NEEDED]', { remoteUserId });
        this.makingOffer.set(remoteUserId, true);
        await pc!.setLocalDescription();
        if (pc!.localDescription) {
          realTimeClient.emitWebRTCOffer(remoteUserId, pc!.localDescription);
        }
      } catch (err) {
        console.error('[OFFER GENERATION FAILED]', err);
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
   * Closes a single peer connection and cleans up its remote stream.
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

    this.iceCandidatesQueue.delete(remoteUserId);
    this.makingOffer.delete(remoteUserId);
    this.isSettingRemoteAnswerPending.delete(remoteUserId);
    this.peerMediaStates.delete(remoteUserId);

    this.notifyRemoteStreams();
    this.notifyPeerStates();
  }

  /**
   * Leaves the WebRTC Call session and stops local tracks.
   */
  public leaveCall(): void {
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

    this.iceCandidatesQueue.clear();
    this.makingOffer.clear();
    this.isSettingRemoteAnswerPending.clear();
    this.peerMediaStates.clear();

    this.notifyLocalStream();
    this.notifyRemoteStreams();
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

  public getRemoteStreams(): Map<string, MediaStream> {
    return new Map(this.remoteStreams);
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
}

// Global Singleton Manager
export const webRTCManager = new WebRTCManager();
