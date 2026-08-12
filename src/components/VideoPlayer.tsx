import Hls from "hls.js";
import { Bug, Check, Info, Loader2, Maximize, Pause, PictureInPicture2, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  src: string;
  /** Alternative MPEG-TS URL used when HLS playback fails. */
  fallbackSrc?: string;
  title?: string;
  poster?: string | null;
};

type PlaybackReport = {
  stage: string;
  format: string;
  detail: string;
  browser: string;
  online: boolean;
};

type StreamStats = {
  engine: string;
  resolution: string;
  quality: string;
  fps: string;
  bitrate: string;
  codecs: string;
  buffer: string;
  dropped: string;
};

/** Labels a video height with the common broadcast quality name. */
function qualityLabel(height: number) {
  if (!height) return "unknown";
  if (height >= 2000) return "4K";
  if (height >= 1400) return "1440p";
  if (height >= 1000) return "1080p (Full HD)";
  if (height >= 700) return "720p (HD)";
  if (height >= 540) return "576p (SD)";
  if (height >= 460) return "480p (SD)";
  return `${height}p`;
}

export default function VideoPlayer({ src: rawSrc, fallbackSrc: rawFallbackSrc, title, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const tsPlayerRef = useRef<any>(null);
  const engineRef = useRef<string>("native");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<PlaybackReport | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<StreamStats | null>(null);
  // When a direct provider URL cannot be reached from the browser (CORS or
  // mixed content on an https page), retry the same stream via the relay.
  const [viaProxy, setViaProxy] = useState(false);

  const resolve = useCallback(
    (url?: string) => {
      if (!url) return url;
      if (!/^https?:\/\//i.test(url)) return url;
      const mixed =
        typeof window !== "undefined" &&
        window.location.protocol === "https:" &&
        /^http:\/\//i.test(url);
      return viaProxy || mixed ? toProxyUrl(url) : url;
    },
    [viaProxy],
  );

  const src = resolve(rawSrc) as string;
  const fallbackSrc = resolve(rawFallbackSrc);
  const canRetryViaProxy = !viaProxy && /^https?:\/\//i.test(rawSrc);


  const readStats = useCallback((): StreamStats | null => {
    const video = videoRef.current;
    if (!video) return null;
    const height = video.videoHeight;
    const width = video.videoWidth;

    let bitrate = "unknown";
    let codecs = "unknown";
    let fps = "unknown";

    const hls = hlsRef.current;
    if (hls) {
      const level = hls.levels?.[hls.currentLevel] ?? hls.levels?.[0];
      if (level) {
        if (level.bitrate) bitrate = `${Math.round(level.bitrate / 1000)} kbps`;
        if (level.codecSet || level.attrs?.CODECS) codecs = level.codecSet || String(level.attrs?.CODECS);
        if (level.frameRate) fps = `${Math.round(level.frameRate)} fps`;
      }
    }

    const ts = tsPlayerRef.current;
    if (ts) {
      const info = ts.statisticsInfo ?? {};
      if (typeof info.speed === "number" && info.speed > 0) bitrate = `${Math.round(info.speed * 8)} kbps`;
      const media = ts.mediaInfo ?? {};
      if (media.videoCodec || media.audioCodec)
        codecs = [media.videoCodec, media.audioCodec].filter(Boolean).join(", ");
      if (media.fps) fps = `${Math.round(media.fps)} fps`;
      if (typeof info.decodedFrames === "number" && typeof info.droppedFrames !== "number") {
        // decoded frame counters only; nothing extra to report
      }
    }

    const quality = video.getVideoPlaybackQuality?.();
    const buffered = video.buffered.length
      ? Math.max(0, video.buffered.end(video.buffered.length - 1) - video.currentTime)
      : 0;

    return {
      engine: engineRef.current,
      resolution: width && height ? `${width} × ${height}` : "unknown",
      quality: qualityLabel(height),
      fps,
      bitrate,
      codecs,
      buffer: `${buffered.toFixed(1)} s`,
      dropped: quality ? `${quality.droppedVideoFrames} / ${quality.totalVideoFrames}` : "n/a",
    };
  }, []);

  useEffect(() => {
    if (!showInfo) return;
    setStats(readStats());
    const id = setInterval(() => setStats(readStats()), 1000);
    return () => clearInterval(id);
  }, [showInfo, readStats, src, attempt]);


  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setLoading(true);
    setReport(null);
    setCopied(false);

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
    let hlsFailure = "";

    const recordFailure = (stage: string, detail: string) => {
      setReport({
        stage,
        format: streamFormat || (isHls ? "m3u8" : isTs ? "ts" : "file"),
        detail: detail.replace(/https?:\/\/\S+/gi, "[stream URL removed]"),
        browser: navigator.userAgent,
        online: navigator.onLine,
      });
    };

    const onLoaded = () => setLoading(false);
    video.addEventListener("loadeddata", onLoaded);

    const fail = (msg: string, stage = "player", detail = msg) => {
      setLoading(false);
      setError(msg);
      recordFailure(stage, detail);
    };

    // Watchdog: if nothing has started playing after a while, stop the endless
    // spinner and let the user retry (usually the provider stalled or the
    // account hit its max simultaneous connections).
    let fallbackStarted = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const clearWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
    };
    video.addEventListener("playing", clearWatchdog);


    /** Plays an MPEG-TS stream through mpegts.js (Media Source Extensions). */
    const playTs = async (url: string) => {
      if (fallbackStarted || cancelled) return;
      fallbackStarted = true;
      setLoading(true);
      clearWatchdog();
      watchdog = setTimeout(() => {
        if (cancelled || video.readyState >= 3) return;
        const publishedRelayRejected = hlsFailure.includes("response=458");
        fail(
          publishedRelayRejected
            ? "Your IPTV provider rejected the published site's stream connection (HTTP 458). The Lovable preview uses a different network route, which is why it can still play."
            : "The MPEG-TS stream connected but did not produce playable video. Copy the bug report below.",
          publishedRelayRejected ? "provider-rejected-relay" : "mpegts-timeout",
          `${hlsFailure ? `HLS failed first (${hlsFailure}); ` : ""}No playable TS media after 20 seconds; readyState=${video.readyState}; networkState=${video.networkState}`,
        );
      }, 20000);
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
          // enableWorker must stay false: the bundled worker is created from a
          // blob URL and throws "is not a constructor", which kills playback.
          { enableWorker: false, liveBufferLatencyChasing: true, lazyLoad: false },
        );
        tsPlayer = player;
        tsPlayerRef.current = player;
        engineRef.current = "mpegts.js (MSE)";
        player.on(mpegts.Events.ERROR, (errorType: string, errorDetail: string, info: unknown) => {
          fail(
            "The stream reached the player but its video or audio codec is not browser-compatible.",
            "mpegts",
            `${errorType || "unknown"}: ${errorDetail || "unknown"}${info ? ` ${JSON.stringify(info)}` : ""}`,
          );
        });
        player.attachMediaElement(video);
        player.load();
        void Promise.resolve(player.play()).catch(() => undefined);
      } catch (caught) {
        if (!cancelled) fail("This stream could not be played in the browser.", "mpegts-load", caught instanceof Error ? caught.message : String(caught));
      }
    };

    watchdog = setTimeout(() => {
      if (cancelled || video.readyState >= 3) return;
      if (fallbackSrc && !fallbackStarted) {
        hls?.destroy();
        hls = null;
        hlsRef.current = null;
        void playTs(fallbackSrc);
        return;
      }
      fail(
        "The stream did not start. Open Bug report below for the exact failure details.",
        "timeout",
        `No playable media after 15 seconds; readyState=${video.readyState}; networkState=${video.networkState}`,
      );
    }, 15000);

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
      hlsRef.current = hls;
      engineRef.current = "hls.js";
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          return;
        }
        // HLS is unavailable for this channel — fall back to the raw TS stream.
        hlsFailure = `${data.type}: ${data.details}; response=${data.response?.code ?? "none"}`;
        hls?.destroy();
        hls = null;
        hlsRef.current = null;
        if (fallbackSrc) void playTs(fallbackSrc);
        else fail("This stream could not be played in the browser.", "hls", `${data.type}: ${data.details}; response=${data.response?.code ?? "none"}`);
      });
    } else {
      engineRef.current = "native";
      video.src = src;
    }

    const onVideoError = () => {
      if (tsPlayer || hls) return;
      fail(
        "This stream could not be played. Your browser may not support this file format (try Chrome or Edge for MKV/AVI files).",
        "native-video",
        `MediaError=${video.error?.code ?? "none"}; readyState=${video.readyState}; networkState=${video.networkState}`,
      );
    };
    video.addEventListener("error", onVideoError);

    void video.play().catch(() => undefined);

    return () => {
      cancelled = true;
      clearWatchdog();
      video.removeEventListener("playing", clearWatchdog);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onVideoError);
      if (hls) hls.destroy();
      if (tsPlayer) tsPlayer.destroy();
      hlsRef.current = null;
      tsPlayerRef.current = null;
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
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
            {report && (
              <Button
                variant="outline"
                onClick={() => {
                  const safeReport = [
                    "Streamdeck playback report",
                    `Stage: ${report.stage}`,
                    `Format: ${report.format}`,
                    `Detail: ${report.detail}`,
                    `Online: ${report.online}`,
                    `Browser: ${report.browser}`,
                  ].join("\n");
                  void navigator.clipboard.writeText(safeReport).then(() => setCopied(true));
                }}
              >
                {copied ? <Check /> : <Bug />}
                {copied ? "Copied" : "Copy bug report"}
              </Button>
            )}
          </div>
          {report && (
            <p className="max-w-lg break-words font-mono text-xs text-muted-foreground">
              {report.stage} · {report.format} · {report.detail}
            </p>
          )}
        </div>
      )}

      {showInfo && (
        <div className="absolute right-3 top-3 w-64 rounded-lg border border-border bg-background/90 p-3 text-xs backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-foreground">Stream info</span>
            <button
              onClick={() => setShowInfo(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close stream info"
            >
              ✕
            </button>
          </div>
          <dl className="space-y-1">
            {[
              ["Quality", stats?.quality],
              ["Resolution", stats?.resolution],
              ["Bitrate", stats?.bitrate],
              ["Frame rate", stats?.fps],
              ["Codecs", stats?.codecs],
              ["Buffer", stats?.buffer],
              ["Dropped frames", stats?.dropped],
              ["Engine", stats?.engine],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="max-w-[60%] truncate text-right font-mono text-foreground" title={String(value ?? "")}>
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
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
            aria-label="Stream info"
            aria-pressed={showInfo}
            onClick={() => setShowInfo((v) => !v)}
            className={`transition-colors hover:text-primary ${showInfo ? "text-primary" : "text-foreground"}`}
          >
            <Info className="h-5 w-5" />
          </button>
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
