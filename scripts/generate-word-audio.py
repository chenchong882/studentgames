#!/usr/bin/env python3
"""Build the checked-in Marin word audio without exposing an API key to the site.

Requires Python 3, Node, ffmpeg and ffprobe. Existing MP3s are reused.
--verify-only checks format/duration/level, not pronunciation or unwanted sounds;
new clips still need listening or independent audio-understanding quality checks.
  python3 scripts/generate-word-audio.py --key-file /path/outside/repo/key.txt
  python3 scripts/generate-word-audio.py --verify-only
The selected TTS snapshot is retained for consistency with the approved samples;
OpenAI has announced its shutdown for 2027-01-06. Existing audio files remain usable.
"""
import argparse
from array import array
import concurrent.futures
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/word-audio/marin'
MODEL = 'gpt-4o-mini-tts-2025-12-15'
VOICE = 'marin'
SPEED = 0.9
STYLE = ('Speak only the provided English word or phrase, exactly once. '
         'Use a natural General American accent and the warm, clear voice of a patient English teacher. '
         'Speak slightly more slowly than ordinary conversation, while keeping natural rhythm and word stress. '
         'Keep vowels natural; do not stretch sounds, split syllables, spell letters, whisper, sing, or add an introduction. '
         'For a multiword phrase, say it as one naturally connected phrase. '
         'No music, sound effects, translations, examples, or commentary.')
SETTINGS = {'model': MODEL, 'voice': VOICE, 'speed': SPEED, 'instructions': STYLE}
SETTINGS_HASH = hashlib.sha256(json.dumps(SETTINGS, sort_keys=True).encode()).hexdigest()


def load_words():
    script = """const fs=require('fs'),vm=require('vm'),ctx={};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(fs.readFileSync('data/wordbank.js','utf8'),ctx);
const words=[...new Map(ctx.WORD_BANK.getWords().map(w=>[w.word,w])).values()];
console.log(JSON.stringify(words.map(w=>({word:w.word,chinese:w.chinese,sentence:w.sentence.replace(/\\{W\\}/g,w.word)}))));"""
    words = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))
    names = set()
    for word in words:
        slug = re.sub(r'\s+', '-', word['word'].strip().lower())
        if not re.fullmatch('[a-z]+(?:-[a-z]+)*', slug) or slug in names:
            raise RuntimeError('Unsafe or duplicate word filename: ' + word['word'])
        names.add(slug)
        word['slug'] = slug
    return words


