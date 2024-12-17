
export function uiToolFbBannerOne(context) {

    var tool = {
        id: 'fb_banner_1',
    };


    tool.install = function(selection) {

        var banner = selection.selectAll('div#worldai-holiday-banner-start').data([0]);

        banner.exit()
            .remove();

        var bannerEnter = banner.enter()
            .append('div')
            .attr('id', 'worldai-holiday-banner-start')
            .attr('class', 'holiday-banner')
            .text('Mappy Holidays');

            banner
                .merge(bannerEnter);

    };

    return tool;
}
