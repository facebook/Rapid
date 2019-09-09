import _debounce from 'lodash-es/debounce';


export function uiToolFbBannerTwo(context) {

    var tool = {
        id: 'fb_banner_2'
    };


    tool.render = function(selection) {
        selection
            .append('img')
            .attr('src', context.imagePath('on_worldai.png'));
    };
    return tool;
}
