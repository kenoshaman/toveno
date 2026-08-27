"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import {
  dispatchRoomGatePassed,
  isRoomVerified,
  storeVerifiedRoomPassword,
} from "@/lib/session-gate";

type Phase = "loading" | "ready" | "password" | "exiting" | "gone";

const PLAY_ICON = (
  <svg
    className="play-button-cosm"
    width={128}
    height={128}
    viewBox="0 0 256 256"
    id="Flat"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M243.07324,157.43945c-1.2334-1.47949-23.18847-27.34619-60.46972-41.05859-1.67579-17.97412-8.25293-34.36328-18.93653-46.87158C149.41309,52.8208,128.78027,44,104,44,54.51074,44,22.10059,88.57715,20.74512,90.4751a3.99987,3.99987,0,0,0,6.50781,4.65234C27.5625,94.6958,58.68359,52,104,52c22.36816,0,40.89648,7.85107,53.584,22.70508,8.915,10.437,14.65625,23.9541,16.65528,38.894A133.54185,133.54185,0,0,0,136,108c-25.10742,0-46.09473,6.48486-60.69434,18.75391-12.65234,10.63379-19.91015,25.39355-19.91015,40.49463a43.61545,43.61545,0,0,0,12.69336,31.21923C76.98438,207.3208,89.40234,212,104,212c23.98047,0,44.37305-9.4668,58.97461-27.37744,12.74512-15.6333,20.05566-37.145,20.05566-59.01953,0-.1128-.001-.22559-.001-.33838,33.62988,13.48486,53.62207,36.96631,53.89746,37.2959a4.00015,4.00015,0,0,0,6.14648-5.1211ZM104,204c-27.89746,0-40.60449-19.05078-40.60449-36.75146C63.39551,142.56592,86.11621,116,136,116a124.37834,124.37834,0,0,1,38.97266,6.32617q.05712,1.63038.05761,3.27686C175.03027,177.07129,139.29785,204,104,204Z" />
  </svg>
);

const PLAY_HIGHLIGHT = (
  <svg className="play-button-highlight" viewBox="0 0 144.75738 77.18431" preserveAspectRatio="none">
    <g transform="translate(-171.52826,-126.11624)">
      <g fill="none" strokeWidth="17" strokeLinecap="round" strokeMiterlimit="10">
        <path d="M180.02826,169.45123c0,0 12.65228,-25.55115 24.2441,-25.66863c6.39271,-0.06479 -5.89143,46.12943 4.90937,50.63857c10.22345,4.2681 24.14292,-52.38336 37.86455,-59.80493c3.31715,-1.79413 -5.35094,45.88889 -0.78872,58.34589c5.19371,14.18125 33.36934,-58.38221 36.43049,-56.91633c4.67078,2.23667 -0.06338,44.42744 5.22574,47.53647c6.04041,3.55065 19.87185,-20.77286 19.87185,-20.77286" />
      </g>
    </g>
  </svg>
);

