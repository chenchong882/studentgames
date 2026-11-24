"""Offline US English Kokoro sentence recording (Misaki, spaCy, ONNX Runtime, LAME)."""
import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np
import onnxruntime as ort
from misaki.en import G2P
from misaki.espeak import EspeakFallback
from spacy.util import is_package


# Misaki markup selects the intended reading in these specific contexts.
SPOKEN_FORMS = {
    'The tiger has orange fur with black stripes and lives in the jungle.':
        'The tiger has orange fur with black stripes and [lives](/lˈɪvz/) in the jungle.',
    'She bowed to her teacher before the martial arts class started.':
        'She [bowed](/bˈWd/) to her teacher before the martial arts class started.',
}

# These classroom recordings need slightly more space for consonant clusters.
SENTENCE_SPEEDS = {
    'He used a plunger to clear the blocked toilet.': 0.86,
    'She cut the small brown kiwi in half and the inside was bright green.': 0.86,
    'The tall lighthouse flashed its bright light to help ships stay safe.': 0.91,
}


class Voice:
    def __init__(self, model_path, voice_path, vocab_path, *, threads=2, speed=0.94):
        if not is_package('en_core_web_sm'):
            raise RuntimeError('Install en_core_web_sm for spaCy before starting offline generation.')
        self.g2p = G2P(trf=False, british=False, fallback=EspeakFallback(british=False))
        self.vocab = json.loads(Path(vocab_path).read_text())['model']['vocab']
        self.styles = np.fromfile(voice_path, dtype='<f4').reshape(-1, 256)
        self.speed = speed
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(model_path), options, providers=['CPUExecutionProvider'])

    def phonemes(self, sentence):
        phones, words = self.g2p(SPOKEN_FORMS.get(sentence, sentence))
        missing = [word.text for word in words if word.phonemes is None]
        if missing:
            raise ValueError(f'Missing pronunciation for {missing} in {sentence!r}')
        unsupported = set(phones).difference(self.vocab)
        if unsupported:
            raise ValueError(f'Unsupported phonemes {unsupported} in {sentence!r}')
        if not 0 < len(phones) < len(self.styles):
            raise ValueError(f'Sentence is outside the supported Kokoro token length: {sentence!r}')
        return phones

    def render(self, sentence, mp3_path):
        phones = self.phonemes(sentence)
        inputs = {
            'input_ids': np.array([[0, *(self.vocab[ch] for ch in phones), 0]], dtype=np.int64),
            'style': self.styles[len(phones)][None, :],
            'speed': np.array([SENTENCE_SPEEDS.get(sentence, self.speed)], dtype=np.float32),
        }
        # A single inference pass preserves phrasing and stress across the entire sentence.
        wave = self.session.run(None, inputs)[0].ravel()
        if wave.size == 0 or not np.isfinite(wave).all():
            raise ValueError(f'Invalid waveform for {sentence!r}')
        peak = np.abs(wave).max()
        if peak <= 0.001:
            raise ValueError(f'Silent recording for {sentence!r}')
        samples = np.round(wave * (0.84 * 32767 / peak)).astype('<i2')
        mp3_path = Path(mp3_path)
        mp3_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=mp3_path.parent) as scratch:
            tmp_mp3 = Path(scratch) / 'recording.mp3'
            subprocess.run([
                'lame', '--silent', '-r', '-s', '24', '--bitwidth', '16', '--signed',
                '--little-endian', '-m', 'm', '-b', '64', '-', str(tmp_mp3),
            ], input=samples.tobytes(), check=True)
            tmp_mp3.replace(mp3_path)
