import { t } from '../../core/localizer';
import { uiPane } from '../pane';
import { uiSectionPrivacy } from '../sections/privacy';
import { uiSectionMapInteractionOptions } from '../sections/map_interaction_options';

export function uiPanePreferences(context) {
  return uiPane('preferences', context)
    .key(t('preferences.key'))
    .label(t.html('preferences.title'))
    .description(t.html('preferences.description'))
    .iconName('fas-user-cog')
    .sections([
      uiSectionPrivacy(context),
      uiSectionMapInteractionOptions(context)
    ]);
}
