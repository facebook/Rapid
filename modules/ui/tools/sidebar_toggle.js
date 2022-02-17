import { t, localizer } from '../../core/localizer';
import { svgIcon } from '../../svg';
import { uiTooltip } from '../tooltip';

export function uiToolSidebarToggle(context) {
  const isRTL = (localizer.textDirection() === 'rtl');

  let tool = {
    id: 'sidebar_toggle',
    label: t.html('toolbar.inspect')
  };

  tool.install = function(selection) {
    selection
      .append('button')
      .attr('class', 'bar-button')
      .on('click', () => context.ui().sidebar.toggle())
      .call(uiTooltip()
        .placement('bottom')
        .title(t.html('sidebar.tooltip'))
        .keys([t('sidebar.key')])
        .scrollContainer(context.container().select('.top-toolbar'))
      )
      .call(svgIcon('#iD-icon-sidebar-' + (isRTL ? 'right' : 'left')));
  };

  return tool;
}
