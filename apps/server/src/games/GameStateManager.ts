import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AnswerFeedback,
  LeaderboardEntry,
  LiveGameState,
  LobbyPlayer,
  StudentGameView,
  TeacherGameView,
} from "@quizarena/shared-types";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

const LIVE_GAME_TTL_SECONDS = 60 * 60 * 12;
const QUESTION_SHOW_DURATION_MS = 1_500;

const optionSchema = z.object({ text: z.string(), isCorrect: z.boolean() });
const questionSchema = z.object({
  id: z.string().cuid(),
  text: z.string().min(1),
  imageUrl: z.string().nullable(),
  options: z.array(optionSchema).min(2).max(4).refine((options) => options.filter((option) => option.isCorrect).length === 1),
  timeLimitSec: z.number().int().min(5).max(300),
  points: z.number().int().min(0).max(10_000),
  orderIndex: z.number().int().nonnegative(),
});
const playerSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string().min(1).max(30),
  nicknameKey: z.string().optional(),
  totalScore: z.number().int().nonnegative().default(0),
  streak: z.number().int().nonnegative().default(0),
});
const answerSchema = z.object({
  selectedOption: z.number().int().nonnegative(),
  isCorrect: z.boolean(),
  timeTakenMs: z.number().int().nonnegative(),
  pointsAwarded: z.number().int().nonnegative(),
  answeredAtMs: z.number().int().positive(),
});
const gameStatusSchema = z.enum(["LOBBY", "QUESTION_SHOW", "ANSWER_COLLECT", "ANSWER_REVEAL", "LEADERBOARD", "FINAL_PODIUM", "ENDED"]);
const storedStateSchema = z.object({
  gameId: z.string().cuid(),
  pin: z.string().regex(/^\d{6}$/),
  quizId: z.string().cuid(),
  hostTeacherId: z.string().cuid(),
  status: gameStatusSchema,
  players: z.array(playerSchema),
  currentQuestionIndex: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  questions: z.preprocess((value) => Array.isArray(value) ? value : [], z.array(questionSchema)).default([]),
  answers: z.preprocess((value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {}, z.record(answerSchema)).default({}),
  collectionStartsAtMs: z.number().int().positive().nullable().default(null),
  questionStartAtMs: z.number().int().positive().nullable().default(null),
  deadlineAtMs: z.number().int().positive().nullable().default(null),
});

type StoredGameState = z.infer<typeof storedStateSchema>;
type GameEventKind = "state" | "answer-submitted" | "answer-reveal" | "ended";
export type GameEvent = { kind: GameEventKind; pin: string; state: StoredGameState };
type GameEventHandler = (event: GameEvent) => Promise<void> | void;

const submitAnswerScript = `
local raw = redis.call("GET", KEYS[1])
if not raw then return {0, "Live game state was not found."} end
local state = cjson.decode(raw)
if state.status ~= "ANSWER_COLLECT" then return {0, "Answers are not being collected right now."} end
local now = tonumber(ARGV[2])
if now > tonumber(state.deadlineAtMs) then return {0, "Time is up for this question."} end
local player = nil
for _, candidate in ipairs(state.players) do
  if candidate.id == ARGV[1] then player = candidate break end
end
if not player then return {0, "This player is not part of the game."} end
state.answers = state.answers or {}
if state.answers[ARGV[1]] then return {0, "You have already answered this question."} end
local question = state.questions[state.currentQuestionIndex + 1]
local selectedOption = tonumber(ARGV[3])
if not question or selectedOption < 0 or selectedOption >= #question.options then return {0, "That answer option is not valid."} end
local selected = question.options[selectedOption + 1]
local timeTakenMs = math.max(0, now - tonumber(state.questionStartAtMs))
local isCorrect = selected.isCorrect
local pointsAwarded = 0
if isCorrect then
  local timeLimitMs = question.timeLimitSec * 1000
  local timeAdjustedPoints = question.points * (1 - (timeTakenMs / timeLimitMs) * 0.5)
  if timeAdjustedPoints < 0 then timeAdjustedPoints = 0 end
  player.streak = (player.streak or 0) + 1
  local streakMultiplier = math.min(player.streak * 0.1, 0.5)
  pointsAwarded = math.floor(timeAdjustedPoints * (1 + streakMultiplier) + 0.5)
  player.totalScore = (player.totalScore or 0) + pointsAwarded
else
  player.streak = 0
end
state.answers[ARGV[1]] = { selectedOption = selectedOption, isCorrect = isCorrect, timeTakenMs = timeTakenMs, pointsAwarded = pointsAwarded, answeredAtMs = now }
local nextState = cjson.encode(state)
redis.call("SET", KEYS[1], nextState, "EX", ARGV[4])
return {1, nextState}
`;

const addPlayerScript = `
local raw = redis.call("GET", KEYS[1])
if not raw then return {0, "Live game state was not found."} end
local state = cjson.decode(raw)
if state.status ~= "LOBBY" then return {0, "This game is no longer accepting players."} end
state.players = state.players or {}
for _, existing in ipairs(state.players) do
  if existing.nicknameKey == ARGV[3] or string.lower(existing.nickname) == ARGV[3] then return {0, "That nickname is already in use for this game."} end
end
table.insert(state.players, { id = ARGV[2], nickname = ARGV[1], nicknameKey = ARGV[3], totalScore = 0, streak = 0 })
local nextState = cjson.encode(state)
redis.call("SET", KEYS[1], nextState, "EX", ARGV[4])
return {1, nextState}
`;

export class GameStateManager {
  private static readonly managers = new Map<string, GameStateManager>();
  private static eventHandler: GameEventHandler | null = null;
  private timer: NodeJS.Timeout | null = null;
  private transitionQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly pin: string) {}

  static setEventHandler(handler: GameEventHandler): void { this.eventHandler = handler; }

  static async create(input: Omit<LiveGameState, "players" | "currentQuestionIndex" | "createdAt" | "status">): Promise<GameStateManager> {
    const manager = new GameStateManager(input.pin);
    const state: StoredGameState = {
      ...input,
      status: "LOBBY",
      players: [],
      currentQuestionIndex: null,
      createdAt: new Date().toISOString(),
      questions: [],
      answers: {},
      collectionStartsAtMs: null,
      questionStartAtMs: null,
      deadlineAtMs: null,
    };
    await manager.save(state);
    this.managers.set(input.pin, manager);
    return manager;
  }

  static async forPin(pin: string): Promise<GameStateManager | null> {
    const cached = this.managers.get(pin);
    if (cached) return cached;
    const manager = new GameStateManager(pin);
    if (!(await redis.exists(manager.key))) return null;
    this.managers.set(pin, manager);
    manager.schedule(await manager.getStoredState());
    return manager;
  }

  private get key(): string { return `quizarena:game:${this.pin}:state`; }

  async getState(): Promise<LiveGameState> { return this.publicState(await this.getStoredState()); }

  async getTeacherView(): Promise<TeacherGameView> { return this.teacherView(await this.getStoredState()); }

  async getStudentView(): Promise<StudentGameView> { return this.studentView(await this.getStoredState()); }

  async startGame(): Promise<LiveGameState> {
    return this.runTransition(async () => {
    const current = await this.getStoredState();
    if (current.status !== "LOBBY") throw new Error("This game has already started.");
    const questions = await prisma.question.findMany({ where: { quizId: current.quizId }, orderBy: { orderIndex: "asc" } });
    const snapshot = z.array(questionSchema).min(1).parse(questions.map((question) => ({ ...question, options: question.options })));
    const now = Date.now();
    const next: StoredGameState = {
      ...current,
      status: "QUESTION_SHOW",
      questions: snapshot,
      currentQuestionIndex: 0,
      answers: {},
      collectionStartsAtMs: now + QUESTION_SHOW_DURATION_MS,
      questionStartAtMs: null,
      deadlineAtMs: null,
    };
    await this.save(next);
    await prisma.game.update({ where: { id: next.gameId }, data: { status: "QUESTION_SHOW", startedAt: new Date(now) } });
    await this.publish("state", next);
    this.schedule(next);
    return this.publicState(next);
    });
  }

  async next(): Promise<LiveGameState> {
    return this.runTransition(async () => {
    const current = await this.getStoredState();
    if (current.status === "ANSWER_REVEAL") {
      const next = { ...current, status: "LEADERBOARD" as const };
      await this.save(next); await this.publish("state", next); return this.publicState(next);
    }
    if (current.status === "LEADERBOARD") {
      const nextIndex = (current.currentQuestionIndex ?? -1) + 1;
      if (nextIndex < current.questions.length) {
        const next = this.questionShowState(current, nextIndex);
        await this.save(next); await this.publish("state", next); this.schedule(next); return this.publicState(next);
      }
      const next = { ...current, status: "FINAL_PODIUM" as const };
      await this.save(next); await this.publish("state", next); return this.publicState(next);
    }
    if (current.status === "FINAL_PODIUM") {
      const next = { ...current, status: "ENDED" as const };
      await this.save(next);
      await prisma.game.update({ where: { id: next.gameId }, data: { status: "ENDED", endedAt: new Date() } });
      await this.publish("ended", next);
      return this.publicState(next);
    }
    throw new Error("The game cannot advance from its current state.");
    });
  }

  async submitAnswer(playerId: string, selectedOption: number): Promise<void> {
    const result = await redis.eval(submitAnswerScript, 1, this.key, playerId, Date.now(), selectedOption, LIVE_GAME_TTL_SECONDS);
    const state = this.scriptState(result);
    await this.publish("answer-submitted", state);
  }

  async addPlayer(nickname: string): Promise<{ player: LobbyPlayer; state: LiveGameState }> {
    const normalizedNickname = nickname.trim();
    const player: LobbyPlayer = { id: randomUUID(), nickname: normalizedNickname };
    const nicknameKey = normalizedNickname.normalize("NFKC").toLocaleLowerCase();
    const result = await redis.eval(addPlayerScript, 1, this.key, player.nickname, player.id, nicknameKey, LIVE_GAME_TTL_SECONDS);
    const state = this.scriptState(result);
    return { player, state: this.publicState(state) };
  }

  async feedbackForPlayer(playerId: string): Promise<AnswerFeedback> {
    const state = await this.getStoredState();
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player || state.currentQuestionIndex === null) throw new Error("Player feedback is unavailable.");
    const answer = state.answers[playerId];
    return {
      questionIndex: state.currentQuestionIndex,
      answered: Boolean(answer),
      isCorrect: answer?.isCorrect ?? false,
      pointsAwarded: answer?.pointsAwarded ?? 0,
      totalScore: player.totalScore,
      rank: this.leaderboard(state).find((entry) => entry.playerId === playerId)?.rank ?? state.players.length,
    };
  }

  private async beginAnswerCollection(): Promise<void> {
    await this.runTransition(async () => {
    const current = await this.getStoredState();
    if (current.status !== "QUESTION_SHOW") return;
    const now = Date.now();
    if (current.collectionStartsAtMs && now < current.collectionStartsAtMs) { this.schedule(current); return; }
    const question = this.currentQuestion(current);
    if (!question) return;
    const next: StoredGameState = { ...current, status: "ANSWER_COLLECT", answers: {}, collectionStartsAtMs: null, questionStartAtMs: now, deadlineAtMs: now + question.timeLimitSec * 1000 };
    await this.save(next); await this.publish("state", next); this.schedule(next);
    });
  }

  private async revealAnswer(): Promise<void> {
    await this.runTransition(async () => {
    const current = await this.getStoredState();
    if (current.status !== "ANSWER_COLLECT") return;
    const now = Date.now();
    if (current.deadlineAtMs && now < current.deadlineAtMs) { this.schedule(current); return; }
    const next: StoredGameState = { ...current, status: "ANSWER_REVEAL" };
    await this.save(next); await this.publish("answer-reveal", next);
    });
  }

  private questionShowState(current: StoredGameState, currentQuestionIndex: number): StoredGameState {
    return { ...current, status: "QUESTION_SHOW", currentQuestionIndex, answers: {}, collectionStartsAtMs: Date.now() + QUESTION_SHOW_DURATION_MS, questionStartAtMs: null, deadlineAtMs: null };
  }

  private schedule(state: StoredGameState): void {
    if (this.timer) clearTimeout(this.timer);
    const target = state.status === "QUESTION_SHOW" ? state.collectionStartsAtMs : state.status === "ANSWER_COLLECT" ? state.deadlineAtMs : null;
    if (!target) return;
    const delay = Math.max(0, target - Date.now());
    this.timer = setTimeout(() => {
      if (state.status === "QUESTION_SHOW") void this.beginAnswerCollection();
      if (state.status === "ANSWER_COLLECT") void this.revealAnswer();
    }, delay);
  }

  private async publish(kind: GameEventKind, state: StoredGameState): Promise<void> {
    await GameStateManager.eventHandler?.({ kind, pin: this.pin, state });
  }

  private async getStoredState(): Promise<StoredGameState> {
    const raw = await redis.get(this.key);
    if (!raw) throw new Error("Live game state was not found.");
    return storedStateSchema.parse(JSON.parse(raw));
  }

  private async save(state: StoredGameState): Promise<void> { await redis.set(this.key, JSON.stringify(state), "EX", LIVE_GAME_TTL_SECONDS); }

  private async runTransition<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.transitionQueue.then(operation, operation);
    this.transitionQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private scriptState(result: unknown): StoredGameState {
    if (!Array.isArray(result) || result.length !== 2 || typeof result[0] !== "number" || typeof result[1] !== "string") throw new Error("Could not update the live game.");
    const [success, payload] = result;
    if (success !== 1) throw new Error(payload);
    return storedStateSchema.parse(JSON.parse(payload));
  }

  private publicState(state: StoredGameState): LiveGameState {
    return { gameId: state.gameId, pin: state.pin, quizId: state.quizId, hostTeacherId: state.hostTeacherId, status: state.status, players: state.players.map(({ id, nickname }) => ({ id, nickname })), currentQuestionIndex: state.currentQuestionIndex, createdAt: state.createdAt };
  }

  private currentQuestion(state: StoredGameState): z.infer<typeof questionSchema> | null { return state.currentQuestionIndex === null ? null : state.questions[state.currentQuestionIndex] ?? null; }

  private answerCounts(state: StoredGameState): number[] | null {
    const question = this.currentQuestion(state); if (!question) return null;
    return question.options.map((_, optionIndex) => Object.values(state.answers).filter((answer) => answer.selectedOption === optionIndex).length);
  }

  private leaderboard(state: StoredGameState): LeaderboardEntry[] {
    return [...state.players].sort((left, right) => right.totalScore - left.totalScore || left.nickname.localeCompare(right.nickname)).map((player, index) => ({ rank: index + 1, playerId: player.id, nickname: player.nickname, score: player.totalScore }));
  }

  private teacherView(state: StoredGameState): TeacherGameView {
    const question = this.currentQuestion(state);
    const hasRevealed = ["ANSWER_REVEAL", "LEADERBOARD", "FINAL_PODIUM", "ENDED"].includes(state.status);
    return {
      pin: state.pin, status: state.status, playerCount: state.players.length,
      currentQuestion: question ? { index: state.currentQuestionIndex ?? 0, totalQuestions: state.questions.length, text: question.text, imageUrl: question.imageUrl, options: question.options.map(({ text }) => ({ text })), timeLimitSec: question.timeLimitSec, points: question.points } : null,
      collectionStartsAtMs: state.collectionStartsAtMs, questionStartAtMs: state.questionStartAtMs, deadlineAtMs: state.deadlineAtMs,
      answerCounts: ["ANSWER_COLLECT", "ANSWER_REVEAL", "LEADERBOARD", "FINAL_PODIUM", "ENDED"].includes(state.status) ? this.answerCounts(state) : null,
      correctOptionIndex: hasRevealed && question ? question.options.findIndex((option) => option.isCorrect) : null,
      leaderboard: hasRevealed ? this.leaderboard(state) : null,
    };
  }

  private studentView(state: StoredGameState): StudentGameView {
    const question = this.currentQuestion(state);
    const isQuestionVisible = (state.status === "QUESTION_SHOW" || state.status === "ANSWER_COLLECT") && question !== null;
    return {
      pin: state.pin,
      status: state.status,
      playerCount: state.players.length,
      currentQuestion: isQuestionVisible ? {
        index: state.currentQuestionIndex ?? 0,
        totalQuestions: state.questions.length,
        text: question.text,
        imageUrl: question.imageUrl,
        options: question.options.map(({ text }) => ({ text })),
        optionCount: question.options.length,
        deadlineAtMs: state.deadlineAtMs,
      } : null,
      leaderboard: ["LEADERBOARD", "FINAL_PODIUM", "ENDED"].includes(state.status) ? this.leaderboard(state) : null,
    };
  }
}
