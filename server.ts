import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const HOST = '0.0.0.0';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const TEMP_UPLOADS_DIR = path.join(process.cwd(), 'uploads_temp');
if (!fs.existsSync(TEMP_UPLOADS_DIR)) {
  fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
}

// Setup multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Decode original name properly if needed and sanitize
    const sanitized = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_');
    const uniqueName = `${Date.now()}_${sanitized}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10 GB max
  }
});

// Helper for MIME types
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    default:
      return 'application/octet-stream';
  }
}

// In-Memory Room & WebRTC State
interface RoomUserState {
  userId: string;
  name: string;
  avatar?: string;
  role: 'host' | 'member';
  isHost?: boolean;
  canControlMedia?: boolean;
  isOnline: boolean;
  joinedAt: number;
  micEnabled?: boolean;
  cameraEnabled?: boolean;
  callJoined?: boolean;
  screenSharingEnabled?: boolean;
}

interface RoomState {
  roomId: string;
  roomName: string;
  hostId: string;
  createdAt: number;
  allowAnyoneControl: boolean;
  users: RoomUserState[];
  chatMessages: any[];
  mediaState: {
    sourceType: string | null;
    sourceUrl: string;
    title: string;
    videoId?: string;
    fileName?: string;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    quality: string;
    playbackRate: number;
    updatedAt: number;
    updatedBy?: string;
    updatedByName?: string;
  };
}

const rooms = new Map<string, RoomState>();
const socketSessions = new Map<WebSocket, { roomId: string; userId: string; userName: string }>();

function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      roomName: `اتاق واچ‌پارتی ${roomId}`,
      hostId: '',
      createdAt: Date.now(),
      allowAnyoneControl: true,
      users: [],
      chatMessages: [],
      mediaState: {
        sourceType: 'direct',
        sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        title: 'Big Buck Bunny (ویدیوی نمونه)',
        isPlaying: false,
        currentTime: 0,
        duration: 596,
        quality: '1080p',
        playbackRate: 1,
        updatedAt: Date.now()
      }
    };
    rooms.set(roomId, room);
  }
  return room;
}

function getCalculatedRoom(room: RoomState): RoomState {
  const media = room.mediaState;
  if (media.isPlaying && media.updatedAt) {
    const elapsed = (Date.now() - media.updatedAt) / 1000;
    const rate = media.playbackRate || 1;
    const computedTime = Math.min(
      media.duration > 0 ? media.duration : Infinity,
      media.currentTime + elapsed * rate
    );
    return {
      ...room,
      mediaState: {
        ...media,
        currentTime: computedTime
      }
    };
  }
  return room;
}

function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
  const serialized = JSON.stringify(message);
  for (const [ws, session] of socketSessions.entries()) {
    if (session.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(serialized);
      } catch (err) {
        console.warn('Failed to send WS message:', err);
      }
    }
  }
}

function sendToUserInRoom(roomId: string, targetUserId: string, message: any) {
  const serialized = JSON.stringify(message);
  for (const [ws, session] of socketSessions.entries()) {
    if (session.roomId === roomId && session.userId === targetUserId && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(serialized);
        return;
      } catch (err) {
        console.warn('Failed to send targeted WS message:', err);
      }
    }
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 1. Health API
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Roomy Full-Stack Server' });
  });

  // 2. High-Speed Multi-Threaded Chunked Upload APIs
  app.post('/api/upload/init', (req, res) => {
    try {
      const { fileName, fileSize, totalChunks, chunkSize } = req.body;
      if (!fileName || !totalChunks) {
        return res.status(400).json({ error: 'اطلاعات فایل ناقص است.' });
      }

      const sanitized = Buffer.from(fileName, 'latin1').toString('utf8').replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_');
      const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${sanitized}`;
      const uploadDir = path.join(TEMP_UPLOADS_DIR, uploadId);
      fs.mkdirSync(uploadDir, { recursive: true });

      return res.json({
        success: true,
        uploadId,
        chunkSize: chunkSize || 4 * 1024 * 1024,
        totalChunks
      });
    } catch (err: any) {
      console.error('[UPLOAD INIT ERROR]', err);
      return res.status(500).json({ error: err.message || 'خطا در آماده‌سازی آپلود' });
    }
  });

  // Binary chunk receiver with ultra-fast raw disk write
  app.post('/api/upload/chunk', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
    try {
      const uploadId = (req.query.uploadId || req.headers['x-upload-id']) as string;
      const chunkIndexStr = (req.query.chunkIndex || req.headers['x-chunk-index']) as string;
      const chunkIndex = parseInt(chunkIndexStr, 10);

      if (!uploadId || isNaN(chunkIndex)) {
        return res.status(400).json({ error: 'پارامترهای آپلود چانک ناقص است.' });
      }

      const safeUploadId = path.basename(uploadId);
      const uploadDir = path.join(TEMP_UPLOADS_DIR, safeUploadId);
      if (!fs.existsSync(uploadDir)) {
        return res.status(404).json({ error: 'شناسه آپلود یافت نشد یا منقضی شده است.' });
      }

      const chunkPath = path.join(uploadDir, `chunk_${chunkIndex.toString().padStart(6, '0')}`);
      const data = req.body as Buffer;

      if (!data || data.length === 0) {
        return res.status(400).json({ error: 'محتوای تکه ارسالی خالی است.' });
      }

      fs.writeFileSync(chunkPath, data);

      return res.json({
        success: true,
        chunkIndex,
        receivedBytes: data.length
      });
    } catch (err: any) {
      console.error('[CHUNK UPLOAD ERROR]', err);
      return res.status(500).json({ error: err.message || 'خطا در ذخیره تکه ویدیو' });
    }
  });

  // Finalize and stitch chunks together
  app.post('/api/upload/complete', async (req, res) => {
    try {
      const { uploadId, fileName, totalChunks } = req.body;
      if (!uploadId || !fileName || !totalChunks) {
        return res.status(400).json({ error: 'پارامترهای تکمیل آپلود ناقص است.' });
      }

      const safeUploadId = path.basename(uploadId);
      const uploadDir = path.join(TEMP_UPLOADS_DIR, safeUploadId);
      if (!fs.existsSync(uploadDir)) {
        return res.status(404).json({ error: 'پوشه موقت آپلود یافت نشد.' });
      }

      const sanitized = Buffer.from(fileName, 'latin1').toString('utf8').replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_');
      const finalFilename = `${Date.now()}_${sanitized}`;
      const finalPath = path.join(UPLOADS_DIR, finalFilename);

      const writeStream = fs.createWriteStream(finalPath, { flags: 'w' });

      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `chunk_${i.toString().padStart(6, '0')}`);
        if (!fs.existsSync(chunkPath)) {
          writeStream.destroy();
          if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
          return res.status(400).json({ error: `تکه شماره ${i} مفقود شده است. لطفاً مجدداً تلاش کنید.` });
        }

        const chunkBuffer = fs.readFileSync(chunkPath);
        writeStream.write(chunkBuffer);
      }

      writeStream.end();

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', (err) => reject(err));
      });

      // Cleanup temp directory
      try {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('Failed to cleanup temp dir:', cleanupErr);
      }

      const stat = fs.statSync(finalPath);
      const fileUrl = `/api/uploads/${encodeURIComponent(finalFilename)}`;

      console.log('[TURBO CHUNKED UPLOAD COMPLETE]', {
        finalFilename,
        fileName,
        totalChunks,
        size: stat.size
      });

      return res.json({
        success: true,
        url: fileUrl,
        fileName,
        size: stat.size,
        mimetype: getMimeType(finalFilename)
      });
    } catch (err: any) {
      console.error('[UPLOAD COMPLETE ERROR]', err);
      return res.status(500).json({ error: err.message || 'خطا در تجمیع فایل نهایی.' });
    }
  });

  // 3. Single-request Video Upload API (Fallback)
  app.post('/api/upload', upload.single('video') as any, (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'هیچ فایلی برای آپلود انتخاب نشده است.' });
      }

      const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const filename = req.file.filename;
      const fileUrl = `/api/uploads/${encodeURIComponent(filename)}`;

      console.log('[UPLOAD SUCCESS]', {
        filename,
        originalName,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      return res.json({
        success: true,
        url: fileUrl,
        fileName: originalName,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
    } catch (err: any) {
      console.error('[UPLOAD ERROR]', err);
      return res.status(500).json({ error: err.message || 'خطا در آپلود فایل' });
    }
  });

  // 3. Streaming Video API with HTTP 206 Partial Content Range Support
  app.get('/api/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'فایل ویدیویی یافت نشد.' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeType = getMimeType(safeFilename);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).send(`Requested range not satisfiable: ${start} >= ${fileSize}`);
        return;
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache'
      };

      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // 4. WebSocket Server for Authoritative Real-Time Video Sync & Signaling
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const isRoomWs = url.pathname.startsWith('/api/room') || url.pathname.startsWith('/ws');

    if (isRoomWs) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const match = url.pathname.match(/\/(?:api\/room|ws)\/([a-zA-Z0-9_-]+)/);
    const initialRoomId = match ? match[1] : url.searchParams.get('roomId') || '1234';

    ws.on('message', (data: any) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString();
        const msg = JSON.parse(raw);
        const now = Date.now();
        const roomId = msg.roomId || initialRoomId;
        const room = getOrCreateRoom(roomId);

        switch (msg.type) {
          case 'PING':
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PONG', timestamp: now }));
            }
            break;

          case 'JOIN_ROOM': {
            const user = msg.user;
            socketSessions.set(ws, {
              roomId,
              userId: user.userId,
              userName: user.name
            });

            user.canControlMedia = true;
            user.role = room.hostId === user.userId || !room.hostId ? 'host' : 'member';
            user.isHost = user.role === 'host';

            if (!room.hostId) {
              room.hostId = user.userId;
            }

            const existingIdx = room.users.findIndex((u) => u.userId === user.userId);
            if (existingIdx >= 0) {
              room.users[existingIdx] = { ...room.users[existingIdx], ...user, isOnline: true };
            } else {
              room.users.push(user);
            }

            // 1. Send authoritative snapshot to joining user
            const calculated = getCalculatedRoom(room);
            ws.send(
              JSON.stringify({
                type: 'ROOM_STATE_SYNC',
                roomId,
                room: calculated,
                chatMessages: room.chatMessages,
                serverTimestamp: now
              })
            );

            // 2. Broadcast USER_JOINED to other users
            broadcastToRoom(
              roomId,
              {
                type: 'USER_JOINED',
                roomId,
                user,
                timestamp: now
              },
              ws
            );
            break;
          }

          case 'VIDEO_PLAY': {
            room.mediaState = {
              ...room.mediaState,
              isPlaying: true,
              currentTime: msg.currentTime,
              updatedAt: now,
              updatedBy: msg.senderId,
              updatedByName: msg.senderName
            };
            broadcastToRoom(
              roomId,
              {
                type: 'VIDEO_PLAY',
                roomId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                currentTime: msg.currentTime,
                timestamp: msg.timestamp,
                serverTimestamp: now
              },
              ws
            );
            break;
          }

          case 'VIDEO_PAUSE': {
            room.mediaState = {
              ...room.mediaState,
              isPlaying: false,
              currentTime: msg.currentTime,
              updatedAt: now,
              updatedBy: msg.senderId,
              updatedByName: msg.senderName
            };
            broadcastToRoom(
              roomId,
              {
                type: 'VIDEO_PAUSE',
                roomId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                currentTime: msg.currentTime,
                timestamp: msg.timestamp,
                serverTimestamp: now
              },
              ws
            );
            break;
          }

          case 'VIDEO_SEEK': {
            room.mediaState = {
              ...room.mediaState,
              currentTime: msg.currentTime,
              isPlaying: msg.isPlaying !== undefined ? msg.isPlaying : room.mediaState.isPlaying,
              updatedAt: now,
              updatedBy: msg.senderId,
              updatedByName: msg.senderName
            };
            broadcastToRoom(
              roomId,
              {
                type: 'VIDEO_SEEK',
                roomId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                currentTime: msg.currentTime,
                isPlaying: room.mediaState.isPlaying,
                timestamp: msg.timestamp,
                serverTimestamp: now
              },
              ws
            );
            break;
          }

          case 'VIDEO_SOURCE_CHANGED': {
            const source = msg.source;
            room.mediaState = {
              ...room.mediaState,
              sourceType: source.type === 'none' ? null : source.type,
              sourceUrl: source.url,
              title: source.title || 'ویدیوی جدید',
              videoId: source.videoId,
              fileName: source.fileName,
              isPlaying: msg.isPlaying !== undefined ? msg.isPlaying : true,
              currentTime: msg.currentTime || 0,
              duration: source.duration || 360,
              updatedAt: now,
              updatedBy: msg.senderId,
              updatedByName: msg.senderName
            };
            broadcastToRoom(
              roomId,
              {
                type: 'VIDEO_SOURCE_CHANGED',
                roomId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                source,
                currentTime: msg.currentTime || 0,
                isPlaying: room.mediaState.isPlaying,
                timestamp: now
              },
              ws
            );
            break;
          }

          case 'VIDEO_RATE_CHANGED': {
            room.mediaState = {
              ...room.mediaState,
              playbackRate: msg.playbackRate,
              currentTime: msg.currentTime,
              updatedAt: now,
              updatedBy: msg.senderId,
              updatedByName: msg.senderName
            };
            broadcastToRoom(
              roomId,
              {
                type: 'VIDEO_RATE_CHANGED',
                roomId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                playbackRate: msg.playbackRate,
                currentTime: msg.currentTime,
                timestamp: now
              },
              ws
            );
            break;
          }

          case 'VIDEO_ENDED': {
            room.mediaState = {
              ...room.mediaState,
              isPlaying: false,
              currentTime: msg.currentTime,
              updatedAt: now,
              updatedBy: msg.senderId,
              updatedByName: msg.senderName
            };
            broadcastToRoom(
              roomId,
              {
                type: 'VIDEO_ENDED',
                roomId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                currentTime: msg.currentTime,
                timestamp: now
              },
              ws
            );
            break;
          }

          case 'ROOM_PERMISSIONS_CHANGED': {
            room.allowAnyoneControl = msg.allowAnyoneControl;
            broadcastToRoom(roomId, {
              type: 'ROOM_PERMISSIONS_CHANGED',
              roomId,
              senderId: msg.senderId,
              senderName: msg.senderName,
              allowAnyoneControl: msg.allowAnyoneControl,
              timestamp: now
            });
            break;
          }

          case 'CHAT_MESSAGE': {
            const chatMsg = msg.message;
            room.chatMessages.push(chatMsg);
            if (room.chatMessages.length > 200) {
              room.chatMessages = room.chatMessages.slice(-200);
            }
            broadcastToRoom(
              roomId,
              {
                type: 'CHAT_MESSAGE',
                roomId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                message: chatMsg,
                timestamp: now
              },
              ws
            );
            break;
          }

          // WebRTC Signaling Forwarding
          case 'WEBRTC_JOIN':
          case 'WEBRTC_LEAVE':
          case 'MEDIA_STATE_CHANGED':
          case 'SCREEN_SHARE_STARTED':
          case 'SCREEN_SHARE_STOPPED':
            broadcastToRoom(roomId, { ...msg, timestamp: now }, ws);
            break;

          case 'WEBRTC_OFFER':
          case 'WEBRTC_ANSWER':
          case 'WEBRTC_ICE_CANDIDATE':
            if (msg.toUserId) {
              sendToUserInRoom(roomId, msg.toUserId, { ...msg, timestamp: now });
            }
            break;
        }
      } catch (err) {
        console.error('Error handling WebSocket message in server:', err);
      }
    });

    ws.on('close', () => {
      const session = socketSessions.get(ws);
      socketSessions.delete(ws);
      if (session) {
        const room = rooms.get(session.roomId);
        if (room) {
          room.users = room.users.filter((u) => u.userId !== session.userId);
          if (room.hostId === session.userId && room.users.length > 0) {
            room.hostId = room.users[0].userId;
            room.users[0].isHost = true;
            room.users[0].role = 'host';
          }
          broadcastToRoom(session.roomId, {
            type: 'USER_LEFT',
            roomId: session.roomId,
            userId: session.userId,
            timestamp: Date.now()
          });
        }
      }
    });
  });

  // 5. Mount Vite Middleware (Dev) or Static Handler (Prod)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`[ROOMY SERVER] Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
