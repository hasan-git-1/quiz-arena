import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  AnswerAccepted,
  AnswerFeedback,
  ClientToServerEvents,
  JoinLobbyResult,
  LeaderboardEntry,
  LiveGameState,
  ServerToClientEvents,
  StudentGameView,
  SubmitAnswerResult,
} from "@quizarena/shared-types";
import { Button, Card, Input, PageContainer } from "./ui";

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001";
const answerStyles = ["triangle", "diamond", "circle", "square"] as const;

function secondsRemaining(deadlineAtMs: number | null): number | null {
  return deadlineAtMs === null ? null : Math.max(0, Math.ceil((deadlineAtMs - Date.now()) / 1_000));
}

function FinalPodium({ entries, playerId }: { entries: LeaderboardEntry[]; playerId: string | null }) {
  const topThree = entries.slice(0, 3);
  const podiumOrder = topThree.length > 1 ? [topThree[1], topThree[0], topThree[2]].filter(Boolean) : topThree;

  return <section className="podium-stage student-podium">
    <div className="podium-hero">
      <span aria-hidden="true">🏆</span>
      <p className="eyebrow">FINAL RESULTS</p>
      <h1>Quiz champions</h1>
      <p>Thanks for playing Quiz Khelo.</p>
    </div>
    <div className="podium-steps">
      {podiumOrder.map((entry) => <article className={`podium-player podium-rank-${entry.rank} ${entry.playerId === playerId ? "podium-you" : ""}`} key={entry.playerId}>
        <span className="podium-medal" aria-label={`Rank ${entry.rank}`}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}</span>
        <strong>{entry.nickname}</strong>
        <small>{entry.score} points</small>
        <div className="podium-plinth"><span>#{entry.rank}</span></div>
      </article>)}
    </div>
    <ol className="podium-rest" aria-label="Remaining leaderboard">{entries.slice(3).map((entry) => <li key={entry.playerId}><span>#{entry.rank} {entry.nickname}</span><strong>{entry.score}</strong></li>)}</ol>
    {!topThree.length && <p className="podium-empty">No scores were recorded for this game.</p>}
  </section>;
}

export function JoinLobby() {
  const searchPin = new URLSearchParams(window.location.search).get("pin") ?? "";
  const [pin, setPin] = useState(searchPin.replace(/\D/g, "").slice(0, 6));
  const [nickname, setNickname] = useState("");
  const [lobby, setLobby] = useState<LiveGameState | null>(null);
  const [gameState, setGameState] = useState<StudentGameView | null>(null);
  const [studentSession, setStudentSession] = useState<string | null>(() => sessionStorage.getItem("quizarena-student-session"));
  const [playerId, setPlayerId] = useState<string | null>(() => sessionStorage.getItem("quizarena-student-id"));
  const [message, setMessage] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const socket = useMemo(() => io(socketUrl, { autoConnect: false }) as Socket<ServerToClientEvents, ClientToServerEvents>, []);

  useEffect(() => {
    socket.on("game:lobby-updated", setLobby);
    socket.on("game:student-state", (state) => {
      setGameState(state);
      if (state.status === "QUESTION_SHOW" || state.status === "ANSWER_COLLECT") {
        setSelectedOption(null);
        setFeedback(null);
      }
    });
    socket.on("game:answer-accepted", (answer: AnswerAccepted) => {
      setSelectedOption((current) => current ?? -1);
      setMessage(`Answer locked for question ${answer.questionIndex + 1}.`);
    });
    socket.on("game:answer-feedback", (nextFeedback) => {
      setFeedback(nextFeedback);
      setMessage(null);
    });
    socket.on("connect_error", () => { setJoining(false); setMessage("Could not connect to Quiz Khelo. Please try again."); });
    return () => {
      socket.off("game:lobby-updated", setLobby);
      socket.off("game:student-state");
      socket.off("game:answer-accepted");
      socket.off("game:answer-feedback");
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    const deadline = gameState?.currentQuestion?.deadlineAtMs ?? null;
    setSeconds(secondsRemaining(deadline));
    if (!deadline) return;
    const interval = window.setInterval(() => setSeconds(secondsRemaining(deadline)), 250);
    return () => window.clearInterval(interval);
  }, [gameState?.currentQuestion?.deadlineAtMs]);

  function join(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin)) { setMessage("Enter the six-digit game PIN."); return; }
    if (nickname.trim().length < 2) { setMessage("Your nickname needs at least two characters."); return; }
    setMessage(null); setJoining(true);
    const submitJoin = () => socket.emit("game:join-lobby", { pin, nickname: nickname.trim() }, (result: JoinLobbyResult) => {
      setJoining(false);
      if (!result.ok) { setMessage(result.error); return; }
      sessionStorage.setItem("quizarena-student-session", result.sessionToken);
      sessionStorage.setItem("quizarena-student-id", result.player.id);
      setStudentSession(result.sessionToken); setPlayerId(result.player.id); setLobby(result.state);
      setMessage(`Joined as ${result.player.nickname}.`);
    });
    if (socket.connected) submitJoin(); else { socket.once("connect", submitJoin); socket.connect(); }
  }

  function submitAnswer(optionIndex: number) {
    if (!studentSession || selectedOption !== null || !gameState?.currentQuestion) return;
    setSelectedOption(optionIndex); setMessage(null);
    socket.emit("game:submit-answer", { pin, sessionToken: studentSession, selectedOption: optionIndex }, (result: SubmitAnswerResult) => {
      if (!result.ok) { setSelectedOption(null); setMessage(result.error); }
    });
  }

  const status = gameState?.status ?? lobby?.status ?? "LOBBY";
  const ownLeaderboardEntry = gameState?.leaderboard?.find((entry) => entry.playerId === playerId) ?? null;
  const currentQuestion = gameState?.currentQuestion ?? null;
  const showAnswers = status === "ANSWER_COLLECT" && currentQuestion !== null;
  const isLocked = selectedOption !== null;

  if (!lobby) return <PageContainer className="join-screen"><Card className="teacher-panel join-panel"><p className="eyebrow">QUIZ KHELO</p><h1>Join a live quiz</h1><p>Enter the PIN shown by your teacher.</p><form onSubmit={join}><label>Game PIN<Input inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" autoFocus /></label><label>Nickname<Input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} placeholder="Your name" /></label>{message && <p className="form-error">{message}</p>}<Button disabled={joining}>{joining ? "Joining..." : "Join game"}</Button></form><a className="teacher-link" href="/teacher">Teacher sign up or log in</a></Card></PageContainer>;

  return <main className="student-game-screen">
    <header className="student-header"><span>QUIZ KHELO</span><strong>{seconds !== null ? `${seconds}s` : `${lobby.players.length} players`}</strong></header>
    {status === "LOBBY" && <section className="student-panel"><p className="eyebrow">YOU ARE IN</p><h1>Hi, {nickname || "player"}!</h1><p>Watch the shared screen. The teacher will start the quiz shortly.</p><div className="student-player-count">{lobby.players.length} players joined</div></section>}
    {status === "QUESTION_SHOW" && currentQuestion && <section className="student-panel student-question-preview"><p className="eyebrow">QUESTION {(currentQuestion.index ?? 0) + 1} OF {currentQuestion.totalQuestions}</p><h1>{currentQuestion.text}</h1>{currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="Question illustration" />}<div className="student-option-preview">{currentQuestion.options.map((option, index) => <div className={`student-option-preview-item ${answerStyles[index]}`} key={`${option.text}-${index}`}><span className="answer-symbol" aria-hidden="true" /><strong>{option.text}</strong></div>)}</div><p className="question-preview-note">Answer buttons unlock in a moment.</p></section>}
    {showAnswers && <section className="student-answer-stage"><div className="student-stage-info"><span>Question {currentQuestion.index + 1} / {currentQuestion.totalQuestions}</span><strong className="timer-ring">{seconds}s</strong></div><article className="student-question-card"><h2>{currentQuestion.text}</h2>{currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="Question illustration" />}</article><div className={`answer-grid answer-grid-${currentQuestion.optionCount}`}>{answerStyles.slice(0, currentQuestion.optionCount).map((shape, index) => <button className={`student-answer ${shape} answer-option-${index + 1} ${selectedOption === index ? "selected" : ""}`} key={shape} onClick={() => submitAnswer(index)} disabled={isLocked} aria-label={`Answer option ${index + 1}: ${currentQuestion.options[index]?.text ?? ""}`}><span className="answer-symbol" aria-hidden="true" /><span className="answer-label">{currentQuestion.options[index]?.text}</span></button>)}</div>{isLocked && <div className="student-panel answer-locked"><p className="eyebrow">ANSWER LOCKED</p><p>Your answer was securely sent to the server.</p></div>}</section>}
    {status === "ANSWER_REVEAL" && <section className={`student-panel feedback ${feedback?.isCorrect ? "correct" : "incorrect"}`}><span className="feedback-mark" aria-hidden="true">{feedback?.answered ? feedback.isCorrect ? "✓" : "×" : "!"}</span><p className="eyebrow">ANSWER REVEAL</p><h1>{feedback?.answered ? feedback.isCorrect ? "Correct!" : "Not this time" : "Time is up"}</h1><p>{feedback?.answered ? feedback.isCorrect ? `+${feedback.pointsAwarded} points` : "No points this round" : "You did not submit an answer."}</p>{feedback && <div className="rank-card"><span>Your score</span><strong>{feedback.totalScore}</strong><span>Rank #{feedback.rank}</span></div>}</section>}
    {status === "LEADERBOARD" && <section className="student-panel student-leaderboard"><p className="eyebrow">LEADERBOARD</p><h1>{ownLeaderboardEntry ? `You are #${ownLeaderboardEntry.rank}` : "Scores updated"}</h1><ol>{gameState?.leaderboard?.slice(0, 5).map((entry) => <li className={entry.playerId === playerId ? "you" : ""} key={entry.playerId}><span>#{entry.rank} {entry.nickname}</span><strong>{entry.score}</strong></li>)}</ol><p>Watch the shared screen for the next question.</p></section>}
    {status === "FINAL_PODIUM" && <FinalPodium entries={gameState?.leaderboard ?? []} playerId={playerId} />}
    {status === "ENDED" && <section className="student-panel"><p className="eyebrow">THANKS FOR PLAYING</p><h1>Game ended</h1><p>{ownLeaderboardEntry ? `You finished with ${ownLeaderboardEntry.score} points.` : "See you in the next quiz."}</p></section>}
    {message && <p className="student-message">{message}</p>}
  </main>;
}
