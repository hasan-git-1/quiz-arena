import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@quizarena/shared-types";
import { env } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { authRouter } from "./routes/auth.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { gamesRouter } from "./routes/games.js";
import { registerGameLobbyHandlers } from "./sockets/gameLobby.js";

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: { origin: env.WEB_APP_URL },
});

app.use(cors({ origin: env.WEB_APP_URL }));
app.use(express.json());

app.get("/api/health", async (_request, response) => {
  const [database, cache] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => "ok").catch(() => "unavailable"),
    redis.ping().then(() => "ok").catch(() => "unavailable"),
  ]);
  response.status(database === "ok" && cache === "ok" ? 200 : 503).json({ status: "ok", database, redis: cache });
});

app.use("/api/auth", authRouter);
app.use("/api/quizzes", quizzesRouter);
app.use("/api", gamesRouter);

io.on("connection", (socket) => socket.emit("server:ready", { message: "QuizArena realtime server connected" }));
registerGameLobbyHandlers(io);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request.", details: error.issues });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "An unexpected server error occurred." });
});

httpServer.listen(env.PORT, () => {
  console.log(`QuizArena server listening on http://localhost:${env.PORT}`);
});
