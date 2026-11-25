/* Format lesson examples for reading, recordings and fill-in-the-blank questions. */
window.WordExample = (() => {
  const wordOf = entry => String(entry.word || entry.en || '').trim();
  const sentenceOf = entry => String(entry.sentence || entry.example || '').trim();
  const spellingAt = (word, position) => position === 0 ? word[0].toUpperCase() + word.slice(1) : word;
  function text(entry) {
    const word = wordOf(entry);
    return word && sentenceOf(entry).replace(/\{W\}/g, (_, position) => spellingAt(word, position));
  }
  function wordPattern(word) {
    const literal = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9_])(' + literal + ')(?![a-z0-9_])', 'gi');
  }
  function clozeTemplate(entry) {
    const word = wordOf(entry);
    const sentence = sentenceOf(entry);
    if (!word || !sentence) return '';
    if (sentence.includes('{W}')) return sentence;
    const template = sentence.replace(wordPattern(word), '$1{W}');
    return template === sentence ? '' : template;
  }
  function render(container, entry) {
    const word = wordOf(entry);
    const sentence = sentenceOf(entry);
    container.textContent = '';
    if (!sentence || !word) return false;

    // Templates mark the intended answer explicitly. For complete sentences,
    // match whole words or phrases and keep the spelling used in the sentence.
    const template = sentence.includes('{W}');
    const pattern = template ? /\{W\}/g : wordPattern(word);
    let cursor = 0;
    for (const match of sentence.matchAll(pattern)) {
      const start = match.index + (match[1] || '').length;
      const strong = document.createElement('strong');
      strong.textContent = match[2] || spellingAt(word, start);
      container.append(sentence.slice(cursor, start), strong);
      cursor = match.index + match[0].length;
    }
    container.append(sentence.slice(cursor));
    return true;
  }
  return { render, text, clozeTemplate };
})();
