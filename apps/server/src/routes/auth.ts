import { Router } from "express";
import { z } from "zod";
import { createTeacherToken, hashPassword, verifyPassword } from "../auth.js";
import { prisma } from "../lib/prisma.js";

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
});

const loginSchema = signupSchema.pick({ email: true, password: true });
export const authRouter = Router();

authRouter.post("/signup", async (request, response, next) => {
  try {
    const input = signupSchema.parse(request.body);
    const existing = await prisma.teacher.findUnique({ where: { email: input.email } });
    if (existing) {
      response.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    const teacher = await prisma.teacher.create({
      data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password) },
    });
    response.status(201).json({
      token: createTeacherToken(teacher.id),
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const teacher = await prisma.teacher.findUnique({ where: { email: input.email } });
    if (!teacher || !(await verifyPassword(input.password, teacher.passwordHash))) {
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    response.json({
      token: createTeacherToken(teacher.id),
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
    });
  } catch (error) {
    next(error);
  }
});
