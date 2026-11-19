#!/usr/bin/env python3
"""Build the checked-in Marin word audio without exposing an API key to the site.

Requires Python 3, Node, ffmpeg and ffprobe. Existing MP3s are reused.
--verify-only checks format/duration/level, not pronunciation or unwanted sounds;
new clips still need listening or independent audio-understanding quality checks.
  python3 scripts/generate-word-audio.py --key-file /path/outside/repo/key.txt
  python3 scripts/generate-word-audio.py --words-file exam.json --dry-run
  python3 scripts/generate-word-audio.py --words-file exam.json --key-file /path/outside/repo/key.txt
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
import unicodedata
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
HETERONYMS = {'wind', 'read', 'record', 'present', 'live', 'lead', 'tear', 'bow', 'close',
              'object', 'produce', 'refuse', 'desert', 'bass', 'minute', 'content',
              'conduct', 'contract', 'convert', 'invalid', 'perfect', 'permit',
              'project', 'rebel', 'reject', 'resume', 'subject', 'suspect', 'use'}
CASE_SENSITIVE_ABBREVIATIONS = {'us', 'it', 'am', 'pm', 'id', 'led', 'ai', 'un'}


def normalize(value):
    return ' '.join(str(value or '').strip().lower().split())


def unpack_words(data):
    if isinstance(data, dict) and 'payload' in data:
        return unpack_words(data['payload'])
    if isinstance(data, dict) and 'words' in data:
        return unpack_words(data['words'])
    if isinstance(data, (str, dict)):
        return [data]
    if isinstance(data, list):
        return data
    raise ValueError('Words JSON must contain a word, word object, array, or a words/payload wrapper.')


def normalize_item(raw):
    if isinstance(raw, str):
        raw = {'word': raw}
    if not isinstance(raw, dict):
        raise ValueError('Each entry must be a string or word object.')
    def field(*names):
        for name in names:
            value = raw.get(name)
            if value is not None and value != '':
                if not isinstance(value, str):
                    raise ValueError(name + ' must be a string.')
                if value.strip():
                    return value.strip()
        return ''
    spoken = ' '.join(field('word', 'en', 'phrase').split())
    if not spoken:
        raise ValueError('Entry has no nonempty word/en/phrase.')
    return {'word': normalize(spoken), 'spoken_text': spoken,
            'chinese': field('chinese', 'zh', 'meaning', 'translation', 'definition'),
            'sentence': field('sentence', 'example').replace('{W}', spoken),
            'pos': field('pos', 'part_of_speech')}


def pos_key(value):
    value = normalize(value).rstrip('.')
    return {'n': 'noun', '名詞': 'noun', 'v': 'verb', '動詞': 'verb',
            'adj': 'adjective', '形容詞': 'adjective', '單字': ''}.get(value, value)


def conflict_reason(old, new, same_batch=False):
    key = new['word']
    old_spoken = old.get('spoken_text', old['word'])
    new_spoken = new.get('spoken_text', key)
    old_meaning, new_meaning = normalize(old.get('chinese')), normalize(new.get('chinese'))
    old_sentence, new_sentence = normalize(old.get('sentence')), normalize(new.get('sentence'))
    if key == 'read' and old_sentence and new_sentence and old_sentence != new_sentence:
        return 'read_context_may_change_pronunciation'
    if (key in CASE_SENSITIVE_ABBREVIATIONS and old_spoken != new_spoken
            and any(re.fullmatch(r'[A-Z]{2,}', s) for s in (old_spoken, new_spoken))
            and not (old_meaning and old_meaning == new_meaning)):
        return 'capitalization_may_change_pronunciation'
    old_pos, new_pos = pos_key(old.get('pos')), pos_key(new.get('pos'))
    if key in HETERONYMS and not same_batch:
        if not new_meaning and not new_pos:
            return 'heteronym_needs_meaning_or_part_of_speech'
        if new_pos and not old_pos and not (old_meaning and old_meaning == new_meaning):
            return 'cannot_verify_heteronym_part_of_speech_supply_meaning'
        if new_meaning and not old_meaning and not (old_pos and old_pos == new_pos):
            return 'existing_heteronym_context_missing'
    if old_meaning and new_meaning and old_meaning != new_meaning and (same_batch or key in HETERONYMS):
        return 'different_meanings_for_one_audio_key'
    if key in HETERONYMS and old_pos and new_pos and old_pos != new_pos:
        return 'different_parts_of_speech_for_heteronym'
    return ''


def deduplicate(raw_words, source):
    words, reviews, invalid = {}, [], []
    for index, raw in enumerate(raw_words):
        try:
            item = normalize_item(raw)
        except ValueError as exc:
            invalid.append({'source': source, 'index': index, 'error': str(exc)})
            continue
        old = words.get(item['word'])
        if old:
            reason = conflict_reason(old, item, same_batch=True)
            if reason:
                reviews.append({'word': item['word'], 'reason': reason, 'source': source,
                                'old': old, 'new': item})
            # Keep the first pronunciation; only fill missing context from equivalent entries.
            for name in ('chinese', 'sentence', 'pos'):
                if not old.get(name):
                    old[name] = item[name]
        else:
            words[item['word']] = item
    return words, reviews, invalid


def read_registry():
    metadata_path, manifest_path = DEST.parent / 'metadata.json', ROOT / 'data/word-audio-manifest.js'
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    manifest = {}
    if manifest_path.exists():
        match = re.search(r'window\.WORD_AUDIO_MANIFEST\s*=\s*(\{.*\})\s*;', manifest_path.read_text(), re.S)
        if not match:
            raise ValueError('Cannot parse the existing word-audio manifest.')
        manifest = json.loads(match.group(1))
    errors, registry = [], {}
    if bool(metadata) != bool(manifest):
        errors.append({'reason': 'manifest_and_metadata_must_both_exist'})
    if metadata and metadata.get('settings_sha256') != SETTINGS_HASH:
        errors.append({'reason': 'existing_audio_settings_differ'})
    if manifest and (manifest.get('voice') != VOICE or manifest.get('speed') != SPEED):
        errors.append({'reason': 'manifest_voice_or_speed_differs'})
    rows = {}
    for row in metadata.get('files', []):
        key = normalize(row.get('word'))
        if not key or key in rows:
            errors.append({'word': key, 'reason': 'duplicate_or_empty_metadata_key'})
        rows[key] = row
    filenames = set()
    for key, filename in manifest.get('words', {}).items():
        row = rows.get(key)
        reason = ''
        if key != normalize(key) or not row:
            reason = 'manifest_key_missing_from_metadata'
        elif not isinstance(filename, str) or Path(filename).name != filename or filename.startswith('.') or not filename.endswith('.mp3'):
            reason = 'unsafe_registered_filename'
        elif filename in filenames:
            reason = 'duplicate_registered_filename'
        elif row.get('slug') + '.mp3' != filename:
            reason = 'metadata_filename_mismatch'
        elif not (DEST / filename).is_file():
            reason = 'registered_file_missing_restore_from_git'
        elif hashlib.sha256((DEST / filename).read_bytes()).hexdigest() != row.get('sha256'):
            reason = 'registered_file_hash_mismatch'
        if reason:
            errors.append({'word': key, 'file': filename, 'reason': reason})
        else:
            registry[key] = row
        if isinstance(filename, str):
            filenames.add(filename)
    for key in rows.keys() - manifest.get('words', {}).keys():
        errors.append({'word': key, 'reason': 'metadata_key_missing_from_manifest'})
    if DEST.exists():
        for path in DEST.glob('*.mp3'):
            if path.name not in filenames:
                errors.append({'file': path.name, 'reason': 'orphan_mp3_not_in_registry'})
    return metadata, manifest, registry, errors


def build_plan(raw_input, raw_builtin, registry, manifest):
    incoming, reviews, invalid = deduplicate(raw_input, 'input')
    builtin, builtin_reviews, builtin_invalid = deduplicate(raw_builtin, 'builtin')
    reviews += builtin_reviews
    invalid += builtin_invalid
    planned = {key: dict(row) for key, row in registry.items()}
    for source, words in (('builtin', builtin), ('input', incoming)):
        for key, item in words.items():
            if key in planned:
                reason = conflict_reason(planned[key], item)
                if reason:
                    reviews.append({'word': key, 'reason': reason, 'source': source,
                                    'old': planned[key], 'new': item})
                # Existing descriptions and QA metadata remain attached to the existing recording.
            else:
                planned[key] = dict(item)
                if key in HETERONYMS and not item.get('chinese') and not pos_key(item.get('pos')):
                    reviews.append({'word': key, 'reason': 'heteronym_needs_meaning_or_part_of_speech',
                                    'source': source, 'new': item})
    pending = {key: item for key, item in planned.items() if key not in registry}
    bases = {}
    for key in pending:
        ascii_key = unicodedata.normalize('NFKD', key).encode('ascii', 'ignore').decode()
        base = re.sub('[^a-z0-9]+', '-', ascii_key).strip('-')[:64].strip('-') or 'word'
        bases[key] = base
    used = set(manifest.get('words', {}).values())
    for key in sorted(pending):
        base = bases[key]
        collision = list(bases.values()).count(base) > 1 or base + '.mp3' in used
        slug = base + '-' + hashlib.sha256(key.encode()).hexdigest()[:12] if collision else base
        if slug + '.mp3' in used:
            slug = base + '-' + hashlib.sha256(key.encode()).hexdigest()
        if slug + '.mp3' in used:
            raise ValueError('Cannot allocate a unique filename for ' + key)
        pending[key]['slug'] = slug
        used.add(slug + '.mp3')
    report = {'raw_count': len(raw_input), 'unique_count': len(incoming),
              'existing_count': sum(key in registry for key in incoming),
              'pending_count': len(pending), 'library_existing_count': len(registry),
              'library_planned_count': len(planned), 'pending_words': list(pending),
              'existing_words': [key for key in incoming if key in registry],
              'review_required': reviews, 'conflict_words': sorted({r['word'] for r in reviews}),
              'invalid_entries': invalid}
    return pending, report


def cache_identity(item):
    context = {'settings': SETTINGS_HASH, 'word': item['word'],
               'spoken_text': item.get('spoken_text', item['word']),
               'sentence': item.get('sentence', ''), 'meaning': item.get('chinese', ''), 'pos': item.get('pos', '')}
    return hashlib.sha256(json.dumps(context, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def load_words():
    script = """const fs=require('fs'),vm=require('vm'),ctx={};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(fs.readFileSync('data/wordbank.js','utf8'),ctx);
