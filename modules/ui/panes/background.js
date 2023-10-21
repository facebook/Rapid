import { uiPane } from '../pane';
import { uiSectionBackgroundDisplayOptions } from '../sections/background_display_options';
import { uiSectionBackgroundList } from '../sections/background_list';
import { uiSectionBackgroundOffset } from '../sections/background_offset';
import { uiSectionGridDisplayOptions } from '../sections/grid_display_options';
import { uiSectionOverlayList } from '../sections/overlay_list';
// import { uiSectionReactContainer } from '../sections/react_container';


export function uiPaneBackground(context) {
  const l10n = context.systems.l10n;

  return uiPane(context, 'background')
    .key(l10n.t('background.key'))
    .label(l10n.tHtml('background.title'))
    .description(l10n.tHtml('background.description'))
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
