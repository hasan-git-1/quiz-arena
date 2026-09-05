export type AnswerShape = "triangle" | "diamond" | "circle" | "square";

export interface QuizOption {
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestionInput {
  text: string;
  imageUrl?: string | null;
  options: QuizOption[];
  timeLimitSec: number;
  points: number;
}

export interface QuizInput {
  title: string;
  description?: string | null;
  isPublic: boolean;
  questions: QuizQuestionInput[];
}

export interface TeacherQuiz extends QuizInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  teacher: { id: string; name: string; email: string };
}

export type LiveGameStatus = "LOBBY" | "QUESTION_SHOW" | "ANSWER_COLLECT" | "ANSWER_REVEAL" | "LEADERBOARD" | "FINAL_PODIUM" | "ENDED";

export interface LobbyPlayer {
  id: string;
  nickname: string;
}

export interface LiveGameState {
  gameId: string;
  pin: string;
  quizId: string;
  hostTeacherId: string;
  status: LiveGameStatus;
  players: LobbyPlayer[];
  currentQuestionIndex: number | null;
  createdAt: string;
}

export interface HostedGame {
  id: string;
  pin: string;
  status: "LOBBY";
  qrCodeDataUrl: string;
}

export type WatchLobbyResult =
  | { ok: true; state: LiveGameState }
  | { ok: false; error: string };

export type JoinLobbyResult =
  | { ok: true; player: LobbyPlayer; sessionToken: string; state: LiveGameState }
  | { ok: false; error: string };

export interface TeacherQuestionView {
  index: number;
  totalQuestions: number;
  text: string;
  imageUrl: string | null;
  options: Array<{ text: string }>;
  timeLimitSec: number;
  points: number;
}

export interface StudentQuestionView {
  index: number;
  totalQuestions: number;
  text: string;
  imageUrl: string | null;
  options: Array<{ text: string }>;
  optionCount: number;
  timeLimitSec: number;
  deadlineAtMs: number | null;
}

export interface CountdownTick {
  value: 3 | 2 | 1 | "START";
  visible: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  prevRank?: number | null;
  scoreDelta?: number;
}

export interface TeacherGameView {
  pin: string;
  status: LiveGameStatus;
  playerCount: number;
  currentQuestion: TeacherQuestionView | null;
  collectionStartsAtMs: number | null;
  questionStartAtMs: number | null;
  deadlineAtMs: number | null;
  answerCounts: number[] | null;
  correctOptionIndex: number | null;
  leaderboard: LeaderboardEntry[] | null;
}

export interface StudentGameView {
  pin: string;
  status: LiveGameStatus;
  currentQuestion: StudentQuestionView | null;
  playerCount: number;
  leaderboard: LeaderboardEntry[] | null;
}

export interface AnswerAccepted {
  questionIndex: number;
}

export interface AnswerFeedback {
  questionIndex: number;
  answered: boolean;
  isCorrect: boolean;
  pointsAwarded: number;
  totalScore: number;
  rank: number;
}

export type GameActionResult =
  | { ok: true; state: LiveGameState }
  | { ok: false; error: string };

export type SubmitAnswerResult =
  | { ok: true; accepted: AnswerAccepted }
  | { ok: false; error: string };

export interface ServerToClientEvents {
  "server:ready": (payload: { message: string }) => void;
  "game:lobby-updated": (state: LiveGameState) => void;
  "game:teacher-state": (state: TeacherGameView) => void;
  "game:student-state": (state: StudentGameView) => void;
  "game:answer-accepted": (payload: AnswerAccepted) => void;
  "game:answer-feedback": (payload: AnswerFeedback) => void;
  "game:countdown": (payload: CountdownTick) => void;
}

export interface ClientToServerEvents {
  "game:watch-lobby": (payload: { pin: string; token: string }, acknowledgement: (result: WatchLobbyResult) => void) => void;
  "game:join-lobby": (payload: { pin: string; nickname: string }, acknowledgement: (result: JoinLobbyResult) => void) => void;
  "game:start": (payload: { pin: string; token: string }, acknowledgement: (result: GameActionResult) => void) => void;
  "game:next": (payload: { pin: string; token: string }, acknowledgement: (result: GameActionResult) => void) => void;
  "game:submit-answer": (payload: { pin: string; sessionToken: string; selectedOption: number }, acknowledgement: (result: SubmitAnswerResult) => void) => void;
}

export interface InterServerEvents {}

export interface SocketData { playerId?: string; gamePin?: string; teacherId?: string; }
