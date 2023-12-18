import { utilDetect } from '../util/detect';


// Translate a MacOS key command into the appropriate Windows/Linux equivalent.
// For example, ⌘Z -> Ctrl+Z
export let uiCmd = function(code) {
  const detected = utilDetect();

  if (detected.os === 'mac') {
    return code;
  }

  if (detected.os === 'win') {
    if (code === '⌘⇧Z') return 'Ctrl+Y';
  }

  const replacements = {
    '⌘': 'Ctrl',
    '⇧': 'Shift',
    '⌥': 'Alt',
    '⌫': 'Backspace',
    '⌦': 'Delete'
  };

  let result = '';
  for (let i = 0; i < code.length; i++) {
    if (code[i] in replacements) {
      result += replacements[code[i]] + (i < code.length - 1 ? '+' : '');
    } else {
      result += code[i];
    }
  }

  return result;
};


// return a display-focused string for a given keyboard code
uiCmd.display = function(context, code) {
  if (code.length !== 1) return code;
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

  return replacements[code] || code;
};
