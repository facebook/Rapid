
export function PixiOsm(projection, context, dispatch) {
    var enabled = true;

    function drawOsm(selection, _featureCache) {
        // For the OSM Layer, there's nothing to do. All OSM rendering is handled by the map.js file.
    }


    function _getLayer() {
        let layer = null;
        if (context.pixi)  layer = context.pixi.stage.getChildByName('osm');
        return layer;
    }


    function showLayer() {
        var layer = _getLayer();
        layer.visible = true;
        dispatch.call('change');
    }


    function hideLayer() {
        var layer = _getLayer();
        layer.visible = false;
        dispatch.call('change');
    }


    drawOsm.enabled = function(val) {
        if (!arguments.length) return enabled;
        enabled = val;

        if (enabled) {
            showLayer();
        } else {
            hideLayer();
        }

        dispatch.call('change');
        return this;
    };


    return drawOsm;
}
