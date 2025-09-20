// Lightweight WebSocket relay server for Scrabble game
// Run with: npm run ws-server

// ---------------- Existing raw WS relay (game state sync) ----------------
const WebSocket = require('ws');
const url = require('url');

const wss = new WebSocket.Server({ port: 8080 });

/**
 * Room structure (raw WS):
 * rooms[roomId] = {
 *   clients: Map<ws, { id: number, name: string }>,
 *   host: ws | null
 * }
 */
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Map(), host: null });
  }
  return rooms.get(roomId);
}

function broadcast(room, data, except = null) {
  const payload = JSON.stringify(data);
  for (const ws of room.clients.keys()) {
    if (ws.readyState === WebSocket.OPEN && ws !== except) {
      ws.send(payload);
    }
  }
}

wss.on('connection', (ws, req) => {
  const { query } = url.parse(req.url, true);
  const roomId = (query.room || 'default').toString();
  const name = (query.name || 'Player').toString();
  const prefIdRaw = query.prefId != null ? Number(query.prefId) : NaN;
  const requestedId = !Number.isNaN(prefIdRaw) ? Math.floor(prefIdRaw) : null;

  const room = getOrCreateRoom(roomId);

  // Assign player id: honor requestedId (1 or 2) if available; otherwise next free (3+ are spectators)
  let assignedId = 1;
  const used = new Set([...room.clients.values()].map(v => v.id));
  if (requestedId && (requestedId === 1 || requestedId === 2) && !used.has(requestedId)) {
    assignedId = requestedId;
  } else {
    assignedId = 1;
    while (used.has(assignedId)) assignedId++;
  }

  if (room.clients.size === 0) {
    room.host = ws;
  }

  room.clients.set(ws, { id: assignedId, name });

  // Welcome message
  ws.send(JSON.stringify({ type: 'welcome', playerId: assignedId, isHost: room.host === ws }));

  // Broadcast current roster to all clients in the room
  try {
    const roster = [...room.clients.values()].map(v => ({ id: v.id, name: v.name }));
    broadcast(room, { type: 'roster', players: roster });
  } catch {}

  // If a non-host joined and a host exists, ask host for full state for this newcomer
  if (room.host && room.host !== ws && room.host.readyState === WebSocket.OPEN) {
    const newcomerId = assignedId;
    room.host.send(JSON.stringify({ type: 'request_state', targetPlayerId: newcomerId }));
  }

  ws.on('message', (message) => {
    let data;
    try { data = JSON.parse(message); } catch { return; }

    // Relay full state from host to a specific target (newcomer)
    if (data.type === 'full_state') {
      const target = [...room.clients.entries()].find(([, v]) => v.id === data.targetPlayerId);
      if (target && target[0].readyState === WebSocket.OPEN) {
        target[0].send(JSON.stringify({ type: 'full_state', payload: data.payload }));
      }
      return;
    }

    // Broadcast a full state update from host to all clients
    if (data.type === 'full_state_broadcast') {
      broadcast(room, { type: 'full_state', payload: data.payload });
      return;
    }

    // Broadcast actions to all (including sender to keep one apply path)
    if (data.type === 'action') {
      const meta = room.clients.get(ws);
      const senderId = meta ? meta.id : null;
      broadcast(room, { type: 'action', action: data.action, senderId });
      return;
    }
  });

  ws.on('close', () => {
    const meta = room.clients.get(ws);
    room.clients.delete(ws);
    if (room.host === ws) {
      // Pick a new host if any remain
      const first = room.clients.keys().next();
      room.host = first.done ? null : first.value;
      if (room.host && room.host.readyState === WebSocket.OPEN) {
        room.host.send(JSON.stringify({ type: 'you_are_host_now' }));
      }
    }
    // Broadcast updated roster to remaining clients
    try {
      const roster = [...room.clients.values()].map(v => ({ id: v.id, name: v.name }));
      broadcast(room, { type: 'roster', players: roster });
    } catch {}
    if (room.clients.size === 0) {
      rooms.delete(roomId);
    }
  });
});

