import bcrypt from "bcrypt";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "./config.js";

const tokenPayloadSchema = z.object({ teacherId: z.string().cuid() });
const studentTokenPayloadSchema = z.object({ playerId: z.string().uuid(), gamePin: z.string().regex(/^\d{6}$/), scope: z.literal("student") });

export type AuthenticatedRequest = Request & { teacherId: string };

declare global {
  namespace Express {
    interface Request {
      teacherId?: string;
    }
  }
}

export function createTeacherToken(teacherId: string): string {
  return jwt.sign({ teacherId }, env.JWT_SECRET, { expiresIn: "7d" });
}

export function teacherIdFromToken(token: string): string {
  return tokenPayloadSchema.parse(jwt.verify(token, env.JWT_SECRET)).teacherId;
}

export function createStudentSessionToken(playerId: string, gamePin: string): string {
  return jwt.sign({ playerId, gamePin, scope: "student" }, env.JWT_SECRET, { expiresIn: "12h" });
}

export function studentSessionFromToken(token: string): z.infer<typeof studentTokenPayloadSchema> {
  return studentTokenPayloadSchema.parse(jwt.verify(token, env.JWT_SECRET));
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function requireTeacher(request: Request, response: Response, next: NextFunction): void {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ error: "Teacher authentication is required." });
    return;
  }

  try {
    request.teacherId = teacherIdFromToken(token);
    next();
  } catch {
    response.status(401).json({ error: "Your session is invalid or has expired." });
  }
}

export function teacherIdFrom(request: Request): string {
  if (!request.teacherId) throw new Error("Authenticated route called without a teacher.");
  return request.teacherId;
}
