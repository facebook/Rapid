import _throttle from 'lodash-es/throttle';
import { select as d3_select } from 'd3-selection';


export function uiImageryLabel(context) {


    function imageLabel(data) {
        d3_select('#imagery-label')
            .html(data[0].name());
    }


    function update() {
        imageLabel([context.background().baseLayerSource()]);
    }


    return function() {
        context.background()
            .on('change.label', update);
        update();
    };
}