const words=ctx.WORD_BANK.getWords();
console.log(JSON.stringify(words.map(w=>({word:w.word,chinese:w.chinese,sentence:w.sentence.replace(/\\{W\\}/g,w.word)}))));"""
    words = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))
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
        raise RuntimeError('Refusing to reuse or overwrite an unregistered destination: ' + dest.name)
    wav = cache / (item['slug'] + '-' + cache_identity(item) + '.wav')
    state = 'recovered'
    if not wav.exists():
        if stop.is_set():
            raise RuntimeError('Generation stopped after another request failed.')
        context = ' Pronunciation context only, do not say this context: ' + item.get('sentence', '')
        if item.get('chinese'):
            context += ' Intended meaning: ' + item['chinese'] + '.'
        if item.get('pos'):
            context += ' Part of speech: ' + item['pos'] + '.'
        if item['word'] == 'wind' and normalize(item.get('chinese')) in {'風', '风', 'moving air', 'wind (moving air)'}:
            context += ' Wind means moving air, the noun pronounced /wɪnd/, rhyming with pinned, not the verb /waɪnd/.'
        body = json.dumps({'model': MODEL, 'voice': VOICE, 'input': item.get('spoken_text', item['word']),
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
    parser.add_argument('--words-file', type=Path, help='UTF-8 JSON words to add to the existing library.')
    parser.add_argument('--dry-run', action='store_true', help='Report the plan without keys, API calls, directories or writes.')
    parser.add_argument('--key-file', type=Path, help='Local key file outside the repository, or use OPENAI_API_KEY.')
    parser.add_argument('--cache-dir', type=Path, help='WAV cache directory (default: system temporary directory).')
    parser.add_argument('--sample-dir', type=Path, help='Reuse matching approved samples only; unrelated sample words are ignored.')
    parser.add_argument('--workers', type=int, default=3, choices=range(1, 5))
    parser.add_argument('--verify-only', action='store_true', help='Read-only verification of registered MP3 files.')
    args = parser.parse_args()
    try:
        metadata, manifest, registry, registry_errors = read_registry()
        builtin = load_words()
        raw_input = unpack_words(json.loads(args.words_file.read_text(encoding='utf-8-sig'))) if args.words_file else builtin
        pending, report = build_plan(raw_input, builtin, registry, manifest)
    except (ValueError, OSError, TypeError) as exc:
        raise SystemExit('Cannot prepare audio plan: ' + str(exc)) from None
    report['registry_errors'] = registry_errors
    blocked = bool(report['review_required'] or report['invalid_entries'] or registry_errors)
    report['blocked'] = blocked
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    # Both read-only routes exit before reading keys, creating folders or changing registry files.
    if args.dry_run:
        return 2 if blocked else 0
    if blocked:
        raise SystemExit('Resolve review_required / invalid_entries / registry_errors before generating audio.')
    if args.verify_only:
        for key, row in registry.items():
            check_mp3(DEST / manifest['words'][key])
        print(json.dumps({'verified_existing_files': len(registry), 'pending_new_words': len(pending),
                          'read_only': True, 'pronunciation_quality_verified': False}))
        return 0
    if not pending:
        print(json.dumps({'generated_this_run': 0, 'existing_files_unchanged': len(registry)}))
        return 0
    if args.cache_dir is None:
        args.cache_dir = Path(tempfile.gettempdir()) / 'studentgames-word-audio-wav'
    key = ''
    # A matching sample or WAV cache may satisfy a word without an API call; no key is needed then.
    sample_sources = {}
    if args.sample_dir:
        samples = unpack_words(json.loads((args.sample_dir / 'words.json').read_text()))
        settings = json.loads((args.sample_dir / 'generation-settings.json').read_text())
        if settings['model'] != MODEL or settings['speed'] != SPEED or settings['instructions'] != STYLE:
            raise SystemExit('Approved sample settings do not match.')
        for sample in samples:
            sample_key = normalize(sample.get('word', '')) if isinstance(sample, dict) else normalize(sample)
            if sample_key not in pending:
                continue
            if not isinstance(sample, dict) or not re.fullmatch(r'[A-Za-z0-9_-]+', str(sample.get('id', ''))):
                raise SystemExit('Invalid sample identifier.')
            sample_item = normalize_item(sample)
            if conflict_reason(sample_item, pending[sample_key], same_batch=True):
                raise SystemExit('Approved sample context conflicts for ' + sample_key)
            source = args.sample_dir / VOICE / (sample['id'] + '.mp3')
            check_mp3(source)
            sample_sources[sample_key] = source
    needs_api = any(k not in sample_sources and not (args.cache_dir / (item['slug'] + '-' + cache_identity(item) + '.wav')).exists()
                    for k, item in pending.items())
    if needs_api:
        key = args.key_file.read_text().strip() if args.key_file else os.environ.get('OPENAI_API_KEY', '').strip()
        if not key.startswith('sk-') or any(c.isspace() for c in key):
            raise SystemExit('Set OPENAI_API_KEY or pass a plain local key file with --key-file.')
    DEST.mkdir(parents=True, exist_ok=True)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = DEST.parent / 'metadata.json'
    manifest_path = ROOT / 'data/word-audio-manifest.js'
    manifest = dict(manifest) if manifest else {'version': 'marin-0.9-v1', 'voice': VOICE, 'speed': SPEED, 'words': {}}
    manifest['words'] = dict(manifest['words'])
    metadata = dict(metadata) if metadata else {**SETTINGS, 'settings_sha256': SETTINGS_HASH,
        'version': manifest['version'], 'ai_generated': True, 'format': 'mp3', 'bitrate_kbps': 128,
        'source': 'data/wordbank.js / WORD_BANK.getWords()', 'files': []}
    metadata['files'] = list(metadata['files'])
    metadata['pending_review_words'] = list(metadata.get('pending_review_words', []))
    results = []
    def save_entry(item, result):
        row = {**item, **{k: v for k, v in result.items() if k != 'status'}, 'quality_status': 'needs_review'}
        metadata['files'].append(row)
        manifest['words'][item['word']] = item['slug'] + '.mp3'
        if item['word'] not in metadata['pending_review_words']:
            metadata['pending_review_words'].append(item['word'])
        metadata['word_count'] = len(metadata['files'])
        metadata['duration_seconds'] = round(sum(r['seconds'] for r in metadata['files']), 3)
        metadata['total_bytes'] = sum(r['bytes'] for r in metadata['files'])
        # Save each completed addition, so a later failed request does not cause paid retries.
        metadata_tmp = metadata_path.with_suffix('.json.partial')
        manifest_tmp = manifest_path.with_suffix('.js.partial')
        metadata_tmp.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
        manifest_tmp.write_text('// Pre-generated AI pronunciation. No API key or online synthesis is used by the browser.\n'
                                + 'window.WORD_AUDIO_MANIFEST = ' + json.dumps(manifest, ensure_ascii=False, indent=2) + ';\n')
        metadata_tmp.replace(metadata_path)
        manifest_tmp.replace(manifest_path)
        results.append(result)
    for word, source in sample_sources.items():
        item = pending[word]
        dest = DEST / (item['slug'] + '.mp3')
        if dest.exists():
            raise SystemExit('Unregistered destination appeared: ' + dest.name)
        shutil.copyfile(source, dest)
        save_entry(item, {'word': word, 'status': 'sample', **check_mp3(dest)})
    stop = threading.Event()
    jobs = [item for word, item in pending.items() if word not in sample_sources]
    saved = set(sample_sources)
    failure = None
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(generate, item, key, args.cache_dir, stop): item for item in jobs}
        try:
            for future in concurrent.futures.as_completed(futures):
                row = future.result()
                save_entry(futures[future], row)
                saved.add(row['word'])
                print(json.dumps({'finished': len(results), 'total': len(pending), 'last_word': row['word']}), flush=True)
        except BaseException as exc:
            failure = exc
            stop.set()
            for future in futures:
                future.cancel()
    if failure is not None:
        # In-flight requests may finish while the pool shuts down. Register each
        # successful result before reporting the original error, avoiding orphan
        # MP3s and duplicate paid generation on the next invocation.
        for future, item in futures.items():
            if item['word'] in saved or future.cancelled():
                continue
            try:
                row = future.result()
            except BaseException:
                continue
            save_entry(item, row)
            saved.add(item['word'])
        raise failure
    print(json.dumps({'added_words': len(results), 'library_word_count': metadata['word_count'],
                      'generated_this_run': sum(r['status'] == 'generated' for r in results),
                      'reused_samples': len(sample_sources), 'pending_review_words': metadata['pending_review_words']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
