'use strict';

const express = require('express');
const socketIO = require('socket.io');

const PORT = process.env.PORT || 3000;
const INDEX = '/index.html';

const RoomStates = {
  PLAYING: 'playing',
  PAUSED: 'paused',
};

const setRoomState = (roomId, state) => {
  const room = io.sockets.adapter.rooms[roomId];
  room.state = state;
}

const getRoomState = (roomId) => {
  const room = io.sockets.adapter.rooms[roomId];
  return room.state;
}

const recalcRoomTime = (roomId, videoProgress) => {
  const room = io.sockets.adapter.rooms[roomId];
  if (!room.time) room.time = {};
  room.time.date = new Date();
  room.time.progress = videoProgress;
}

const getVideoProgress = (roomId) => {
  const room = io.sockets.adapter.rooms[roomId];
  if (!room.time) return null;

  const additionalProgress = 
    room.state === RoomStates.PLAYING && ((new Date()) - room.time.date) / 1000;
  return room.time.progress + additionalProgress;
}

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const io = socketIO(server);

io.on('connection', socket => {
  const roomId = socket.handshake.query['room'] || socket.id;
  let videoProgress = parseInt(socket.handshake.query['videoProgress']);

  console.log('Received connection try', { roomId, videoProgress });

  socket.on('disconnect', () => console.log(`Client from room ${roomId} disconnected`));

  socket.join(roomId, () => {
    if (getVideoProgress(roomId) === null) {
      recalcRoomTime(roomId, videoProgress);
    }

    setRoomState(roomId, RoomStates.PAUSED);
    videoProgress = getVideoProgress(roomId);
    const roomState = getRoomState(roomId);

    socket.emit('join', roomId, roomState, videoProgress);
    socket.to(roomId).emit('update', socket.id, roomState, videoProgress);
  });

  socket.on('update', (videoState, videoProgress) => {
    console.log('Received Update from ', socket.id, { videoState, videoProgress });
    setRoomState(roomId, videoState);
    recalcRoomTime(roomId, videoProgress);

    const roomState = getRoomState(roomId);
    videoProgress = getVideoProgress(roomId);
    socket.to(roomId).emit('update', socket.id, roomState, videoProgress);
  });
});