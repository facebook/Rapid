import { uiPane } from '../pane';

import { uiSectionValidationIssues } from '../sections/validation_issues';
import { uiSectionValidationOptions } from '../sections/validation_options';
import { uiSectionValidationRules } from '../sections/validation_rules';
import { uiSectionValidationStatus } from '../sections/validation_status';


export function uiPaneIssues(context) {
  const l10n = context.systems.l10n;

  return uiPane(context, 'issues')
    .key(l10n.t('issues.key'))
    .label(l10n.tHtml('issues.title'))
    .description(l10n.tHtml('issues.title'))
    .iconName('rapid-icon-alert')
    .sections([
      uiSectionValidationOptions(context),
      uiSectionValidationStatus(context),
      uiSectionValidationIssues(context, 'issues-errors', 'error'),
      uiSectionValidationIssues(context, 'issues-warnings', 'warning'),
      uiSectionValidationRules(context)
    ]);
}
