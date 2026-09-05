import { useState } from "react";
import type { JoinLobbyResult } from "@quizarena/shared-types";

interface JoinScreenProps {
  pin: string;
  nickname: string;
  onPinChange: (value: string) => void;
  onNicknameChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  message: string | null;
  joining: boolean;
  onClearError: () => void;
}

export function JoinScreen({ pin, nickname, onPinChange, onNicknameChange, onSubmit, message, joining, onClearError }: JoinScreenProps) {
  const [pinTouched, setPinTouched] = useState(false);
  const pinError = pinTouched && !/^\d{6}$/.test(pin);
  const isFormValid = /^\d{6}$/.test(pin) && nickname.trim().length >= 2;
  const showError = message || pinError;

  return (
    <main className="join-entrance">
      <div className="join-backdrop">
        <div className="join-bg-mesh"></div>
        <div className="join-bg-particles"></div>
        <div className="join-bg-glow orb-1"></div>
        <div className="join-bg-glow orb-2"></div>
        <div className="join-bg-glow orb-3"></div>
      </div>
      <div className="join-card">
        <div className="card-outer-glow"></div>
        <div className="brand-badge">QA</div>
        <p className="brand-label">QUIZ KHELO</p>
        <h1 className="join-heading">
          <span>Join a live</span>
          <span className="heading-accent">quiz</span>
        </h1>
        <p className="join-description">Enter the PIN shown by your teacher.</p>
        <form onSubmit={onSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="game-pin" className="field-label">Game PIN</label>
            <input
              id="game-pin"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
                onPinChange(digits);
                if (pinTouched && !/^\d{6}$/.test(digits)) {
                  onClearError();
                }
              }}
              onFocus={() => setPinTouched(true)}
              onBlur={() => setPinTouched(true)}
              className={pinError ? "field-input error" : "field-input"}
              placeholder="123456"
              autoFocus
              aria-invalid={pinError}
              aria-describedby={pinError ? "pin-error" : undefined}
            />
            {pinError && (
              <p id="pin-error" className="field-error">
                Please enter a valid 6-digit PIN.
              </p>
            )}
          </div>
          <div className="field-group">
            <label htmlFor="nickname" className="field-label">Nickname</label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(event) => onNicknameChange(event.target.value)}
              maxLength={30}
              className="field-input"
              placeholder="Your name"
              aria-label="Your nickname"
            />
          </div>
          {message && !pinError && (
            <p className="field-error" role="alert">
              {message}
            </p>
          )}
          <button
            type="submit"
            className="cta-button"
            disabled={joining || !isFormValid}
            aria-busy={joining}
          >
            {joining ? (
              <>
                <span className="spinner" aria-label="Joining"></span>
                <span>Joining...</span>
              </>
            ) : (
              "Join game"
            )}
          </button>
        </form>
        <a className="secondary-link" href="/teacher">Teacher sign up or log in</a>
      </div>
    </main>
  );
}
