#!/usr/bin/env python3
"""Сборка питч-видео SAUAT: озвучка ElevenLabs + кадры демо + ffmpeg.

Использование:
  python scripts/video/build-pitch.py --video docs/demo/demo.mp4 --out SAUAT_pitch.mp4          # с озвучкой
  python scripts/video/build-pitch.py --video docs/demo/demo.mp4 --out test.mp4 --dry-run       # заглушки без ключа

Ключ ElevenLabs читается из файла (по умолчанию C:\\Users\\ertai\\Desktop\\SAUAT_VIDEO\\elevenlabs_key.txt)
или из переменной окружения ELEVENLABS_API_KEY. Ключ нигде не печатается и не сохраняется в проекте.
"""
import argparse, json, os, subprocess, sys, tempfile, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_KEY_FILE = Path.home() / "Desktop" / "SAUAT_VIDEO" / "elevenlabs_key.txt"
VOICES = {"female": "XrExE9yKIg1WjnnlVkGX", "male": "nPczCjzI2devNBz1zQrb"}  # Matilda, Brian (премейд, доступны на бесплатном тарифе)
GAP = 0.45          # пауза между фразами, сек
MAX_SECONDS = 175   # запас до лимита 3:00
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Команда упала: {' '.join(cmd[:3])}...\n{r.stderr[-1500:]}")
    return r.stdout


def duration(path):
    return float(run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).strip())


def read_key(key_file):
    if os.environ.get("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"].strip()
    p = Path(key_file)
    key = p.read_text(encoding="utf-8").strip() if p.exists() else ""
    if not key:
        sys.exit(f"Ключ не найден: положите его в {p} (одна строка) или задайте ELEVENLABS_API_KEY.")
    return key


def tts(text, key, voice_id, out_path):
    body = json.dumps({
        "text": text, "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.55, "similarity_boost": 0.75, "style": 0.1, "use_speaker_boost": True},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        data=body, headers={"xi-api-key": key, "content-type": "application/json", "accept": "audio/mpeg"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out_path.write_bytes(resp.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs вернул HTTP {e.code}: {e.read()[:300].decode('utf-8', 'ignore')}")


def silence(seconds, out_path):
    run([FFMPEG, "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", f"{seconds:.2f}", "-q:a", "9", str(out_path)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--narration", default=str(HERE / "narration.json"))
    ap.add_argument("--voice", choices=list(VOICES), default="female")
    ap.add_argument("--voice-id", default="")
    ap.add_argument("--key-file", default=str(DEFAULT_KEY_FILE))
    ap.add_argument("--dry-run", action="store_true", help="без ElevenLabs: тишина по оценке длительности")
    ap.add_argument("--preview", type=int, default=0, help="озвучить только первые N фраз (проверка голоса)")
    ap.add_argument("--work", default="", help="папка для озвучки (сохраняется, чтобы не тратить символы повторно)")
    ap.add_argument("--reuse", action="store_true", help="не озвучивать заново фразы, уже лежащие в --work")
    ap.add_argument("--audio-only", action="store_true", help="только озвучка и timings.json, без видео")
    ap.add_argument("--video-offset", type=float, default=0.0, help="пропустить N секунд в начале видео (задержка запуска записи)")
    ap.add_argument("--no-stretch", action="store_true", help="не менять скорость видео (запись уже подогнана под озвучку)")
    args = ap.parse_args()

    segments = json.loads(Path(args.narration).read_text(encoding="utf-8"))["segments"]
    if args.preview:
        segments = segments[: args.preview]
    key = None if args.dry_run else read_key(args.key_file)
    voice_id = args.voice_id or VOICES[args.voice]
    tmp = Path(args.work) if args.work else Path(tempfile.mkdtemp(prefix="sauat_video_"))
    tmp.mkdir(parents=True, exist_ok=True)

    parts, total, timings = [], 0.0, []
    gap_file = tmp / "gap.mp3"
    silence(GAP, gap_file)
    for seg in segments:
        f = tmp / f"{seg['id']}.mp3"
        if args.reuse and f.exists() and f.stat().st_size > 0:
            pass
        elif args.dry_run:
            silence(max(2.0, len(seg["text"].split()) / 2.4), f)
        else:
            tts(seg["text"], key, voice_id, f)
        d = duration(f)
        timings.append({"id": seg["id"], "start": round(total, 3), "dur": round(d, 3)})
        total += d + GAP
        parts += [f, gap_file]
        print(f"{seg['id']}: {d:.1f} c")
    print(f"Озвучка всего: {total:.1f} c")
    if total > MAX_SECONDS and not args.preview:
        sys.exit(f"Озвучка {total:.0f} c длиннее лимита {MAX_SECONDS} c: сократите narration.json.")

    listfile = tmp / "list.txt"
    listfile.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
    narration = tmp / "narration.mp3"
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(listfile), "-c:a", "libmp3lame", "-q:a", "3", str(narration)])
    n_dur = duration(narration)
    (tmp / "timings.json").write_text(json.dumps({"gap": GAP, "total": n_dur, "segments": timings}, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.audio_only:
        print(f"Только озвучка: {narration} ({n_dur:.1f} c), тайминги: {tmp / 'timings.json'}")
        return

    v_dur = duration(args.video) - args.video_offset
    ratio = n_dur / v_dur  # >1: видео нужно растянуть, <1: ускорить
    ratio = 1.0 if args.no_stretch else min(max(ratio, 0.8), 1.4)
    out = Path(args.out)
    vf = f"setpts={ratio:.4f}*PTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p"
    run([FFMPEG, "-y", "-ss", f"{args.video_offset:.2f}", "-i", str(args.video), "-i", str(narration), "-filter:v", vf,
         "-map", "0:v:0", "-map", "1:a:0", "-t", f"{n_dur + 0.3:.2f}", "-c:v", "libx264", "-crf", "28", "-preset", "medium",
         "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)])
    final = duration(out)
    size = out.stat().st_size / 1_048_576
    print(f"Готово: {out} — {final:.1f} c, {size:.1f} МБ")
    if final > 180 or size > 20:
        print("ВНИМАНИЕ: выход за лимит формы (≤3:00 и ≤20 МБ).")


if __name__ == "__main__":
    main()
