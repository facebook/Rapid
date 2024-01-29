import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';


export function uiToolSidebarToggle(context) {
  const l10n = context.systems.l10n;
  const ui = context.systems.ui;

  let tool = {
    id: 'sidebar_toggle',
    label: l10n.t('toolbar.inspect')
  };

  tool.install = function(selection) {
    selection
      .append('button')
      .attr('class', 'bar-button')
      .on('click', () => ui.sidebar.toggle())
      .call(uiTooltip(context)
        .placement('bottom')
        .title(l10n.t('sidebar.tooltip'))
        .shortcut(l10n.t('sidebar.key'))
        .scrollContainer(context.container().select('.top-toolbar'))
      )
      .call(uiIcon('#rapid-icon-sidebar-' + (l10n.isRTL() ? 'right' : 'left')));
  };

  return tool;
}
