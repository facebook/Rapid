import { t } from '../core/localizer';


export function uiRapidServiceLicense() {
  return function(selection) {
    selection.append('a')
      .attr('href', 'https://mapwith.ai/doc/license/MapWithAILicense.pdf')
      .attr('target', '_blank')
      .text(t('rapid_feature_license'));
  };
}
