import { uiPane } from '../pane';
import { uiSectionPrivacy } from '../sections/privacy';
import { uiSectionMapInteractionOptions } from '../sections/map_interaction_options';


export function uiPanePreferences(context) {
  return uiPane(context, 'preferences')
    .key(context.t('preferences.key'))
    .label(context.tHtml('preferences.title'))
    .description(context.tHtml('preferences.description'))
    .iconName('fas-user-cog')
    .sections([
      uiSectionPrivacy(context),
      uiSectionMapInteractionOptions(context)
    ]);
}
