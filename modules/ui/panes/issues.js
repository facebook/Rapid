import { t } from '../../core/localizer';
import { uiPane } from '../pane';

import { uiSectionValidationIssues } from '../sections/validation_issues';
import { uiSectionValidationOptions } from '../sections/validation_options';
import { uiSectionValidationRules } from '../sections/validation_rules';
import { uiSectionValidationStatus } from '../sections/validation_status';

export function uiPaneIssues(context) {
  return uiPane('issues', context)
    .key(t('issues.key'))
    .label(t.html('issues.title'))
    .description(t.html('issues.title'))
    .iconName('rapid-icon-alert')
    .sections([
      uiSectionValidationOptions(context),
      uiSectionValidationStatus(context),
      uiSectionValidationIssues(context, 'issues-errors', 'error'),
      uiSectionValidationIssues(context, 'issues-warnings', 'warning'),
      uiSectionValidationRules(context)
    ]);
}
