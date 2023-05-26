import { uiPane } from '../pane';
import { uiSectionBackgroundDisplayOptions } from '../sections/background_display_options';
import { uiSectionBackgroundList } from '../sections/background_list';
import { uiSectionBackgroundOffset } from '../sections/background_offset';
import { uiSectionGridDisplayOptions } from '../sections/grid_display_options';
import { uiSectionOverlayList } from '../sections/overlay_list';
// import { uiSectionReactContainer } from '../sections/react_container';


export function uiPaneBackground(context) {
  var backgroundPane = uiPane(context, 'background')
    .key(context.t('background.key'))
    .label(context.tHtml('background.title'))
    .description(context.tHtml('background.description'))
    .iconName('rapid-icon-layers')
    .sections([
      uiSectionBackgroundList(context),
      // uiSectionReactContainer(context),
      uiSectionOverlayList(context),
      uiSectionGridDisplayOptions(context),
      uiSectionBackgroundDisplayOptions(context),
      uiSectionBackgroundOffset(context)
    ]);

  return backgroundPane;
}
