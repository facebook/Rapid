import { uiPane } from '../pane.js';

import { uiSectionValidationIssues } from '../sections/validation_issues.js';
import { uiSectionValidationOptions } from '../sections/validation_options.js';
import { uiSectionValidationRules } from '../sections/validation_rules.js';
import { uiSectionValidationStatus } from '../sections/validation_status.js';


export function uiPaneIssues(context) {
  const l10n = context.systems.l10n;

  return uiPane(context, 'issues')
    .key(l10n.t('issues.key'))
    .label(l10n.t('issues.title'))
    .description(l10n.t('issues.title'))
    .iconName('rapid-icon-alert')
    .sections([
      uiSectionValidationOptions(context),
      uiSectionValidationStatus(context),
      uiSectionValidationIssues(context, 'issues-errors', 'error'),
      uiSectionValidationIssues(context, 'issues-warnings', 'warning'),
      uiSectionValidationRules(context)
    ]);
}
