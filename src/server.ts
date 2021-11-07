import express from "express";
import path from "path";
import { Server as SocketServer } from "socket.io";

const PORT = process.env.PORT || 3000;
const INDEX = "./index.html";

enum VideoState {
  PLAYING = "playing",
  PAUSED = "paused",
}

interface Room extends Set<string> {
  state: VideoState;
  time?: {
    date: Date;
    progress: number;
  };
}

const getRoom = (roomId: string) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (room) {
    return room as Room;
  } else {
    return null;
  }
}

const getUserCount = (roomId: string) => {
  const room = getRoom(roomId);
  console.log(`Room (${roomId}): `, room);
  return room?.size ?? 0;
}

const setRoomVideoState = (roomId: string, state: VideoState) => {
  const room = getRoom(roomId);
  if (room) {
    room.state = state;
  }
}

const getRoomVideoState = (roomId: string) => {
  const room = getRoom(roomId);
  return room?.state;
}

const recalcRoomTime = (roomId: string, videoProgress: number) => {
  const room = getRoom(roomId);
  if (!room) return;

  if (!room?.time) {
    room.time = {
      date: new Date(),
      progress: videoProgress
    };
  } else {
    room.time.date = new Date();
    room.time.progress = videoProgress;
  }
}

const getVideoProgress = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room?.time) return null;

  const additionalProgress = 
    room.state === VideoState.PLAYING ? ((new Date().getTime()) - room.time.date.getTime()) / 1000 : 0;
  
  return room.time.progress + additionalProgress;
}

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: path.resolve("./static") }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const io = new SocketServer(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", socket => {
  const roomId = first(socket.handshake.query["room"]) || socket.id;
  let videoProgress = parseInt(first(socket.handshake.query["videoProgress"]) || "");

  console.log("Received connection try", { roomId, videoProgress });

  socket.on("disconnect", (d) => console.log(`Client from room ${roomId} disconnected. Current room state: `, getRoom(roomId)));

  socket.join(roomId);
  if (getVideoProgress(roomId) === null) {
    recalcRoomTime(roomId, videoProgress);
  }

  const userCount = getUserCount(roomId);
  videoProgress = getVideoProgress(roomId) || 0;
  setRoomVideoState(roomId, VideoState.PAUSED);
  const roomVideoState = getRoomVideoState(roomId);

  socket.emit("join", roomId, roomVideoState, videoProgress, userCount);
  socket.to(roomId).emit("update", socket.id, roomVideoState, videoProgress, userCount);

  socket.on("update", (videoState, videoProgress) => {
    console.log("Received Update from ", socket.id, { videoState, videoProgress });
    const userCount = getUserCount(roomId);
    setRoomVideoState(roomId, videoState);
    recalcRoomTime(roomId, videoProgress);

    const roomState = getRoomVideoState(roomId);
    videoProgress = getVideoProgress(roomId);
    socket.to(roomId).emit("update", socket.id, roomState, videoProgress, userCount);
  });
});

function first<T>(value: T | T[]) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  } else {
    return value;
  }
}