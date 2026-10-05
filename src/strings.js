/*
 * Every piece of built-in text Action Required shows, by language. Nothing in
 * the components or logic is hard-coded copy: add a key here, then use t('key').
 * Editor-typed text lives in the translatable Wording settings instead; a blank
 * Wording field falls back to the matching key below.
 *
 * To add a language, copy the "en" block, translate the values, keep the keys.
 */
export const STRINGS = {
  en: {
    // Wording defaults (blank Wording settings use these)
    buttonLabel: 'Read and acknowledge',
    readLabel: 'Read, {minutes} min',
    dueLabel: 'Read and acknowledge by {date}',
    acknowledgedLabel: 'Acknowledged',
    emptyText: 'You have no items that require acknowledgment.',
    showMore: 'Show more',
    showLess: 'Show less',

    // Rows
    untitled: 'Untitled',
    done: 'Done',
    open: 'Open',
    taskBy: 'By {date}',
    listLabel: 'Things to read and acknowledge',
    newTab: '(opens in a new tab)',
    markDone: 'Mark {title} as done',

    // Editor views of the empty cases (end users see nothing)
    setupTitle: 'Pick a Space',
    setupText: 'Choose the Space under Content, Spaces or topics, or switch What to list to Waiting for me.',
    setupCurrentText: 'This widget cannot tell which Space it is on, so Current Space shows nothing. Pick the Space by name under Content, Spaces or topics.',
    setupAllText: 'All Spaces cannot be listed page by page. Pick the Spaces or topics under Content, or switch What to list to Waiting for me.',
    nothingTitle: 'Nothing to list here',
    nothingText: 'No published pages in this Space match the settings, so the widget is hidden for everyone.',
    nothingTagText: 'No published pages in this Space carry the tag {tag}, so the widget is hidden for everyone.',
    noAccessText: 'Hidden for people who cannot read this Space.',
    editorOnly: 'Only editors see this.',

    // Errors: quiet for everyone, with the detail for editors
    errorText: "Couldn't load. Try again.",
    errorEditorDetail: 'Details for editors: {detail}',
    retry: 'Try again',

    loadingLabel: 'Loading what is waiting for you',
    diagnostics: 'Diagnostic mode',

    // Date format for due dates ("Fri 9 Oct")
    dateLocale: 'en-GB'
  }
};

let current = STRINGS.en;

/** Pick the strings for a language code such as "en", "en-US" or "nl_NL". English is the fallback. */
export function pickStrings(locale) {
  const code = String(locale || 'en').toLowerCase().replace('_', '-');
  const base = code.split('-')[0];
  const key = STRINGS[code] ? code : (STRINGS[base] ? base : 'en');
  current = STRINGS[key];
  return key;
}

/** t('key', { name: 'Alex' }), English as the fallback for a missing key. */
export function t(key, vars) {
  const text = current[key] != null ? current[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
}
