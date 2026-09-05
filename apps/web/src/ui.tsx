import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ElementType, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { LeaderboardEntry } from "@quizarena/shared-types";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "link";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`ui-button ui-button-${variant} ${className}`.trim()} {...props} />;
}

type CardProps<T extends ElementType = "section"> = {
  as?: T;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

export function Card<T extends ElementType = "section">({ as, children, className = "", ...props }: CardProps<T>) {
  const Component = (as ?? "section") as ElementType;
  return <Component className={`ui-card ${className}`.trim()} {...props}>{children}</Component>;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`.trim()} {...props} />;
}

export function PageContainer({ className = "", ...props }: ComponentPropsWithoutRef<"main">) {
  return <main className={`ui-page ${className}`.trim()} {...props} />;
}

interface LeaderboardSectionProps {
  entries: LeaderboardEntry[];
  isHost?: boolean;
  maxEntries?: number;
}

export function LeaderboardSection({ entries, isHost = false, maxEntries = 10 }: LeaderboardSectionProps) {
  const visibleEntries = entries.slice(0, maxEntries);
  const prevScores = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    visibleEntries.forEach((entry) => {
      const prev = prevScores.current.get(entry.playerId);
      if (prev !== undefined && prev !== entry.score) {
        const el = document.querySelector(`[data-player-id="${entry.playerId}"] .score-value`);
        if (el) {
          el.classList.add("score-count-up");
          el.addEventListener("animationend", () => el.classList.remove("score-count-up"), { once: true });
        }
      }
      prevScores.current.set(entry.playerId, entry.score);
    });
  }, [visibleEntries]);

  return (
    <section className={`leaderboard ${isHost ? "host-leaderboard" : "student-leaderboard"}`} data-animate>
      <h2>Leaderboard</h2>
      <ol>
        {visibleEntries.map((entry, index) => {
          const movedUp = entry.prevRank !== null && entry.prevRank !== undefined && entry.prevRank > entry.rank;
          const movedDown = entry.prevRank !== null && entry.prevRank !== undefined && entry.prevRank < entry.rank;
          const moveClass = movedUp ? "rank-up" : movedDown ? "rank-down" : "";
          return (
            <li
              key={entry.playerId}
              data-player-id={entry.playerId}
              data-rank={entry.rank}
              data-prev-rank={entry.prevRank ?? entry.rank}
              className={moveClass}
              style={{ animationDelay: `${index * 0.06}s` }}
            >
              <span className="rank-badge">#{entry.rank}</span>
              <span className="player-name">{entry.nickname}</span>
              <strong className="score-value" data-score={entry.score} data-delta={entry.scoreDelta ?? 0}>
                {entry.score}
              </strong>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
