export function uiToolFbBannerTwo() {

    var tool = {
        id: 'fb_banner_2'
    };


    tool.install = function(selection) {
        var banner = selection.selectAll('div#worldai-holiday-banner-end').data([0]);

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
