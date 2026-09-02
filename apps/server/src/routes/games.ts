import { randomInt } from "node:crypto";
import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import type { HostedGame } from "@quizarena/shared-types";
import { requireTeacher, teacherIdFrom } from "../auth.js";
import { GameStateManager } from "../games/GameStateManager.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config.js";

const quizIdSchema = z.object({ quizId: z.string().cuid() });
export const gamesRouter = Router();
gamesRouter.use(requireTeacher);

function nextPin(): string { return randomInt(100000, 1_000_000).toString(); }

gamesRouter.post("/quizzes/:quizId/games", async (request, response, next) => {
  try {
    const { quizId } = quizIdSchema.parse(request.params);
    const teacherId = teacherIdFrom(request);
    const quiz = await prisma.quiz.findFirst({ where: { id: quizId, teacherId }, select: { id: true, questions: { select: { id: true } } } });
    if (!quiz) { response.status(404).json({ error: "Quiz not found." }); return; }
    if (!quiz.questions.length) { response.status(400).json({ error: "A quiz needs at least one question before it can be hosted." }); return; }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const pin = nextPin();
      const exists = await prisma.game.findUnique({ where: { pin }, select: { id: true } });
      if (exists) continue;
      try {
        const game = await prisma.game.create({ data: { pin, quizId: quiz.id, status: "LOBBY" } });
        try {
          await GameStateManager.create({ gameId: game.id, pin, quizId: quiz.id, hostTeacherId: teacherId });
        } catch (error) {
          await prisma.game.delete({ where: { id: game.id } });
          throw error;
        }
        const joinUrl = new URL("/join", env.WEB_APP_URL);
        joinUrl.searchParams.set("pin", pin);
        const result: HostedGame = { id: game.id, pin, status: "LOBBY", qrCodeDataUrl: await QRCode.toDataURL(joinUrl.toString(), { errorCorrectionLevel: "M", margin: 1, width: 360 }) };
        response.status(201).json(result);
        return;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") continue;
        throw error;
      }
    }
    response.status(503).json({ error: "Could not generate a unique game PIN. Please try again." });
  } catch (error) { next(error); }
});
