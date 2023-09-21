import { uiPane } from '../pane';
import { uiSectionPrivacy } from '../sections/privacy';
import { uiSectionMapInteractionOptions } from '../sections/map_interaction_options';


export function uiPanePreferences(context) {
  const l10n = context.systems.l10n;

  return uiPane(context, 'preferences')
    .key(l10n.t('preferences.key'))
    .label(l10n.tHtml('preferences.title'))
    .description(l10n.tHtml('preferences.description'))
    .iconName('fas-user-cog')
    .sections([
      uiSectionPrivacy(context),
      uiSectionMapInteractionOptions(context)
    ]);
}
