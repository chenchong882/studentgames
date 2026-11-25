#!/usr/bin/env python3
"""Pre-record the built-in sentences visible in the word preview and sniper answer review."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess
import tempfile

audio = runpy.run_path(str(Path(__file__).with_name('generate-word-audio.py')))
ROOT = audio['ROOT']
DEST = ROOT / 'assets/example-audio'
MANIFEST = ROOT / 'data/example-audio-manifest.js'
VOICE_RECIPE = 'kokoro-v1.0/af_heart/us/misaki-0.9.4/speed-0.94/v1'


def load_sentences():
    script = """const fs = require('node:fs'), vm = require('node:vm');
global.window=global;
require('./data/wordbank.js');
require('./data/reading-examples.js');
require('./games/word-example.js');
const bank=WORD_BANK.getWords();
const html=fs.readFileSync('games/sniper.html','utf8');
const fallback=vm.runInNewContext(html.match(/const BUILTIN = (\\[[\\s\\S]*?\\n\\]);/)[1]);
const entries=bank.concat(fallback.map(w=>({word:w.word.toLowerCase(),example:w.example})));
for (const [word, reading] of READING_EXAMPLES) entries.push({word, sentence:reading.sentence});
console.log(JSON.stringify(entries.map(w=>({word:w.word, sentence:WordExample.text(w)}))));"""
    entries = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))
    unique = {}
    for entry in entries:
        sentence = entry['sentence']
        if not sentence or '{W}' in sentence:
            raise ValueError('Missing complete sentence for ' + entry['word'])
        if sentence in unique:
            continue
        digest = hashlib.sha256((VOICE_RECIPE + '\n' + sentence).encode()).hexdigest()[:16]
        word_slug = re.sub('[^a-z0-9]+', '-', entry['word'].lower()).strip('-') or 'sentence'
        unique[sentence] = {'word': entry['word'], 'spoken_text': sentence, 'slug': word_slug + '-' + digest}
    return unique


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, help='Kokoro v1.0 ONNX model')
    parser.add_argument('--voice', type=Path, help='af_heart voice weights')
    parser.add_argument('--tokens', type=Path, help='Kokoro tokenizer JSON')
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    entries = load_sentences()
    names = {s: item['slug'] + '.mp3' for s, item in sorted(entries.items())}
    if len(set(names.values())) != len(names):
        raise ValueError('Conflicting sentence filenames')
    manifest = {'voice': 'Kokoro af_heart', 'files': names}
    index = 'window.EXAMPLE_AUDIO_MANIFEST = ' + json.dumps(manifest, ensure_ascii=False, indent=2) + ';\n'
    pending = [item for sentence, item in entries.items() if not (DEST / names[sentence]).is_file()]
    print(f'{len(entries)} different sentences; {len(pending)} MP3s to generate.', flush=True)
    if args.dry_run:
        return
    if args.verify_only:
        if pending or not MANIFEST.is_file() or MANIFEST.read_text() != index:
            raise SystemExit('Sentence files or manifest are incomplete.')
        for filename in names.values():
            audio['check_mp3'](DEST / filename)
        print(f'{len(names)} MP3 files verified.')
        return
    if pending:
        if not all((args.model, args.voice, args.tokens)):
            parser.error('Provide --model, --voice and --tokens to generate missing recordings.')
        from kokoro_example_voice import Voice
        voice = Voice(model_path=args.model, voice_path=args.voice, vocab_path=args.tokens)
        DEST.mkdir(parents=True, exist_ok=True)
        for count, item in enumerate(pending, 1):
            target = DEST / (item['slug'] + '.mp3')
            partial = target.with_suffix('.partial.mp3')
            voice.render(item['spoken_text'], partial)
            audio['check_mp3'](partial)
            partial.replace(target)
            if count % 20 == 0 or count == len(pending):
                print(f'{count}/{len(pending)} new recordings saved', flush=True)
    temp = MANIFEST.with_suffix('.js.partial')
    temp.write_text(index)
    temp.replace(MANIFEST)


if __name__ == '__main__':
    # The teacher runs the generator on macOS. Allow only one writer to update the same recordings.
    import fcntl
    lock_id = hashlib.sha256(str(DEST).encode()).hexdigest()[:16]
    with (Path(tempfile.gettempdir()) / ('studentgames-example-' + lock_id + '.lock')).open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Sentence audio generation is already running.') from None
        main()