console.log('[WS] Server running on ws://localhost:8080');

// ---------------- New Express API + JWT + MongoDB + Socket.IO matchmaking ----------------
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const http = require('http');

const APP_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
// Prefer explicit MONGO_URI, otherwise default to local MongoDB. The old atlas placeholder often caused confusion.
// Default to the provided Atlas cluster if MONGO_URI is not set. Replace %3Cdb_password%3E with the real password.
const DEFAULT_ATLAS_MONGO = 'mongodb+srv://wkdasunt0001_db_user:DOO7zWoDaqPBmKK4@cluster0.jaaswzv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGO_URI = process.env.MONGO_URI || DEFAULT_ATLAS_MONGO;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const app = express();
app.use(cors({ origin: '*'}));
app.use(express.json());

// Mongo connection (non-blocking). If connection string looks like a placeholder or Mongo isn't running,
// we will still start the API so the UI can show a helpful message.
const looksLikePlaceholder = /<username>|<password>/.test(MONGO_URI);
if (looksLikePlaceholder) {
  console.warn('[API] MONGO_URI looks like a placeholder. Set MONGO_URI env var or start a local MongoDB at', DEFAULT_LOCAL_MONGO);
}
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('[API] MongoDB Connected:', MONGO_URI))
  .catch(err => console.error('[API] MongoDB connection error:', err.message));

// User schema/model
const { Schema, model } = mongoose;
const userSchema = new Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  email: { type: String },
  createdAt: { type: Date, default: Date.now }
});
const User = model('User', userSchema);

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'username already exists' });
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hash, email });
    await user.save();
    const token = jwt.sign({ sub: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error('[API] register error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    const token = jwt.sign({ sub: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error('[API] login error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// HTTP server for Express + Socket.IO
const httpServer = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(httpServer, { cors: { origin: '*' } });

// Track active logged-in users by username to prevent multi-login across browsers
const activeUsers = new Map(); // Map<username, socketId>

let waitingPlayer = null;

io.on('connection', (socket) => {
  console.log('[IO] Client connected:', socket.id);

  socket.on('findGame', (payload) => {
    const username = payload && typeof payload.username === 'string' ? payload.username.trim() : '';
    if (!username) {
      socket.emit('auth:denied', { reason: 'missing_username', message: 'Username is required to play online.' });
      return;
    }

    // Prevent concurrent logins for same username
    const existingId = activeUsers.get(username);
    if (existingId && existingId !== socket.id) {
      const existingSocket = io.sockets.sockets.get(existingId);
      if (existingSocket && existingSocket.connected) {
        socket.emit('auth:denied', { reason: 'already_logged_in', message: 'This account is already logged in from another browser.' });
        return;
      } else {
        // Stale entry; remove it
        activeUsers.delete(username);
      }
    }

    // Record this user as active
    activeUsers.set(username, socket.id);
    socket.data.username = username;

    if (waitingPlayer) {
      // If the waiting player is the same user (edge case), keep waiting
      if (waitingPlayer.data && waitingPlayer.data.username === username) {
        socket.emit('waiting', 'Waiting for another player...');
        return;
      }
      const room = `room-${socket.id}-${waitingPlayer.id}`;
      const p1Name = waitingPlayer.data?.username || 'Player 1';
      const p2Name = socket.data?.username || 'Player 2';
      socket.join(room);
      waitingPlayer.join(room);
      // Include ordered players so clients can request preferred WS IDs
      io.to(room).emit('game:start', { roomId: room, player1: p1Name, player2: p2Name });
      waitingPlayer = null;
    } else {
      waitingPlayer = socket;
      socket.emit('waiting', 'Waiting for another player...');
    }
  });

  socket.on('disconnect', () => {
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }
    const uname = socket.data && socket.data.username;
    if (uname && activeUsers.get(uname) === socket.id) {
      activeUsers.delete(uname);
    }
  });
});

httpServer.listen(APP_PORT, () => {
  console.log(`[API] Express + Socket.IO running on http://localhost:${APP_PORT}`);
});
