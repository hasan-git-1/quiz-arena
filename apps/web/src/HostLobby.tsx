import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  CountdownTick,
  GameActionResult,
  HostedGame,
  LeaderboardEntry,
  LiveGameState,
  ServerToClientEvents,
  TeacherGameView,
  WatchLobbyResult,
} from "@quizarena/shared-types";
import { LeaderboardSection } from "./ui";

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001";

function CountdownOverlay({ value }: { value: 3 | 2 | 1 }) {
  return (
    <div className="countdown-overlay">
      <div className="countdown-number" key={value}>
        {value}
      </div>
    </div>
  );
}

function remainingSeconds(deadlineAtMs: number | null): number | null {
  return deadlineAtMs === null ? null : Math.max(0, Math.ceil((deadlineAtMs - Date.now()) / 1_000));
}

function FinalPodium({ entries }: { entries: LeaderboardEntry[] }) {
  const topThree = entries.slice(0, 3);
  const podiumOrder = topThree.length > 1 ? [topThree[1], topThree[0], topThree[2]].filter(Boolean) : topThree;

  return <section className="podium-stage host-podium">
    <div className="podium-hero">
      <span aria-hidden="true">🏆</span>
      <p className="eyebrow">FINAL RESULTS</p>
      <h2>Quiz champions</h2>
      <p>Celebrate the top scores from this live game.</p>
    </div>
    <div className="podium-steps">
      {podiumOrder.map((entry) => <article className={`podium-player podium-rank-${entry.rank}`} key={entry.playerId}>
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

export function HostLobby({ game, teacherToken, onExit }: { game: HostedGame; teacherToken: string; onExit: () => void }) {
  const socket = useMemo(() => io(socketUrl, { autoConnect: false }) as Socket<ServerToClientEvents, ClientToServerEvents>, []);
  const [lobby, setLobby] = useState<LiveGameState | null>(null);
  const [gameState, setGameState] = useState<TeacherGameView | null>(null);
  const [message, setMessage] = useState("Connecting to the lobby…");
  const [seconds, setSeconds] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<CountdownTick | null>(null);
  const [busy, setBusy] = useState(false);
  const joinUrl = `${window.location.origin}/join?pin=${game.pin}`;

  useEffect(() => {
    const watchLobby = () => socket.emit("game:watch-lobby", { pin: game.pin, token: teacherToken }, (result: WatchLobbyResult) => {
      if (result.ok) { setLobby(result.state); setMessage(""); } else setMessage(result.error);
    });
    socket.on("connect", watchLobby);
    socket.on("game:lobby-updated", setLobby);
    socket.on("game:teacher-state", setGameState);
    socket.on("game:countdown", (tick: CountdownTick) => setCountdown(tick));
    socket.on("connect_error", () => setMessage("Could not connect to the live lobby."));
    socket.connect();
    return () => { socket.off("connect", watchLobby); socket.off("game:lobby-updated", setLobby); socket.off("game:teacher-state", setGameState); socket.off("game:countdown"); socket.off("connect_error"); socket.disconnect(); };
  }, [game.pin, socket, teacherToken]);

  useEffect(() => {
    const deadline = gameState?.deadlineAtMs ?? null;
    setSeconds(remainingSeconds(deadline));
    if (!deadline) return;
    const interval = window.setInterval(() => setSeconds(remainingSeconds(deadline)), 250);
    return () => window.clearInterval(interval);
  }, [gameState?.deadlineAtMs]);

  useEffect(() => {
    let timeout: number | undefined;
    if (countdown) {
      if (countdown.visible) {
        timeout = window.setTimeout(() => setCountdown(null), 1000);
      }
    }
    return () => { if (timeout) window.clearTimeout(timeout); };
  }, [countdown]);

  async function copyJoinLink() {
    try { await navigator.clipboard.writeText(joinUrl); setMessage("Join link copied."); }
    catch { setMessage("Copy the join link shown below."); }
  }

  function runAction(event: "game:start" | "game:next") {
    setBusy(true); setMessage("");
    socket.emit(event, { pin: game.pin, token: teacherToken }, (result: GameActionResult) => {
      setBusy(false);
      if (!result.ok) setMessage(result.error);
    });
  }

  const status = gameState?.status ?? lobby?.status ?? "LOBBY";
  const question = gameState?.currentQuestion ?? null;
  const nextLabel = status === "ANSWER_REVEAL" ? "Show leaderboard" : status === "LEADERBOARD" ? (question && question.index + 1 < question.totalQuestions ? "Next question" : "Show final podium") : status === "FINAL_PODIUM" ? "End game" : null;

  return <main className="lobby-screen game-host">
    <header className="lobby-header"><div><p className="eyebrow">LIVE QUIZ</p><h1>{status === "LOBBY" ? "Join the game" : "Game in progress"}</h1></div>{status === "LOBBY" && <button className="teacher-link" onClick={onExit}>Back to quizzes</button>}</header>
    {status === "LOBBY" ? <section className="lobby-grid">
      <section className="lobby-pin-card"><p>Game PIN</p><strong>{game.pin}</strong><p>Players can enter this PIN at Quiz Khelo.</p><code>{joinUrl}</code><button className="lobby-link-button" onClick={copyJoinLink}>Copy join link</button></section>
      <section className="qr-card"><img src={game.qrCodeDataUrl} alt={`QR code to join game ${game.pin}`} /><strong>Scan to join</strong></section>
      <section className="teacher-panel lobby-players"><h2>Players <span>{lobby?.players.length ?? 0}</span></h2>{lobby?.players.length ? <ul>{lobby.players.map((player) => <li key={player.id}>{player.nickname}</li>)}</ul> : <p className="muted">Waiting for players to join…</p>}</section>
      <button className="teacher-primary host-start" onClick={() => runAction("game:start")} disabled={busy}>{busy ? "Starting…" : "Start game"}</button>
     </section> : <section className="game-host-board">
      {countdown && countdown.visible && <CountdownOverlay value={countdown.value} />}
       <div className="game-status"><span>{status.replaceAll("_", " ")}</span>{seconds !== null && <strong className={`timer-ring ${seconds <= 5 ? "urgency-high" : seconds <= 10 ? "urgency-medium" : "urgency-low"}`}>{seconds}s</strong>}<small>{gameState?.playerCount ?? 0} players</small></div>
      {status === "FINAL_PODIUM" && <FinalPodium entries={gameState?.leaderboard ?? []} />}
      {status !== "FINAL_PODIUM" && question && <article className="teacher-panel host-question"><p className="eyebrow">QUESTION {(question.index ?? 0) + 1} OF {question.totalQuestions}</p><h2>{question.text}</h2>{question.imageUrl && <img src={question.imageUrl} alt="Question illustration" />}<div className="host-options">{question.options.map((option, index) => <div className={gameState?.correctOptionIndex === index ? "host-option correct" : "host-option"} key={`${option.text}-${index}`}><span>{index + 1}</span><strong>{option.text}</strong>{gameState?.answerCounts && <small>{gameState.answerCounts[index]} answers</small>}</div>)}</div></article>}
      {status === "QUESTION_SHOW" && <p className="teacher-notice">Countdown running… answer buttons unlock in 3…2…1.</p>}
      {status === "ANSWER_COLLECT" && <p className="teacher-notice">Answers are being collected. The countdown is owned by the server.</p>}
      {gameState?.leaderboard && status !== "FINAL_PODIUM" && <LeaderboardSection entries={gameState.leaderboard.slice(0, 10)} isHost={true} />}
      {nextLabel && <button className="teacher-primary" onClick={() => runAction("game:next")} disabled={busy}>{busy ? "Working…" : nextLabel}</button>}
      {status === "ENDED" && <button className="teacher-primary" onClick={onExit}>Return to quizzes</button>}
    </section>}
    {message && <p className="teacher-notice">{message}</p>}
  </main>;
}
