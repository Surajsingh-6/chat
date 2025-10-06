// client.js
(() => {
  const connectBtn = document.getElementById('connectBtn');
  const roomInput = document.getElementById('room');
  const nameInput = document.getElementById('name');
  const meta = document.getElementById('meta');
  const messages = document.getElementById('messages');
  const composer = document.getElementById('composer');
  const messageInput = document.getElementById('messageInput');
  const typingEl = document.getElementById('typing');

  let ws = null;
  let isTyping = false;
  let typingTimer = null;

  function addMsgBubble({ from, text, ts, me=false }) {
    const li = document.createElement('li');
    li.className = 'msg ' + (me ? 'me' : 'other');
    const header = document.createElement('div');
    header.className = 'meta';
    header.textContent = `${from} • ${new Date(ts).toLocaleTimeString()}`;
    const body = document.createElement('div');
    body.textContent = text;
    li.appendChild(header);
    li.appendChild(body);
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
  }

  function status(text) {
    meta.textContent = text;
  }

  function connect() {
    if (ws) {
      ws.close();
      ws = null;
    }
    const room = roomInput.value.trim() || 'room1';
    const name = nameInput.value.trim() || 'You';
    const url = `${location.origin.replace(/^http/, 'ws')}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`;
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      status(`Connecting to ${room}...`);
      connectBtn.textContent = 'Disconnect';
    });

    ws.addEventListener('message', (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }

      if (data.type === 'init') {
        status(`Room: ${data.room} • you: ${data.name} • participants: ${data.participants}`);
        // load history
        if (Array.isArray(data.history)) {
          data.history.forEach(m => addMsgBubble({ from: m.from, text: m.text, ts: m.ts, me: m.from === data.name }));
        }
      } else if (data.type === 'message') {
        addMsgBubble({ from: data.from, text: data.text, ts: data.ts, me: false });
      } else if (data.type === 'message-ack') {
        // optional: mark delivered (here we simply update meta)
        // no UI change per message for minimalism
      } else if (data.type === 'peer-joined') {
        status(`Peer joined • participants: ${data.participants}`);
      } else if (data.type === 'peer-left') {
        status(`Peer left • participants: ${data.participants}`);
      } else if (data.type === 'typing') {
        typingEl.textContent = data.isTyping ? `${data.from} is typing…` : '';
      } else if (data.type === 'error') {
        alert(data.message || 'Error from server');
        ws.close();
      }
    });

    ws.addEventListener('close', () => {
      status('Disconnected');
      connectBtn.textContent = 'Connect';
      typingEl.textContent = '';
      ws = null;
    });

    ws.addEventListener('error', () => {
      status('Connection error');
    });
  }

  connectBtn.addEventListener('click', (e) => {
    if (ws) {
      ws.close();
      ws = null;
      connectBtn.textContent = 'Connect';
      status('Disconnected');
      return;
    }
    connect();
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    const id = `c_${Date.now()}_${Math.floor(Math.random()*10000)}`;
    const msg = { type: 'message', id, text };
    ws.send(JSON.stringify(msg));
    // immediate local echo
    addMsgBubble({ from: nameInput.value || 'You', text, ts: Date.now(), me: true });
    messageInput.value = '';
    sendTypingState(false);
  });

  // typing indicator logic
  messageInput.addEventListener('input', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!isTyping) {
      isTyping = true;
      ws.send(JSON.stringify({ type: 'typing', isTyping: true }));
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTyping = false;
      sendTypingState(false);
    }, 900);
  });

  function sendTypingState(state) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'typing', isTyping: !!state }));
    isTyping = !!state;
  }

  // quick connect on Enter in name input
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connect();
  });

  // connect automatically on load (optional). comment out if you prefer manual connect.
  // connect();
})();