export function IntroGate() {
  const pathname = usePathname();
  const watchSessionId = pathname?.startsWith("/watch/")
    ? pathname.split("/")[2] ?? null
    : null;

  const [phase, setPhase] = useState<Phase>("loading");
  const [minLoadDone, setMinLoadDone] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinLoadDone(true), 650);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!watchSessionId || isRoomVerified(watchSessionId)) {
      setGateChecked(true);
      return;
    }

    let cancelled = false;

    fetch(`/api/session/${encodeURIComponent(watchSessionId)}/private`)
      .then((response) => (response.ok ? response.json() : { private: false }))
      .then((data: { private: boolean }) => {
        if (!cancelled) {
          setIsPrivate(Boolean(data.private));
          setGateChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGateChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [watchSessionId]);

  useEffect(() => {
    if (minLoadDone && gateChecked && phase === "loading") {
      setPhase("ready");
    }
  }, [minLoadDone, gateChecked, phase]);

  function exitGate() {
    setPhase("exiting");
    window.setTimeout(() => setPhase("gone"), 550);
  }

  function handlePlay() {
    if (watchSessionId && isPrivate && !isRoomVerified(watchSessionId)) {
      setPhase("password");
      return;
    }
    exitGate();
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!watchSessionId || !passwordInput) {
      return;
    }

    setVerifying(true);
    setPasswordError(null);

    try {
      const response = await fetch(
        `/api/session/${encodeURIComponent(watchSessionId)}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: passwordInput }),
        },
      );
      const data = (await response.json()) as { ok: boolean };

      if (data.ok) {
        storeVerifiedRoomPassword(watchSessionId, passwordInput);
        dispatchRoomGatePassed(watchSessionId);
        exitGate();
      } else {
        setPasswordError("Senha incorreta.");
      }
    } catch {
      setPasswordError("Não foi possível verificar a senha.");
    } finally {
      setVerifying(false);
    }
  }

  if (phase === "gone") {
    return null;
  }

  return (
    <div className={`intro-gate ${phase === "exiting" ? "intro-gate-exiting" : ""}`}>
      <Image
        src="/icon/raccoon_logo_round.svg"
        alt="ToVeno"
        width={140}
        height={140}
        priority
        className={`intro-gate-logo ${phase === "loading" ? "intro-gate-logo-loading" : ""}`}
      />

      {phase === "ready" ? (
        <button type="button" className="play-button" onClick={handlePlay}>
          {PLAY_ICON}
          {PLAY_HIGHLIGHT}
          Play
        </button>
      ) : null}

      {phase === "password" ? (
        <form className="intro-gate-password-form" onSubmit={handlePasswordSubmit}>
          <div className="intro-gate-password-wrap">
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(event) => {
                setPasswordInput(event.target.value);
                setPasswordError(null);
              }}
              placeholder="Senha da sala"
              className="intro-gate-password-input"
            />
          </div>
          {passwordError ? <p className="intro-gate-password-error">{passwordError}</p> : null}
          <button
            type="submit"
            className="play-button"
            disabled={verifying || !passwordInput}
          >
            {PLAY_ICON}
            {PLAY_HIGHLIGHT}
            Play
          </button>
        </form>
      ) : null}

      <svg height="0" width="0" aria-hidden="true" style={{ position: "absolute" }}>
        <filter id="toveno-hand-noise">
          <feTurbulence
            result="noise"
            numOctaves={8}
            baseFrequency="0.1"
            type="fractalNoise"
          />
          <feDisplacementMap
            yChannelSelector="G"
            xChannelSelector="R"
            scale={3}
            in2="noise"
            in="SourceGraphic"
          />
        </filter>
        <filter id="toveno-hand-noise-2">
          <feTurbulence
            result="noise"
            numOctaves={8}
            baseFrequency="0.1"
            seed={1010}
            type="fractalNoise"
          />
          <feDisplacementMap
            yChannelSelector="G"
            xChannelSelector="R"
            scale={3}
            in2="noise"
            in="SourceGraphic"
          />
        </filter>
        <filter id="toveno-hand-noise-t">
          <feTurbulence
            result="noise"
            numOctaves={8}
            baseFrequency="0.1"
            type="fractalNoise"
          />
          <feDisplacementMap
            yChannelSelector="G"
            xChannelSelector="R"
            scale={6}
            in2="noise"
            in="SourceGraphic"
          />
        </filter>
        <filter id="toveno-hand-noise-t2">
          <feTurbulence
            result="noise"
            numOctaves={8}
            baseFrequency="0.1"
            seed={1010}
            type="fractalNoise"
          />
          <feDisplacementMap
            yChannelSelector="G"
            xChannelSelector="R"
            scale={6}
            in2="noise"
            in="SourceGraphic"
          />
        </filter>
      </svg>
    </div>
  );
}
