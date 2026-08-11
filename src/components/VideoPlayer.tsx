import Hls from "hls.js";
import { Loader2, Maximize, Pause, PictureInPicture2, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  /** Alternative MPEG-TS URL used when HLS playback fails. */
  fallbackSrc?: string;
  title?: string;
  poster?: string | null;
};

export default function VideoPlayer({ src, fallbackSrc, title, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setLoading(true);

    const streamFormat = new URL(src, window.location.origin).searchParams.get("format")?.toLowerCase();
    // Proxied URLs contain a base64 target, so the original file extension is
    // carried separately. A live fallback also unambiguously means HLS first.
    const isHls =
      streamFormat === "m3u8" ||
      Boolean(fallbackSrc) ||
      src.includes(".m3u8") ||
      src.includes("%2Em3u8");
    const isTs =
      streamFormat === "ts" ||
      streamFormat === "m2ts" ||
      streamFormat === "mpegts" ||
      /\.(ts|m2ts|mpegts)(\?|$)/i.test(decodeURIComponent(src));
    let hls: Hls | null = null;
    let tsPlayer: { destroy: () => void } | null = null;
    let cancelled = false;

    const onLoaded = () => setLoading(false);
    video.addEventListener("loadeddata", onLoaded);

    const fail = (msg: string) => {
      setLoading(false);
      setError(msg);
    };

    // Watchdog: if nothing has started playing after a while, stop the endless
    // spinner and let the user retry (usually the provider stalled or the
    // account hit its max simultaneous connections).
    let watchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (cancelled || video.readyState >= 3) return;
      fail(
        "The stream did not start. Your provider may be slow or your account may have reached its maximum simultaneous connections — close other players and try again.",
      );
    }, 20000);
    const clearWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
    };
    video.addEventListener("playing", clearWatchdog);


    /** Plays an MPEG-TS stream through mpegts.js (Media Source Extensions). */
    const playTs = async (url: string) => {
      try {
        const mod = await import("mpegts.js");
        const mpegts = mod.default ?? mod;
        if (cancelled) return;
        if (!mpegts.isSupported()) {
          fail("Your browser cannot play this MPEG-TS stream. Try Chrome or Edge.");
          return;
        }
        const player = mpegts.createPlayer(
          { type: "mpegts", url, isLive: true, hasAudio: true, hasVideo: true },
          { enableWorker: true, liveBufferLatencyChasing: true, lazyLoad: false },
        );
        tsPlayer = player;
        player.on(mpegts.Events.ERROR, () => {
          fail(
            "The stream reached the player but its video or audio codec is not browser-compatible.",
          );
        });
        player.attachMediaElement(video);
        player.load();
        void Promise.resolve(player.play()).catch(() => undefined);
      } catch {
        if (!cancelled) fail("This stream could not be played in the browser.");
      }
    };

    if (isTs) {
      void playTs(src);
    } else if (isHls && Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: false,
        enableWorker: true,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 2,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          return;
        }
        // HLS is unavailable for this channel — fall back to the raw TS stream.
        hls?.destroy();
        hls = null;
        if (fallbackSrc) void playTs(fallbackSrc);
        else fail("This stream could not be played in the browser.");
      });
    } else {
      video.src = src;
    }

    const onVideoError = () => {
      if (tsPlayer || hls) return;
      fail(
        "This stream could not be played. Your browser may not support this file format (try Chrome or Edge for MKV/AVI files).",
      );
    };
    video.addEventListener("error", onVideoError);

    void video.play().catch(() => undefined);

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onVideoError);
      if (hls) hls.destroy();
      if (tsPlayer) tsPlayer.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, fallbackSrc, attempt]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black"
    >
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        playsInline
        autoPlay
        controls={false}
        className="h-full w-full"
        onPlay={() => {
          setPlaying(true);
          setError(null);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onVolumeChange={(e) => {
          const el = e.currentTarget;
          setMuted(el.muted);
          setVolume(el.volume);
        }}
      />

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10">
        <button
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="text-foreground transition-colors hover:text-primary"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button
          onClick={() => {
            const v = videoRef.current;
            if (v) v.muted = !v.muted;
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          className="text-foreground transition-colors hover:text-primary"
        >
          {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label="Volume"
          onChange={(e) => {
            const v = videoRef.current;
            if (!v) return;
            v.volume = Number(e.target.value);
            v.muted = Number(e.target.value) === 0;
          }}
          className="h-1 w-24 accent-primary"
        />
        <span className="truncate text-xs text-muted-foreground">{title}</span>
        <div className="ml-auto flex items-center gap-3">
          <button
            aria-label="Picture in picture"
            onClick={() => {
              const v = videoRef.current;
              if (v && document.pictureInPictureEnabled)
                void v.requestPictureInPicture().catch(() => undefined);
            }}
            className="text-foreground transition-colors hover:text-primary"
          >
            <PictureInPicture2 className="h-5 w-5" />
          </button>
          <button
            aria-label="Fullscreen"
            onClick={() => {
              const el = containerRef.current;
              if (!el) return;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void el.requestFullscreen().catch(() => undefined);
            }}
            className="text-foreground transition-colors hover:text-primary"
          >
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
