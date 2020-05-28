'use strict';

const express = require('express');
const socketIO = require('socket.io');

const PORT = process.env.PORT || 3000;
const INDEX = '/index.html';

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const io = socketIO(server);

io.on('connection', socket => {
  let roomId = socket.handshake.query['room'] || socket.id;
  socket.on('disconnect', () => console.log(`Client from room ${roomId} disconnected`));

  socket.join(roomId, () => {
    console.log(socket.rooms);
    socket.emit('room', roomId);
  });

  socket.on('pause', () => {
    console.log('Received Pause from ', socket.id);
    socket.to(roomId).emit('pause', socket.id);
  });

  socket.on('play', () => {
    console.log('Received Play from ', socket.id);
    socket.to(roomId).emit('play', socket.id);
  });
});