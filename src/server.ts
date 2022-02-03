import { Server as SocketServer, Socket } from "socket.io";
import express from "express";
import { createServer } from "http";

enum VideoState {
  PLAYING = "playing",
  PAUSED = "paused",
}

interface Room {
  state: VideoState;
  progress: {
    value: number;
    lastUpdate: Date;
  };
  users: Set<string>;
}

interface ServerToClientEvents {
  update: (
    senderId: string,
    state: VideoState,
    progress: number,
    userCount: number
  ) => void;
  join: (
    roomId: string,
    state: VideoState,
    progress: number,
    userCount: number
  ) => void;
}

interface ClientToServerEvents {
  update: (state: VideoState, progress: number) => void;
}

const PORT: number = parseInt(process.env.PORT || "3000");
const rooms: { [key: string]: Room } = {};

const joinRoom = (roomId: string, socket: Socket, initialProgress: number) => {
  if (rooms[roomId] === undefined) {
    rooms[roomId] = {
      state: VideoState.PAUSED,
      progress: { value: initialProgress, lastUpdate: new Date() },
      users: new Set(),
    };
  }
  socket.join(roomId);
  rooms[roomId].state = VideoState.PAUSED;
  rooms[roomId].users.add(socket.id);
};

const leaveRoom = (roomId: string, socket: Socket) => {
  // It will automatically leave the room for socketIO
  rooms[roomId].users.delete(socket.id);
  if (rooms[roomId].users.size === 0) {
    delete rooms[roomId];
  }
};

const getUserCount = (roomId: string) => {
  return rooms[roomId].users.size;
};

const updateVideoState = (roomId: string, state: VideoState) => {
  rooms[roomId].state = state;
};

const getVideoState = (roomId: string) => {
  return rooms[roomId].state;
};

const updateRoomProgress = (roomId: string, progress: number) => {
  rooms[roomId].progress.lastUpdate = new Date();
  rooms[roomId].progress.value = progress;
};

const getVideoProgress = (roomId: string) => {
  const additionalProgress =
    rooms[roomId].state === VideoState.PLAYING
      ? (new Date().getTime() - rooms[roomId].progress.lastUpdate.getTime()) /
        1000
      : 0;

  return rooms[roomId].progress.value + additionalProgress;
};

const app = express();
const httpServer = createServer(app);
const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(
  httpServer,
  {
    cors: {
      origin: true,
      credentials: true,
    },
  }
);

io.on("connection", (socket) => {
  const roomId = first(socket.handshake.query["room"]) || genId();
  const initialProgress = parseInt(
    first(socket.handshake.query["videoProgress"]) || "0"
  );

  console.log("Received connection try", { roomId, initialProgress });

  socket.on("disconnect", () => {
    console.log(
      `Client from room ${roomId} disconnected. Current room state: `,
      rooms[roomId]
    );
    leaveRoom(roomId, socket);
  });

  socket.on("update", (videoState, videoProgress) => {
    console.log(`Received Update from ${socket.id} to ${roomId}`, {
      videoState,
      videoProgress,
    });
    updateVideoState(roomId, videoState);
    updateRoomProgress(roomId, videoProgress);

    socket
      .to(roomId)
      .emit(
        "update",
        socket.id,
        getVideoState(roomId),
        getVideoProgress(roomId),
        getUserCount(roomId)
      );
  });

  joinRoom(roomId, socket, initialProgress);

  const userCount = getUserCount(roomId);
  const progress = getVideoProgress(roomId);
  const videoState = getVideoState(roomId);

  socket.emit("join", roomId, videoState, progress, userCount);
  socket.to(roomId).emit("update", socket.id, videoState, progress, userCount);
});

function first<T>(value: T | T[]) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return value;
}

function genId() {
  const length = 20;
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  const id = Array.from(Array(length))
    .map((_) => characters[Math.floor(Math.random() * characters.length)])
    .join("");
  return id;
}

httpServer.listen(PORT);
