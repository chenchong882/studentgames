/* Show a lesson sentence with its target word in bold. */
window.WordExample = (() => {
  function render(container, entry) {
    const word = String(entry.word || entry.en || '').trim();
    const sentence = String(entry.sentence || entry.example || '').trim();
    container.textContent = '';
    if (!sentence || !word) return false;

    // Templates mark the intended answer explicitly. For complete sentences,
    // match whole words or phrases and keep the spelling used in the sentence.
    const template = sentence.includes('{W}');
    let pattern = /\{W\}/g;
    if (!template) {
      const literal = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp('(^|[^a-z0-9_])(' + literal + ')(?![a-z0-9_])', 'gi');
    }
    let cursor = 0;
    for (const match of sentence.matchAll(pattern)) {
      const start = match.index + (match[1] || '').length;
      const strong = document.createElement('strong');
      const spelling = match[2] || word;
      strong.textContent = template && start === 0 ? spelling[0].toUpperCase() + spelling.slice(1) : spelling;
      container.append(sentence.slice(cursor, start), strong);
      cursor = match.index + match[0].length;
    }
    container.append(sentence.slice(cursor));
    return true;
  }
  return { render };
})();
