import { t } from '../util/locale';


export function uiAiFeatureServiceLicense() {

    return function(selection) {
        selection.append('a')
            .attr('href', 'https://mapwith.ai/doc/license/MapWithAILicense.pdf')
            .attr('target', '_blank')
            .text(t('fb_feature_license'));
    };
}
