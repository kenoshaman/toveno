"use client";

import { Maximize2, Minimize2, PictureInPicture2, Volume2, VolumeX } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";

type PlayerControlsProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  stageRef: RefObject<HTMLElement | null>;
};

export function PlayerControls({ videoRef, stageRef }: PlayerControlsProps) {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement) && document.fullscreenElement === stageRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [stageRef]);

  useEffect(() => {
    const video = videoRef.current;
    setPipSupported(Boolean(document.pictureInPictureEnabled && video && !video.disablePictureInPicture));

    if (!video) {
      return;
    }

    function handleEnterPiP() {
      setIsPiP(true);
    }

    function handleLeavePiP() {
      setIsPiP(false);
    }

    video.addEventListener("enterpictureinpicture", handleEnterPiP);
    video.addEventListener("leavepictureinpicture", handleLeavePiP);

    return () => {
      video.removeEventListener("enterpictureinpicture", handleEnterPiP);
      video.removeEventListener("leavepictureinpicture", handleLeavePiP);
    };
  }, [videoRef]);

  function toggleMute() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function handleVolumeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    setVolume(value);

    const video = videoRef.current;
    if (video) {
      video.volume = value;
      video.muted = value === 0;
      setMuted(value === 0);
    }
  }

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await stage.requestFullscreen();
    }
  }

  async function togglePiP() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // O navegador recusou o pedido de popout; nada a fazer.
    }
  }

  return (
    <div className="player-controls">
      <button
        type="button"
        className="player-control-btn"
        onClick={toggleMute}
        aria-label={muted || volume === 0 ? "Ativar som" : "Silenciar"}
      >
        {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={handleVolumeChange}
        className="player-volume-slider"
        aria-label="Volume"
      />

      {pipSupported ? (
        <button
          type="button"
          className="player-control-btn"
          onClick={togglePiP}
          aria-pressed={isPiP}
          aria-label={isPiP ? "Fechar popout" : "Abrir em popout"}
        >
          <PictureInPicture2 size={16} />
        </button>
      ) : null}

      <button
        type="button"
        className="player-control-btn"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
    </div>
  );
}
