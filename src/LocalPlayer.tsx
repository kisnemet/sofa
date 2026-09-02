import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import FlowDiagramBody from "./components/signal-path/FlowDiagramBody";
import { dacDisplayName, deriveAlterations, displayFormat } from "./components/signal-path/types";
import type { SignalPath } from "./atoms/playback";

type AudioDevice = { id: string; name: string };
type LocalSource = { codec: string; bitDepth: number | null; sampleRate: number | null };

export default function LocalPlayer() {
  const [path, setPath] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [device, setDevice] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [bitPerfect, setBitPerfect] = useState(false);
  const [signalPath, setSignalPath] = useState<SignalPath | null>(null);
  const [signalOpen, setSignalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const found = await invoke<AudioDevice[]>("list_audio_devices");
        setDevices(found);
        const saved = await invoke<string | null>("get_exclusive_device");
        const initial = saved && found.some((d) => d.id === saved) ? saved : (found[0]?.id ?? "");
        setDevice(initial);
        setExclusive(await invoke<boolean>("get_exclusive_mode"));
        setBitPerfect(await invoke<boolean>("get_bit_perfect"));
      } catch (e) { setStatus(`Audio setup error: ${String(e)}`); }
    })();
  }, []);

  const chooseDevice = async (id: string) => {
    setDevice(id);
    try { await invoke("set_exclusive_device", { device: id }); setStatus(`Output: ${id}`); }
    catch (e) { setStatus(`Device error: ${String(e)}`); }
  };

  const toggleExclusive = async () => {
    if (!device && !exclusive) { setStatus("Select an ALSA device first"); return; }
    const next = !exclusive;
    try {
      if (next) await invoke("set_exclusive_device", { device });
      await invoke("set_exclusive_mode", { enabled: next });
      setExclusive(next);
      if (!next) setBitPerfect(false);
      setStatus(next ? "Exclusive ALSA enabled" : "Normal audio output");
    } catch (e) { setStatus(`Exclusive ALSA error: ${String(e)}`); }
  };

  const toggleBitPerfect = async () => {
    if (!device && !bitPerfect) { setStatus("Select an ALSA device first"); return; }
    const next = !bitPerfect;
    try {
      if (next) await invoke("set_exclusive_device", { device });
      await invoke("set_bit_perfect", { enabled: next });
      setBitPerfect(next);
      if (next) setExclusive(true);
      setStatus(next ? "Bit-perfect mode enabled" : "Bit-perfect mode disabled");
    } catch (e) { setStatus(`Bit-perfect error: ${String(e)}`); }
  };

  const refreshSignalPath = async () => {
    try {
      const snapshot = await invoke<SignalPath>("refresh_signal_path");
      setSignalPath(snapshot);
    } catch (e) {
      setStatus(`Signal path error: ${String(e)}`);
    }
  };

  const localSource: LocalSource = {
    codec: "FLAC",
    bitDepth: signalPath?.decodedFormat?.startsWith("S16")
      ? 16
      : signalPath?.decodedFormat?.startsWith("S24")
        ? 24
        : signalPath?.decodedFormat?.startsWith("S32")
          ? 32
          : null,
    sampleRate: signalPath?.decodedRate ?? null,
  };

  const alteration = deriveAlterations(signalPath);
  const verdict = alteration.isPristine ? "PRISTINE" : "MODIFIED";
  const verdictColor = alteration.isPristine ? "text-green-400" : "text-amber-300";
  const ringColor = alteration.isPristine ? "border-green-400" : "border-amber-400";
  const sourceSummary = [
    localSource.codec,
    localSource.bitDepth && localSource.sampleRate
      ? `${localSource.bitDepth}/${(localSource.sampleRate / 1000).toFixed(localSource.sampleRate % 1000 === 0 ? 0 : 1)}`
      : null,
  ].filter(Boolean).join(" ");

  const openFlac = async () => {
    try {
      const selected = await open({ multiple: false, directory: false, filters: [{ name: "FLAC audio", extensions: ["flac"] }] });
      if (!selected || Array.isArray(selected)) return;
      setPath(selected); setStatus("Opening FLAC...");
      await invoke("play_local_track", { path: selected });
      setPlaying(true); setStatus("Playing local FLAC");
      window.setTimeout(() => void refreshSignalPath(), 700);
    } catch (e) { setPlaying(false); setStatus(`Playback error: ${String(e)}`); }
  };

  const togglePlayback = async () => {
    if (!path) return;
    try {
      if (playing) { await invoke("pause_track"); setPlaying(false); setStatus("Paused"); }
      else {
        const finished = await invoke<boolean>("is_track_finished");
        if (finished) await invoke("play_local_track", { path }); else await invoke("resume_track");
        setPlaying(true); setStatus("Playing");
      }
    } catch (e) { setStatus(`Playback error: ${String(e)}`); }
  };

  return <div className="flex h-full w-full items-center justify-center bg-th-background text-th-text">
    <main className="w-full max-w-2xl px-8 py-8">
      <div className="text-center"><div className="text-6xl font-semibold tracking-tight">SOFA</div><div className="mt-2 text-sm opacity-60">SOne FLAC Audio</div></div>
      <section className="mt-8 rounded-2xl bg-white/5 p-5">
        <div className="mb-3 text-xs uppercase tracking-widest opacity-50">Audio output</div>
        <label className="block text-sm opacity-70">Device</label>
        <select className="mt-2 w-full rounded-lg bg-black/30 p-3" value={device} onChange={(e)=>void chooseDevice(e.target.value)}>
          <option value="">Select ALSA device</option>{devices.map((d)=><option key={d.id} value={d.id}>{d.name} · {d.id}</option>)}
        </select>
        <div className="mt-4 flex gap-3">
          <button className={`rounded-full px-5 py-2 ${exclusive?'bg-th-accent text-black':'border border-white/20'}`} onClick={()=>void toggleExclusive()}>Exclusive ALSA: {exclusive?'ON':'OFF'}</button>
          <button className={`rounded-full px-5 py-2 ${bitPerfect?'bg-th-accent text-black':'border border-white/20'}`} onClick={()=>void toggleBitPerfect()}>Bit Perfect: {bitPerfect?'ON':'OFF'}</button>
        </div>
      </section>
      <section className="mt-5 rounded-2xl bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest opacity-50">Signal path</div>
          <button className="rounded-full border border-white/20 px-4 py-1.5 text-xs" onClick={()=>{ setSignalOpen(true); void refreshSignalPath(); }}>Open</button>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 ${ringColor}`}>
            <span className={`text-[10px] font-bold tracking-[0.12em] ${verdictColor}`}>{verdict}</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm text-th-text-primary">
              {alteration.isPristine
                ? alteration.losslessPromotion
                  ? `${displayFormat(signalPath?.decodedFormat)} → ${displayFormat(signalPath?.outputFormat)} · lossless promotion`
                  : "Source PCM reaches the DAC untouched"
                : "Audio path contains modifications"}
            </div>
            <div className="mt-1 text-xs font-mono opacity-55">{sourceSummary || "No active source"}</div>
            {dacDisplayName(signalPath) && <div className="mt-1 truncate text-xs opacity-55">{dacDisplayName(signalPath)}</div>}
          </div>
        </div>
      </section>
      <section className="mt-5 text-center">
        <button className="rounded-full bg-th-accent px-7 py-3 font-medium text-black" onClick={()=>void openFlac()}>Open FLAC</button>
        {path&&<div className="mt-5 rounded-2xl bg-white/5 p-5 text-left"><div className="text-xs uppercase tracking-widest opacity-50">Selected file</div><div className="mt-2 break-all text-sm">{path}</div><button className="mt-5 rounded-full border border-white/20 px-5 py-2" onClick={()=>void togglePlayback()}>{playing?'Pause':'Play'}</button></div>}
        <div className="mt-6 text-center text-sm opacity-60">{status}</div>
      </section>
    </main>
      {signalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={(e)=>{ if(e.target===e.currentTarget){setSignalOpen(false);setDetailsOpen(false);} }}>
          <div className="relative w-[680px] max-w-[94vw] overflow-hidden rounded-xl bg-th-elevated shadow-2xl">
            <button className="absolute right-3 top-3 z-20 h-8 w-8 rounded-full text-th-text-muted hover:bg-th-inset" onClick={()=>{setSignalOpen(false);setDetailsOpen(false);}}>×</button>
            {!detailsOpen ? (
              <div className="px-8 pb-7 pt-12 text-center">
                <div className={`mx-auto mb-7 flex h-44 w-44 items-center justify-center rounded-full border-[3px] ${ringColor}`}>
                  <span className={`text-[19px] font-bold tracking-[0.18em] ${verdictColor}`}>{verdict}</span>
                </div>
                <div className="mx-auto mb-4 max-w-[400px] text-[13px]">
                  {alteration.isPristine
                    ? alteration.losslessPromotion
                      ? `${displayFormat(signalPath?.decodedFormat)} → ${displayFormat(signalPath?.outputFormat)} — lossless promotion, every source bit preserved`
                      : "Source PCM reaches your DAC untouched"
                    : "Signal path modified — open the full path for details"}
                </div>
                <div className="mb-5 text-[11px] font-mono text-th-text-muted">{sourceSummary}{dacDisplayName(signalPath) ? ` · ${dacDisplayName(signalPath)}` : ""}</div>
                <button className="rounded-full border border-th-border-subtle bg-th-surface/60 px-4 py-2 text-[11px] tracking-wider" onClick={()=>setDetailsOpen(true)}>SEE THE FULL PATH</button>
              </div>
            ) : (
              <div className="pt-10">
                <FlowDiagramBody
                  sp={signalPath}
                  streamInfo={{ codec: "FLAC", bitDepth: localSource.bitDepth, sampleRate: localSource.sampleRate } as any}
                  currentTrack={null}
                  hideTrackHeader
                  onBack={()=>setDetailsOpen(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}
  </div>;
}
