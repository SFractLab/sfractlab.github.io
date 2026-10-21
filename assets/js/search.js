/* Site search over the generated index in search-index.js (window.ATLAS_SEARCH).

   Every whitespace-separated term must occur in a section's title or text,
   ignoring case and Unicode compatibility forms. Matches in titles rank
   first. Results open in a panel that closes when a result is chosen or the
   reader clicks or tabs elsewhere. Progressive enhancement only: pages and
   navigation work without JavaScript, and the search box stays hidden. */
(() => {
  'use strict';
  const search = document.getElementById('site-search');
  const input = document.getElementById('site-query');
  const results = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  if (!search || !input || !results || !status || !Array.isArray(window.ATLAS_SEARCH)) return;
  const panel = results.closest('.search-panel') || results;

  const MAX_RESULTS = 16;
  const SNIPPET_LEAD = 65;     // characters shown before the first term
  const SNIPPET_LENGTH = 230;

  const normalize = text => text.normalize('NFKD').toLowerCase();
  const entries = window.ATLAS_SEARCH.map(entry => ({
    ...entry,
    searchable: normalize(entry.title + ' ' + entry.text),
    searchableTitle: normalize(entry.title),
  }));

  // Entries containing every term, best first: a term found in the title
  // counts 10, one found only in the text counts 1. Ties keep index order.
  function find(terms) {
    return entries
      .filter(entry => terms.every(term => entry.searchable.includes(term)))
      .map(entry => ({
        entry,
        score: terms.reduce((sum, term) => sum + (entry.searchableTitle.includes(term) ? 10 : 1), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .map(match => match.entry);
  }

  // Index in `text` of the first occurrence of the normalized `term`, or −1.
  // Normalizing can turn one character into several (… becomes ...), so each
  // normalized character remembers the position of the character it came from.
  function indexInText(text, term) {
    let normalized = '';
    const origins = [];
    let position = 0;
    for (const character of text) {
      const piece = normalize(character);
      for (let i = 0; i < piece.length; i++) origins.push(position);
      normalized += piece;
      position += character.length;
    }
    const index = normalized.indexOf(term);
    return index < 0 ? -1 : origins[index];
  }

  // A stretch of the section text around the first occurrence of `term`.
  function snippet(text, term) {
    const start = Math.max(0, indexInText(text, term) - SNIPPET_LEAD);
    const end = start + SNIPPET_LENGTH;
    return (start ? '…' : '') + text.slice(start, end) + (text.length > end ? '…' : '');
  }

  function update() {
    panel.hidden = false;
    results.replaceChildren();
    const query = normalize(input.value.trim());
    if (query.length < 2) {
      status.textContent = query ? 'Type at least two characters.' : '';
      return;
    }
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = find(terms);
    status.textContent = matches.length
      ? `${matches.length} matching sections. Showing up to ${MAX_RESULTS}.`
      : 'No matching section. Try a shorter term, such as “orbit”, “cardioid” or “Julia”.';
    for (const entry of matches.slice(0, MAX_RESULTS)) {
      const link = document.createElement('a');
      link.href = entry.url;
      link.textContent = entry.title;
      const text = document.createElement('p');
      text.textContent = snippet(entry.text, terms[0]);
      results.append(link, text);
    }
  }

  // The panel is hidden rather than emptied, so a chosen link still works and
  // returning to the field shows the same results again.
  const close = () => { panel.hidden = true; };

  search.hidden = false;
  input.addEventListener('input', update);
  input.addEventListener('focus', () => { panel.hidden = false; });
  results.addEventListener('click', event => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('pointerdown', event => {
    if (!search.contains(event.target)) close();
  });
  search.addEventListener('focusout', event => {
    if (event.relatedTarget && !search.contains(event.relatedTarget)) close();
  });
  search.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    input.value = '';
    update();
    input.blur();
  });
})();
