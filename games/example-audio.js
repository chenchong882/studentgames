/* Select the recording for the exact sentence that the student sees. */
window.ExampleAudio = (() => {
  const directory = new URL('../assets/example-audio/', document.currentScript.src);
  let active = null;

  function filenameFor(entry) {
    const files = window.EXAMPLE_AUDIO_MANIFEST?.files;
    if (!entry || !files) return '';
    const sentence = WordExample.text(entry);
    return Object.prototype.hasOwnProperty.call(files, sentence) ? files[sentence] : '';
  }

  function stop(button) {
    if (active && (!button || active.button === button)) WordAudio.stop();
  }

  function play(entry, button) {
    const filename = filenameFor(entry);
    if (!filename) return false;
    stop();
    const request = { button };
    active = request;
    button.textContent = '重播例句';
    return WordAudio.playClip(new URL(filename, directory).href, {
      onend(reason) {
        if (active !== request) return;
        active = null;
        button.textContent = reason === 'error' ? '播放失敗，點此重試' : '聽例句';
      }
    }, 45000);
  }

  // WordAudio handles pagehide and visibility changes for the shared audio element.
  return { has: entry => Boolean(filenameFor(entry)), play, stop };
})();
