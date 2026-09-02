import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

type AudioDevice = { id: string; name: string };

export default function LocalPlayer() {
  const [path, setPath] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [device, setDevice] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [bitPerfect, setBitPerfect] = useState(false);

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

  const openFlac = async () => {
    try {
      const selected = await open({ multiple: false, directory: false, filters: [{ name: "FLAC audio", extensions: ["flac"] }] });
      if (!selected || Array.isArray(selected)) return;
      setPath(selected); setStatus("Opening FLAC...");
      await invoke("play_local_track", { path: selected });
      setPlaying(true); setStatus("Playing local FLAC");
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
      <section className="mt-5 text-center">
        <button className="rounded-full bg-th-accent px-7 py-3 font-medium text-black" onClick={()=>void openFlac()}>Open FLAC</button>
        {path&&<div className="mt-5 rounded-2xl bg-white/5 p-5 text-left"><div className="text-xs uppercase tracking-widest opacity-50">Selected file</div><div className="mt-2 break-all text-sm">{path}</div><button className="mt-5 rounded-full border border-white/20 px-5 py-2" onClick={()=>void togglePlayback()}>{playing?'Pause':'Play'}</button></div>}
        <div className="mt-6 text-center text-sm opacity-60">{status}</div>
      </section>
    </main>
  </div>;
}
