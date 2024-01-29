import { uiPane } from '../pane.js';
import { uiSectionBackgroundDisplayOptions } from '../sections/background_display_options.js';
import { uiSectionBackgroundList } from '../sections/background_list.js';
import { uiSectionBackgroundOffset } from '../sections/background_offset.js';
import { uiSectionGridDisplayOptions } from '../sections/grid_display_options.js';
import { uiSectionOverlayList } from '../sections/overlay_list.js';
// import { uiSectionReactContainer } from '../sections/react_container.jsx';


export function uiPaneBackground(context) {
  const l10n = context.systems.l10n;

  return uiPane(context, 'background')
    .key(l10n.t('background.key'))
    .label(l10n.t('background.title'))
    .description(l10n.t('background.description'))
    .iconName('rapid-icon-layers')
    .sections([
      uiSectionBackgroundList(context),
      // uiSectionReactContainer(context),
      uiSectionOverlayList(context),
      uiSectionGridDisplayOptions(context),
      uiSectionBackgroundDisplayOptions(context),
      uiSectionBackgroundOffset(context)
    ]);
}