def check_mp3(path):
    info = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type',
        '-of', 'json', str(path)]))
    duration = float(info['format']['duration'])
    if not 0.15 < duration < 15 or not any(s.get('codec_name') == 'mp3' for s in info['streams']):
        raise RuntimeError('Invalid MP3: ' + path.name)
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', '24000', '-'])
    samples = array('h', pcm)
    peak = max(map(abs, samples)) if samples else 0
    if peak < 100:
        raise RuntimeError('Silent audio: ' + path.name)
    return {'seconds': round(duration, 4), 'bytes': path.stat().st_size,
            'peak_dbfs': round(20 * math.log10(peak / 32768), 2),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def wav_from_response(payload, path):
    if not payload.startswith(b'RIFF') or payload[8:12] != b'WAVE':
        raise RuntimeError('Speech endpoint did not return WAV audio.')
    with wave.open(io.BytesIO(payload), 'rb') as f:
        params = f.getparams()
        pcm = f.readframes(f.getnframes())
    frames = len(pcm) // (params.nchannels * params.sampwidth)
    if not 0.15 < frames / params.framerate < 15:
        raise RuntimeError('Unexpected generated audio duration.')
    # The streaming response can contain unknown-length RIFF headers.
    with wave.open(str(path), 'wb') as f:
        f.setparams(params._replace(nframes=frames))
        f.writeframes(pcm)


def generate(item, key, cache, stop):
    dest = DEST / (item['slug'] + '.mp3')
    if dest.exists():
        return {'word': item['word'], 'status': 'existing', **check_mp3(dest)}
    wav = cache / (item['slug'] + '.wav')
    state = 'recovered'
    if not wav.exists():
        if stop.is_set():
            raise RuntimeError('Generation stopped after another request failed.')
        context = ' Pronunciation context only, do not say this context: ' + item['sentence']
        if item['word'] == 'wind':
            context += ' Wind means moving air, the noun pronounced /wɪnd/, rhyming with pinned, not the verb /waɪnd/.'
        body = json.dumps({'model': MODEL, 'voice': VOICE, 'input': item['word'],
                           'instructions': STYLE + context, 'speed': SPEED, 'response_format': 'wav'}).encode()
        req = urllib.request.Request('https://api.openai.com/v1/audio/speech', body,
                                     {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=120) as response:
                    payload = response.read()
                wav_from_response(payload, wav)
                state = 'generated'
                break
            except urllib.error.HTTPError as exc:
                try:
                    code = json.loads(exc.read()).get('error', {}).get('code')
                except Exception:
                    code = None
                if exc.code in (429, 500, 502, 503, 504) and code != 'insufficient_quota' and attempt < 3:
                    time.sleep(5 * 2 ** attempt)
                    continue
                stop.set()
                # Do not print server messages; they can contain key fragments.
                raise RuntimeError(f'OpenAI HTTP {exc.code}; code={code}') from None
            except urllib.error.URLError as exc:
                stop.set()
                raise RuntimeError('Network request failed: ' + type(exc.reason).__name__) from None
    partial = dest.with_suffix('.partial.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-codec:a', 'libmp3lame',
                    '-b:a', '128k', str(partial)], check=True)
    stats = check_mp3(partial)
    partial.replace(dest)
    return {'word': item['word'], 'status': state, **stats}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--key-file', type=Path, help='Local key file outside the repository, or use OPENAI_API_KEY.')
    parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'studentgames-word-audio-wav')
    parser.add_argument('--sample-dir', type=Path, help='Reuse the approved voice-samples directory.')
    parser.add_argument('--workers', type=int, default=3, choices=range(1, 5))
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    words = load_words()
    DEST.mkdir(parents=True, exist_ok=True)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = DEST.parent / 'metadata.json'
    if metadata_path.exists() and json.loads(metadata_path.read_text()).get('settings_sha256') != SETTINGS_HASH:
        raise SystemExit('Existing audio settings differ. Use a new output version instead of mixing voices/settings.')
    reused = []
    if args.sample_dir:
        samples = json.loads((args.sample_dir / 'words.json').read_text())
        settings = json.loads((args.sample_dir / 'generation-settings.json').read_text())
        if settings['model'] != MODEL or settings['speed'] != SPEED or settings['instructions'] != STYLE:
            raise SystemExit('Approved sample settings do not match.')
        lookup = {w['word']: w for w in words}
        for sample in samples:
            item = lookup[sample['word']]
            source = args.sample_dir / VOICE / (sample['id'] + '.mp3')
            dest = DEST / (item['slug'] + '.mp3')
            if not dest.exists():
                check_mp3(source)
                shutil.copyfile(source, dest)
                shutil.copyfile(source.with_suffix('.wav'), args.cache_dir / (item['slug'] + '.wav'))
                reused.append(item['word'])
    key = ''
    if not args.verify_only and any(not (DEST / (w['slug'] + '.mp3')).exists() for w in words):
        key = args.key_file.read_text().strip() if args.key_file else os.environ.get('OPENAI_API_KEY', '').strip()
        if not key.startswith('sk-') or any(c.isspace() for c in key):
            raise SystemExit('Set OPENAI_API_KEY or pass a plain local key file with --key-file.')
    stop = threading.Event()
    results = []
    if args.verify_only:
        for item in words:
            results.append({'word': item['word'], 'status': 'verified', **check_mp3(DEST / (item['slug'] + '.mp3'))})
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(generate, item, key, args.cache_dir, stop) for item in words]
            try:
                for future in concurrent.futures.as_completed(futures):
                    row = future.result()
                    results.append(row)
                    if len(results) % 10 == 0 or len(results) == len(words):
                        print(json.dumps({'finished': len(results), 'total': len(words), 'last_word': row['word']}), flush=True)
            except BaseException:
                stop.set()
                for future in futures:
                    future.cancel()
                raise
    rows = {row['word']: row for row in results}
    files = {item['word']: item['slug'] + '.mp3' for item in words}
    manifest = {'version': 'marin-0.9-v1', 'voice': VOICE, 'speed': SPEED, 'words': files}
    (ROOT / 'data/word-audio-manifest.js').write_text(
        '// Pre-generated AI pronunciation. No API key or online synthesis is used by the browser.\n'
        'window.WORD_AUDIO_MANIFEST = ' + json.dumps(manifest, ensure_ascii=False, indent=2) + ';\n')
    metadata = {**SETTINGS, 'settings_sha256': SETTINGS_HASH, 'version': manifest['version'],
                'ai_generated': True, 'word_count': len(words), 'format': 'mp3', 'bitrate_kbps': 128,
                'duration_seconds': round(sum(r['seconds'] for r in results), 3),
                'total_bytes': sum(r['bytes'] for r in results),
                'source': 'data/wordbank.js / WORD_BANK.getWords()',
                'files': [{**item, **{k: v for k, v in rows[item['word']].items() if k != 'status'}} for item in words]}
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    summary = {'count': len(words), 'reused_approved_samples': len(reused),
               'generated_this_run': sum(r['status'] == 'generated' for r in results),
               'duration_seconds': metadata['duration_seconds'], 'total_bytes': metadata['total_bytes']}
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
