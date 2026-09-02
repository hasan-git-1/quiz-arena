import { useEffect, useState } from "react";

type Health = { status: string; database: string; redis: string };
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/health`).then(async (response) => {
      if (!response.ok) throw new Error(`API unavailable (${response.status})`);
      return response.json() as Promise<Health>;
    }).then(setHealth).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to reach API"));
  }, []);

  return <main><p className="eyebrow">REAL-TIME CLASSROOM QUIZZES</p><h1>Quiz Khelo</h1><p>Phase 1 is connected.</p><section aria-live="polite">{health ? `API: ${health.status} · Postgres: ${health.database} · Redis: ${health.redis}` : error ?? "Checking API…"}</section></main>;
}
