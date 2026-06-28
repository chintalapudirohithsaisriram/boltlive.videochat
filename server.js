const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('./'));

const waitingUsers = new Map();
const bannedIPs = new Set();
const activeConnections = new Map();
const reportCounts = new Map();
const aiReports = new Map();

setInterval(() => {
  io.emit('online-count', io.engine.clientsCount);
}, 2000);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  const userIP = socket.handshake.address;
  
  io.emit('online-count', io.engine.clientsCount);
  
  if (bannedIPs.has(userIP)) {
    socket.emit('banned');
    socket.disconnect(true);
    return;
  }
  
  if (!reportCounts.has(userIP)) reportCounts.set(userIP, 0);
  if (!aiReports.has(userIP)) aiReports.set(userIP, 0);
  
  socket.on('find-partner', () => {
    waitingUsers.set(socket.id, { id: socket.id });
    for (const [id, user] of waitingUsers) {
      if (id !== socket.id) {
        const roomId = 'room_' + Date.now();
        socket.join(roomId);
        io.sockets.sockets.get(id).join(roomId);
        activeConnections.set(socket.id, { roomId, partnerId: id });
        activeConnections.set(id, { roomId, partnerId: socket.id });
        waitingUsers.delete(socket.id);
        waitingUsers.delete(id);
        io.to(roomId).emit('matched', { roomId: roomId });
        return;
      }
    }
    socket.emit('waiting');
  });

  socket.on('offer', (data) => socket.to(data.roomId).emit('offer', data));
  socket.on('answer', (data) => socket.to(data.roomId).emit('answer', data));
  socket.on('ice-candidate', (data) => socket.to(data.roomId).emit('ice-candidate', data));
  socket.on('send-message', (data) => socket.to(data.roomId).emit('receive-message', { message: data.message }));
  socket.on('send-reaction', (data) => socket.to(data.roomId).emit('receive-reaction', { reaction: data.reaction }));
  socket.on('game-request', (data) => socket.to(data.roomId).emit('game-request'));
  socket.on('game-accepted', (data) => socket.to(data.roomId).emit('game-accepted'));
  socket.on('game-declined', (data) => socket.to(data.roomId).emit('game-declined'));
  socket.on('send-game', (data) => socket.to(data.roomId).emit('receive-game', { question: data.question }));

  socket.on('report-user', (data) => {
    const connection = activeConnections.get(socket.id);
    if (!connection) return;
    const partnerId = connection.partnerId;
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      const partnerIP = partnerSocket.handshake.address;
      reportCounts.set(partnerIP, (reportCounts.get(partnerIP) || 0) + 1);
      const total = (reportCounts.get(partnerIP) || 0) + (aiReports.get(partnerIP) || 0);
      socket.emit('report-filed', { count: total });
      if (total >= 3) {
        bannedIPs.add(partnerIP);
        partnerSocket.emit('banned');
        setTimeout(() => partnerSocket.disconnect(true), 500);
        socket.emit('report-done');
        io.to(connection.roomId).emit('partner-disconnected');
      }
    }
  });

  socket.on('ai-report', (data) => {
    aiReports.set(userIP, (aiReports.get(userIP) || 0) + 1);
    const total = (reportCounts.get(userIP) || 0) + (aiReports.get(userIP) || 0);
    socket.emit('ai-warning', { count: aiReports.get(userIP), total: total });
    if (total >= 3) {
      bannedIPs.add(userIP);
      socket.emit('banned');
      setTimeout(() => socket.disconnect(true), 500);
      const connection = activeConnections.get(socket.id);
      if (connection) socket.to(connection.roomId).emit('partner-disconnected');
    }
  });

  socket.on('skip', () => {
    activeConnections.delete(socket.id);
    waitingUsers.delete(socket.id);
    socket.broadcast.emit('partner-disconnected');
  });

  socket.on('disconnect', () => {
    activeConnections.delete(socket.id);
    waitingUsers.delete(socket.id);
    socket.broadcast.emit('partner-disconnected');
    io.emit('online-count', io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log('BoltLive with AI running on http://localhost:' + PORT);
});