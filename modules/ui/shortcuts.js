import { select as d3_select } from 'd3-selection';
import { utilArrayUniq } from '@rapid-sdk/util';

import { uiIcon } from './icon.js';
import { uiCmd } from './cmd.js';
import { uiModal } from './modal.js';
import { utilDetect } from '../util/detect.js';


// This is a UI component for displaying the keyboard shortcuts (when the user presses '?')
// It is a modified `uiModal` component.
// We load the data from 'shortcuts.json' to populate this screen.
//
// +------------------------------+
// | Keyboard Shortcuts         X |   `.shortcuts-heading`
// +------------------------------+
// |    Browsing Editing Tools    |   `.nav-bar` containing `.nav-items`
// |                              |
// |  +--column--+  +--column--+  |  \
// |  | row      |  | row      |  |  |-- `.shortcuts-section`
// |  | row      |  | row      |  |  |    contains multiple `.shortcut-tab` (one visible at a time)
// |  | row      |  | row      |  |  |     each of those contains multiple `.shortcut-column`
// |  +----------+  +----------+  |  |      each of those contains multiple `.shortcut-row`
// +------------------------------+  /
//

export function uiShortcuts(context) {
  const dataloader = context.systems.dataloader;
  const l10n = context.systems.l10n;

  const detected = utilDetect();
  let _activeTab = 0;
  let _selection = null;
  let _modal = null;
  let _dataShortcuts = null;


  //
  function render() {
    if (!_modal || !_dataShortcuts) return;  // called too early

    _modal.select('.modal')
      .classed('modal-shortcuts', true);

    const content = _modal.select('.content');

    // enter
    content
      .selectAll('.shortcuts-heading')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'shortcuts-heading modal-section')
      .append('h3')
      .text(l10n.t('shortcuts.title'));

    const wrapperEnter = content
      .selectAll('.shortcuts-wrapper')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'shortcuts-wrapper modal-section');

    const navBarEnter = wrapperEnter
      .append('div')
      .attr('class', 'nav-bar');

    navBarEnter
      .selectAll('.nav-item')
      .data(_dataShortcuts)
      .enter()
      .append('a')
      .attr('class', 'nav-item')
      .attr('href', '#')
      .on('click', (d3_event, d) => {
        d3_event.preventDefault();
        _activeTab = _dataShortcuts.indexOf(d);
        render();
      })
      .append('span')
      .text(d => l10n.t(d.text));


    const shortcutsSectionEnter = wrapperEnter
      .append('div')
      .attr('class', 'shortcuts-section');

    const tabsEnter = shortcutsSectionEnter
      .selectAll('.shortcut-tab')
      .data(_dataShortcuts)
      .enter()
      .append('div')
      .attr('class', d => `shortcut-tab shortcut-tab-${d.tab}`);

    const columnsEnter = tabsEnter
      .selectAll('.shortcut-column')
      .data(d => d.columns)
      .enter()
      .append('table')
      .attr('class', 'shortcut-column');

    const rowsEnter = columnsEnter
      .selectAll('.shortcut-row')
      .data(d => d.rows)
      .enter()
      .append('tr')
      .attr('class', 'shortcut-row');


    // Rows without a "shortcuts" property are the subsection headings
    const sectionRows = rowsEnter
      .filter(d => !d.shortcuts);

    // Each "section" row contains:
    // +---`td.shortcut-keys`--+--`td.shortcut-desc`---+
    // +      (empty)          |  h3 section heading   |
    // +-----------------------+-----------------------+

    sectionRows
      .append('td');  // empty

    sectionRows
      .append('td')
      .attr('class', 'shortcut-section')
      .append('h3')
      .text(d => l10n.t(d.text));


    // Rows with a "shortcuts" property are the actual shortcuts
    const shortcutRows = rowsEnter
      .filter(d => d.shortcuts);

    // Each "shortcut" row contains:
    // +---`td.shortcut-keys`--+--`td.shortcut-desc`---+
    // +      modifiers, keys  |  description          |
    // +-----------------------+-----------------------+

    const shortcutKeys = shortcutRows
      .append('td')
      .attr('class', 'shortcut-keys');

    const modifierKeys = shortcutKeys
      .filter(d => d.modifiers);

    modifierKeys
      .selectAll('kbd.modifier')
      .data(d => {
        if (detected.os === 'win' && d.text === 'shortcuts.editing.commands.redo') {
          return ['⌃'];
        } else if (detected.os !== 'mac' && d.text === 'shortcuts.browsing.display_options.fullscreen') {
          return [];
        } else {
          return d.modifiers;
        }
      })
      .enter()
      .each((d, i, nodes) => {
        const selection = d3_select(nodes[i]);
        selection
          .append('kbd')
          .attr('class', 'modifier')
          .text(d => uiCmd.display(context, d));

//        selection
//          .append('span')
//          .text('+');
      });


    shortcutKeys
      .selectAll('kbd.shortcut')
      .data(d => {
        let arr = d.shortcuts;
        if (detected.os === 'win' && d.text === 'shortcuts.editing.commands.redo') {
          arr = ['Y'];
        } else if (detected.os !== 'mac' && d.text === 'shortcuts.browsing.display_options.fullscreen') {
          arr = ['F11'];
        }

        // replace translations
        arr = arr.map(s => {
          return uiCmd.display(context, s.indexOf('.') !== -1 ? l10n.t(s) : s);
        });

        return utilArrayUniq(arr).map(s => {
          return {
            shortcut: s,
            separator: d.separator,
            suffix: d.suffix
          };
        });
      })
      .enter()
      .each((d, i, nodes) => {
        const selection = d3_select(nodes[i]);
        const val = d.shortcut.toLowerCase();
        const icon = val.match(/^\{(.*)\}$/);

        if (icon) {
          const altText = icon[1].replace('interaction-', '').replace(/\-/g, ' ');
          selection
           .call(uiIcon(`#rapid-${icon[1]}`, 'operation', altText));

        } else {
          selection
            .append('kbd')
            .attr('class', 'shortcut')
            .text(d => d.shortcut);
        }

        if (i < nodes.length - 1) {
          selection
            .append('span')
            .text(d.separator || '\u00a0' + l10n.t('shortcuts.or') + '\u00a0');
          }
      });


    shortcutKeys
      .filter(d => d.gesture)
      .each((d, i, nodes) => {
        const selection = d3_select(nodes[i]);

//        selection
//          .append('span')
//          .text('+');

        selection
          .append('span')
          .attr('class', 'gesture')
          .text(d => l10n.t(d.gesture));
      });


    shortcutRows
      .append('td')
      .attr('class', 'shortcut-desc')
      .text(d => d.text ? l10n.t(d.text) : '\u00a0');


    // Update
    const wrapper = content.selectAll('.shortcuts-wrapper');

    wrapper.selectAll('.nav-item')
      .classed('active', (d, i) => i === _activeTab);

    wrapper.selectAll('.shortcut-tab')
      .style('display', (d, i) => i === _activeTab ? 'flex' : 'none');
  }



  function shortcuts(selection) {
    _selection = selection;  // capture parent

    context.keybinding()
      .on([l10n.t('shortcuts.toggle.key'), '?'], () => shortcuts.toggle());
  }


  //
  shortcuts.show = function() {
    const otherShowing = context.container().selectAll('.shaded > div:not(.modal-shortcuts)').size();
    if (otherShowing) return;  // some other modal is already showing

    const isShowing = context.container().selectAll('.shaded > div.modal-shortcuts').size();
    if (isShowing) {  // remove any existing
      shortcuts.hide();
    }
    _modal = uiModal(_selection);

    dataloader.getDataAsync('shortcuts')
      .then(data => {
        _dataShortcuts = data;
        render();
      })
      .catch(e => console.error(e));  // eslint-disable-line
  };


  //
  shortcuts.hide = function() {
    if (!_modal) return;
    _modal.close();
    _modal = null;
  };


  //
  shortcuts.toggle = function() {
    const otherShowing = context.container().selectAll('.shaded > div:not(.modal-shortcuts)').size();
    if (otherShowing) return;  // some other modal is already showing

    const isShowing = context.container().selectAll('.shaded > div.modal-shortcuts').size();
    if (isShowing) {
      shortcuts.hide();
    } else {
      shortcuts.show();
    }
  };


  return shortcuts;
}
