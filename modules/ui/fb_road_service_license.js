import { t } from '../util/locale';


export function uiFBRoadServiceLicense() {

    return function(selection) {
        selection.append('a')
            .attr('href', 'https://mapwith.ai/doc/license/MapWithAILicense.pdf')
            .attr('target', '_blank')
            .text(t('fb_road_license'));
    };
}
