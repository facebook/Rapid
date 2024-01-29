import { utilDetect } from '../util/detect.js';


// Throughout Rapid we specify key combos in MacOS style.
// This helper converts a key combo to the key combo for the system the user is on,
// - on MacOS, no change
// - on Windows/Linux, convert Command to Control, for example, ⌘Z -> ⌃Z
//
// Watch out: The '⌃' symbol U+2303 is not the same as the carat symbol '^' U+005E
// see https://wincent.com/wiki/Unicode_representations_of_modifier_keys
//
export let uiCmd = function(combo) {
  const detected = utilDetect();

  if (detected.os === 'mac') {
    return combo;
  }

  if (detected.os === 'win') {
    if (combo === '⌘⇧Z') return '⌃Y';  // special handling for Redo on Windows
  }

  return combo.replace('⌘', '⌃');
};


// Return a display-focused string for a given key character.
// On Mac, we include the symbols, on other systems, we only include the word.
// For example, '⌘' -> '⌘ Cmd'
// Important:  This is intended to be called with a single character, not a key combo.
uiCmd.display = function(context, char) {
  if (char.length !== 1) return char;  // Ignore if multiple chars, like "F11"

  const l10n = context.systems.l10n;
  const detected = utilDetect();
  const mac = (detected.os === 'mac');
  const replacements = {
    '⌘': mac ? '⌘ ' + l10n.t('shortcuts.key.cmd')    : l10n.t('shortcuts.key.ctrl'),
    '⇧': mac ? '⇧ ' + l10n.t('shortcuts.key.shift')  : l10n.t('shortcuts.key.shift'),
    '⌥': mac ? '⌥ ' + l10n.t('shortcuts.key.option') : l10n.t('shortcuts.key.alt'),
    '⌃': mac ? '⌃ ' + l10n.t('shortcuts.key.ctrl')   : l10n.t('shortcuts.key.ctrl'),
    '⌫': mac ? '⌫ ' + l10n.t('shortcuts.key.delete') : l10n.t('shortcuts.key.backspace'),
    '⌦': mac ? '⌦ ' + l10n.t('shortcuts.key.del')    : l10n.t('shortcuts.key.del'),
    '↖': mac ? '↖ ' + l10n.t('shortcuts.key.pgup')   : l10n.t('shortcuts.key.pgup'),
    '↘': mac ? '↘ ' + l10n.t('shortcuts.key.pgdn')   : l10n.t('shortcuts.key.pgdn'),
    '⇞': mac ? '⇞ ' + l10n.t('shortcuts.key.home')   : l10n.t('shortcuts.key.home'),
    '⇟': mac ? '⇟ ' + l10n.t('shortcuts.key.end')    : l10n.t('shortcuts.key.end'),
    '↵': mac ? '⏎ ' + l10n.t('shortcuts.key.return') : l10n.t('shortcuts.key.enter'),
    '⎋': mac ? '⎋ ' + l10n.t('shortcuts.key.esc')    : l10n.t('shortcuts.key.esc'),
    '☰': mac ? '☰ ' + l10n.t('shortcuts.key.menu')  : l10n.t('shortcuts.key.menu'),
  };

  return replacements[char] || char;
};
