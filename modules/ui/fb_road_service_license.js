import { t } from '../util/locale';


export function uiFBRoadServiceLicense() {

    return function(selection) {
        selection.append('a')
            .attr('href', 'https://wiki.openstreetmap.org/w/images/c/cf/FacebookRoadMaskLicense.pdf')
            .attr('target', '_blank')
            .text(t('fb_road_license'));
    };
}
