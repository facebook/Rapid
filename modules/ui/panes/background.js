import { t } from '../../core/localizer';
import { uiPane } from '../pane';
import { uiSectionBackgroundDisplayOptions } from '../sections/background_display_options';
import { uiSectionBackgroundList } from '../sections/background_list';
import { uiSectionBackgroundOffset } from '../sections/background_offset';
import { uiSectionGridDisplayOptions } from '../sections/grid_display_options';
import { uiSectionOverlayList } from '../sections/overlay_list';
// import { uiSectionReactContainer } from '../sections/react_container';

export function uiPaneBackground(context) {
    var backgroundPane = uiPane('background', context)
        .key(t('background.key'))
        .label(t.html('background.title'))
        .description(t.html('background.description'))
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
