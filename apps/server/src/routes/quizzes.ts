import { Router } from "express";
import { z } from "zod";
import { requireTeacher, teacherIdFrom } from "../auth.js";
import { prisma } from "../lib/prisma.js";

const optionSchema = z.object({ text: z.string().trim().min(1).max(200), isCorrect: z.boolean() });
const questionSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  imageUrl: z.string().url().max(2048).optional().nullable().or(z.literal("")),
  options: z.array(optionSchema).min(2).max(4).refine((options) => options.filter((option) => option.isCorrect).length === 1, "Choose exactly one correct answer."),
  timeLimitSec: z.number().int().min(5).max(300),
  points: z.number().int().min(0).max(10000),
});
const quizSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  isPublic: z.boolean().default(false),
  questions: z.array(questionSchema).min(1).max(100),
});
const quizIdSchema = z.object({ quizId: z.string().cuid() });

function questionsForCreate(questions: z.infer<typeof questionSchema>[]) {
  return questions.map((question, orderIndex) => ({
    ...question,
    imageUrl: question.imageUrl || null,
    orderIndex,
  }));
}

export const quizzesRouter = Router();
quizzesRouter.use(requireTeacher);

quizzesRouter.get("/", async (request, response, next) => {
  try {
    const teacherId = teacherIdFrom(request);
    const quizzes = await prisma.quiz.findMany({
      where: { teacherId },
      include: { questions: { orderBy: { orderIndex: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
    response.json(quizzes);
  } catch (error) { next(error); }
});

quizzesRouter.get("/:quizId", async (request, response, next) => {
  try {
    const { quizId } = quizIdSchema.parse(request.params);
    const teacherId = teacherIdFrom(request);
    const quiz = await prisma.quiz.findFirst({ where: { id: quizId, teacherId }, include: { questions: { orderBy: { orderIndex: "asc" } } } });
    if (!quiz) { response.status(404).json({ error: "Quiz not found." }); return; }
    response.json(quiz);
  } catch (error) { next(error); }
});

quizzesRouter.post("/", async (request, response, next) => {
  try {
    const input = quizSchema.parse(request.body);
    const teacherId = teacherIdFrom(request);
    const quiz = await prisma.quiz.create({ data: { ...input, description: input.description || null, teacherId, questions: { create: questionsForCreate(input.questions) } }, include: { questions: { orderBy: { orderIndex: "asc" } } } });
    response.status(201).json(quiz);
  } catch (error) { next(error); }
});

quizzesRouter.put("/:quizId", async (request, response, next) => {
  try {
    const { quizId } = quizIdSchema.parse(request.params);
    const input = quizSchema.parse(request.body);
    const teacherId = teacherIdFrom(request);
    const quiz = await prisma.quiz.findFirst({ where: { id: quizId, teacherId }, select: { id: true } });
    if (!quiz) { response.status(404).json({ error: "Quiz not found." }); return; }
    const updated = await prisma.quiz.update({
      where: { id: quiz.id }, data: { ...input, description: input.description || null, questions: { deleteMany: {}, create: questionsForCreate(input.questions) } },
      include: { questions: { orderBy: { orderIndex: "asc" } } },
    });
    response.json(updated);
  } catch (error) { next(error); }
});

quizzesRouter.delete("/:quizId", async (request, response, next) => {
  try {
    const { quizId } = quizIdSchema.parse(request.params);
    const teacherId = teacherIdFrom(request);
    const result = await prisma.quiz.deleteMany({ where: { id: quizId, teacherId } });
    if (!result.count) { response.status(404).json({ error: "Quiz not found." }); return; }
    response.status(204).end();
  } catch (error) { next(error); }
});
