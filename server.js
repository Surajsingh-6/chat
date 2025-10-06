// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// rooms: { roomId: { clients: Set(ws), history: [msg,...] } }
const rooms = new Map();

// helper
function sendJSON(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws, req) => {
  const { query } = url.parse(req.url, true);
  const room = (query.room || 'default').trim();
  const name = (query.name || 'Anonymous').trim().substring(0, 32);

  if (!rooms.has(room)) rooms.set(room, { clients: new Set(), history: [] });
  const roomObj = rooms.get(room);

  // simple limit: 2 clients per room
  if (roomObj.clients.size >= 2) {
    sendJSON(ws, { type: 'error', message: 'Room is full (2 participants max).' });
    ws.close();
    return;
  }

  ws.roomId = room;
  ws.name = name;
  roomObj.clients.add(ws);

  // send init: your join success + current participants count + history
  sendJSON(ws, { type: 'init', room, name, participants: roomObj.clients.size, history: roomObj.history });

  // notify others someone joined
  roomObj.clients.forEach((client) => {
    if (client !== ws) {
      sendJSON(client, { type: 'peer-joined', name, participants: roomObj.clients.size });
    }
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    // handle types: message, typing, ping
    if (msg.type === 'message' && typeof msg.text === 'string') {
      const out = {
        type: 'message',
        id: msg.id || (`m_${Date.now()}_${Math.floor(Math.random()*10000)}`),
        from: ws.name,
        text: msg.text.substring(0, 2000),
        ts: Date.now()
      };

      // add to history (keep last 100)
      roomObj.history.push(out);
      if (roomObj.history.length > 100) roomObj.history.shift();

      // forward to all other clients in room
      roomObj.clients.forEach((client) => {
        if (client !== ws) sendJSON(client, out);
      });

      // optionally echo back ack to sender
      sendJSON(ws, { type: 'message-ack', id: out.id, ts: out.ts });
    } else if (msg.type === 'typing') {
      // forward typing state to others
      roomObj.clients.forEach((client) => {
        if (client !== ws) sendJSON(client, { type: 'typing', from: ws.name, isTyping: !!msg.isTyping });
      });
    } else if (msg.type === 'ping') {
      sendJSON(ws, { type: 'pong', ts: Date.now() });
    }
  });

  ws.on('close', () => {
    const r = rooms.get(ws.roomId);
    if (!r) return;
    r.clients.delete(ws);
    // notify peers
    r.clients.forEach((client) => sendJSON(client, { type: 'peer-left', name: ws.name, participants: r.clients.size }));
    // cleanup empty rooms
    if (r.clients.size === 0) rooms.delete(ws.roomId);
  });

  ws.on('error', () => {
    // ignore for now
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
