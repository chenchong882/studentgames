/* Match reviewed sentences to the actual words available in this lesson or daily set. */
window.ClozeBank = (() => {
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const reviews = new Map();
  const catalog = window.CLOZE_OPTIONS;
  for(const [word, meaning, example, options] of catalog?.sentences || []){
    const allowed = new Set();
    for(const name of options){
      for(const item of catalog.groups[name] || [name]) allowed.add(item);
    }
    const rule = {meaning, example, allowed, cloze:WordExample.clozeTemplate({word, sentence:example})};
    if(!reviews.has(word)) reviews.set(word, []);
    reviews.get(word).push(rule);
  }

  function build(pool, {builtin = false} = {}){
    const questions = new Map();
    const entries = new Map();
    for(const entry of pool){
      const key = normalize(entry.word || entry.en);
      const meaning = String(entry.chinese || entry.meaning || entry.zh || '').trim();
      if(!reviews.get(key)?.some(rule => rule.meaning === meaning) || entries.has(key)) continue;
      const avoid = Array.isArray(entry.avoidWith) ? entry.avoidWith.map(normalize) : [];
      entries.set(key, {entry, meaning, avoid:new Set(avoid)});
    }
    for(const [key, {entry, meaning, avoid}] of entries){
      const rules = reviews.get(key);
      const current = WordExample.text({word:key, sentence:entry.example || entry.sentence});
      let rule = rules.find(r => r.meaning === meaning && normalize(r.example) === normalize(current));
      if(!rule && builtin){
        const reading = window.READING_EXAMPLES?.get(key);
        rule = rules.find(r => r.meaning === meaning && r.example === reading?.sentence);
      }
      // An unfamiliar or edited lesson sentence has no reviewed distractors.
      if(!rule || !rule.cloze) continue;
      const choices = [];
      const meanings = new Set([meaning]);
      const blocked = new Set([key, ...avoid]);
      for(const otherKey of rule.allowed){
        const other = entries.get(otherKey);
        if(!other || blocked.has(otherKey) || other.avoid.has(key) || meanings.has(other.meaning)) continue;
        if(choices.some(choice => other.avoid.has(normalize(choice.word || choice.en)))) continue;
        choices.push(other.entry);
        meanings.add(other.meaning);
        for(const conflict of other.avoid) blocked.add(conflict);
      }
      if(choices.length) questions.set(entry, {example:rule.example, cloze:rule.cloze, choices});
    }
    return questions;
  }
  return {build};
})();
