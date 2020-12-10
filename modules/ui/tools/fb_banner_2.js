import _debounce from 'lodash-es/debounce';


export function uiToolFbBannerTwo(context) {

    var tool = {
        id: 'fb_banner_2'
    };


    tool.render = function(selection) {
        var banner = selection.selectAll('div#worldai-holiday-banner-end').data([0]);

        banner.exit()
            .remove;

        var bannerEnter = banner.enter()
            .append('div')
            .attr('id', 'worldai-holiday-banner-end')
            .attr('class', 'holiday-banner smaller')
            .text('from the RapiD team');

        banner
            .merge(bannerEnter);
    };

    return tool;
}
