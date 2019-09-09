import _debounce from 'lodash-es/debounce';

export function uiToolFbBannerOne(context) {

    var tool = {
        id: 'fb_banner_1',
    };


    tool.render = function(selection) {
        selection
            .append('img')
            .attr('src', context.imagePath('facebook_maps.png'))
            .attr('width', '369');
    };
    return tool;
}
