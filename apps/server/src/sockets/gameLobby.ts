import type { Server } from "socket.io";
import { z } from "zod";
import type {
  ClientToServerEvents,
  GameActionResult,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  SubmitAnswerResult,
} from "@quizarena/shared-types";
import { createStudentSessionToken, studentSessionFromToken, teacherIdFromToken } from "../auth.js";
import { GameStateManager, type GameEvent } from "../games/GameStateManager.js";

type QuizArenaIo = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
const pinSchema = z.string().regex(/^\d{6}$/);
const watchSchema = z.object({ pin: pinSchema, token: z.string().min(1) });
const joinSchema = z.object({ pin: pinSchema, nickname: z.string().trim().min(2).max(30) });
const hostActionSchema = z.object({ pin: pinSchema, token: z.string().min(1) });
const submitAnswerSchema = z.object({ pin: pinSchema, sessionToken: z.string().min(1), selectedOption: z.number().int().min(0).max(3) });
const gameRoom = (pin: string) => `game:${pin}`;
const teacherRoom = (pin: string) => `game:${pin}:teachers`;
const studentRoom = (pin: string) => `game:${pin}:students`;
const playerRoom = (pin: string, playerId: string) => `game:${pin}:player:${playerId}`;

async function managerForTeacher(pin: string, token: string): Promise<GameStateManager> {
  const teacherId = teacherIdFromToken(token);
  const manager = await GameStateManager.forPin(pin);
  if (!manager) throw new Error("This hosted game was not found.");
  const state = await manager.getState();
  if (state.hostTeacherId !== teacherId) throw new Error("You are not allowed to control this game.");
  return manager;
}

async function broadcastGameEvent(io: QuizArenaIo, event: GameEvent): Promise<void> {
  const manager = await GameStateManager.forPin(event.pin);
  if (!manager) return;
  const teacherState = await manager.getTeacherView();
  io.to(teacherRoom(event.pin)).emit("game:teacher-state", teacherState);

  if (event.kind === "answer-submitted") return;

  if (event.kind === "countdown" && event.countdown) {
    io.to(studentRoom(event.pin)).emit("game:countdown", event.countdown);
    return;
  }

  const studentState = await manager.getStudentView();
  io.to(studentRoom(event.pin)).emit("game:student-state", studentState);

  if (event.kind === "answer-reveal") {
    const publicState = await manager.getState();
    await Promise.all(publicState.players.map(async (player) => {
      io.to(playerRoom(event.pin, player.id)).emit("game:answer-feedback", await manager.feedbackForPlayer(player.id));
    }));
  }
}

export function registerGameLobbyHandlers(io: QuizArenaIo): void {
  GameStateManager.setEventHandler((event) => broadcastGameEvent(io, event));

  io.on("connection", (socket) => {
    socket.on("game:watch-lobby", async (payload, acknowledgement) => {
      try {
        const input = watchSchema.parse(payload);
        const manager = await managerForTeacher(input.pin, input.token);
        const teacherId = teacherIdFromToken(input.token);
        socket.data.teacherId = teacherId;
        socket.data.gamePin = input.pin;
        await socket.join([gameRoom(input.pin), teacherRoom(input.pin)]);
        acknowledgement({ ok: true, state: await manager.getState() });
        socket.emit("game:teacher-state", await manager.getTeacherView());
      } catch (error) {
        acknowledgement({ ok: false, error: error instanceof Error ? error.message : "You are not allowed to watch this lobby." });
      }
    });

    socket.on("game:join-lobby", async (payload, acknowledgement) => {
      try {
        const input = joinSchema.parse(payload);
        const manager = await GameStateManager.forPin(input.pin);
        if (!manager) { acknowledgement({ ok: false, error: "That game PIN was not found or has expired." }); return; }
        const { player, state } = await manager.addPlayer(input.nickname);
        socket.data.playerId = player.id;
        socket.data.gamePin = input.pin;
        await socket.join([gameRoom(input.pin), studentRoom(input.pin), playerRoom(input.pin, player.id)]);
        io.to(gameRoom(input.pin)).emit("game:lobby-updated", state);
        acknowledgement({ ok: true, player, sessionToken: createStudentSessionToken(player.id, input.pin), state });
      } catch (error) {
        acknowledgement({ ok: false, error: error instanceof Error ? error.message : "Could not join the lobby." });
      }
    });

    socket.on("game:start", async (payload, acknowledgement) => {
      try {
        const input = hostActionSchema.parse(payload);
        const manager = await managerForTeacher(input.pin, input.token);
        await socket.join([gameRoom(input.pin), teacherRoom(input.pin)]);
        const result: GameActionResult = { ok: true, state: await manager.startGame() };
        acknowledgement(result);
      } catch (error) {
        acknowledgement({ ok: false, error: error instanceof Error ? error.message : "Could not start the game." });
      }
    });

    socket.on("game:next", async (payload, acknowledgement) => {
      try {
        const input = hostActionSchema.parse(payload);
        const manager = await managerForTeacher(input.pin, input.token);
        await socket.join([gameRoom(input.pin), teacherRoom(input.pin)]);
        const result: GameActionResult = { ok: true, state: await manager.next() };
        acknowledgement(result);
      } catch (error) {
        acknowledgement({ ok: false, error: error instanceof Error ? error.message : "Could not advance the game." });
      }
    });

    socket.on("game:submit-answer", async (payload, acknowledgement) => {
      try {
        const input = submitAnswerSchema.parse(payload);
        const session = studentSessionFromToken(input.sessionToken);
        if (session.gamePin !== input.pin) throw new Error("This student session is for a different game.");
        const manager = await GameStateManager.forPin(input.pin);
        if (!manager) throw new Error("This game is no longer available.");
        socket.data.playerId = session.playerId;
        socket.data.gamePin = input.pin;
        await socket.join([gameRoom(input.pin), studentRoom(input.pin), playerRoom(input.pin, session.playerId)]);
        await manager.submitAnswer(session.playerId, input.selectedOption);
        const result: SubmitAnswerResult = { ok: true, accepted: { questionIndex: (await manager.getState()).currentQuestionIndex ?? 0 } };
        acknowledgement(result);
        io.to(playerRoom(input.pin, session.playerId)).emit("game:answer-accepted", result.accepted);
      } catch (error) {
        acknowledgement({ ok: false, error: error instanceof Error ? error.message : "Could not submit your answer." });
      }
    });
  });
}
