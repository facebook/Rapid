import { timeout as d3_timeout } from 'd3-timer';

export function uiFlash(context) {
    var _flashTimer;

    var _duration = 2000;
    var _iconName = '#rapid-icon-no';
    var _iconClass = 'disabled';
    var _label = '';

    function flash() {
        if (_flashTimer) {
            _flashTimer.stop();
        }

        context.container().select('.map-footer-wrap')
            .classed('map-footer-hide', true)
            .classed('map-footer-show', false);
        context.container().select('.flash-wrap')
            .classed('map-footer-hide', false)
            .classed('map-footer-show', true);

        var content = context.container().select('.flash-wrap').selectAll('.flash-content')
            .data([0]);

        // Enter
        var contentEnter = content.enter()
            .append('div')
            .attr('class', 'flash-content');

        var iconEnter = contentEnter
            .append('svg')
            .attr('class', 'flash-icon icon')
            .append('g')
            .attr('transform', 'translate(10,10)');

        iconEnter
            .append('circle')
            .attr('r', 9);

        iconEnter
            .append('use')
            .attr('transform', 'translate(-7,-7)')
            .attr('width', '14')
            .attr('height', '14');

        contentEnter
            .append('div')
            .attr('class', 'flash-text');


        // Update
        content = content
            .merge(contentEnter);

        content
            .selectAll('.flash-icon')
            .attr('class', 'icon flash-icon ' + (_iconClass || ''));

        content
            .selectAll('.flash-icon use')
            .attr('xlink:href', _iconName);

        content
            .selectAll('.flash-text')
            .attr('class', 'flash-text')
            .html(_label);


        _flashTimer = d3_timeout(function() {
            _flashTimer = null;
            context.container().select('.map-footer-wrap')
                .classed('map-footer-hide', false)
                .classed('map-footer-show', true);
            context.container().select('.flash-wrap')
                .classed('map-footer-hide', true)
                .classed('map-footer-show', false);
        }, _duration);

        return content;
    }


    flash.duration = function(_) {
        if (!arguments.length) return _duration;
        _duration = _;
        return flash;
    };

    flash.label = function(_) {
        if (!arguments.length) return _label;
        _label = _;
        return flash;
    };

    flash.iconName = function(_) {
        if (!arguments.length) return _iconName;
        _iconName = _;
        return flash;
    };

    flash.iconClass = function(_) {
        if (!arguments.length) return _iconClass;
        _iconClass = _;
        return flash;
    };

    return flash;
}
