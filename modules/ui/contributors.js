import { select as d3_select } from 'd3-selection';
import debounce from 'lodash-es/debounce.js';

import { uiIcon } from './icon.js';


export function uiContributors(context) {
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const map = context.systems.map;
    const osm = context.services.osm;
    const viewport = context.viewport;

    var debouncedUpdate = debounce(function() { update(); }, 1000);
    var limit = 4;
    var hidden = false;
    var wrap = d3_select(null);


    function update() {
        if (!osm) return;

        let users = {};
        let entities = editor.intersects(viewport.visibleExtent());

        entities.forEach(function(entity) {
            if (entity && entity.user) users[entity.user] = true;
        });

        let u = Object.keys(users);
        let subset = u.slice(0, u.length > limit ? limit - 1 : limit);

        wrap.html('')
            .call(uiIcon('#rapid-icon-nearby', 'pre-text light'));

        var userList = d3_select(document.createElement('span'));

        userList.selectAll()
            .data(subset)
            .enter()
            .append('a')
            .attr('class', 'user-link')
            .attr('href', function(d) { return osm.userURL(d); })
            .attr('target', '_blank')
            .html(String);

        if (u.length > limit) {
            var count = d3_select(document.createElement('span'));

            var othersNum = u.length - limit + 1;

            count.append('a')
                .attr('target', '_blank')
                .attr('href', function() {
                    return osm.changesetsURL(viewport.centerLoc(), viewport.transform.zoom);
                })
                .html(othersNum);

            wrap.append('span')
                .html(l10n.tHtml('contributors.truncated_list', { n: othersNum, users: userList.html(), count: count.html() }));

        } else {
            wrap.append('span')
                .html(l10n.tHtml('contributors.list', { users: userList.html() }));
        }

        if (!u.length) {
            hidden = true;
            wrap
                .transition()
                .style('opacity', 0);

        } else if (hidden) {
            wrap
                .transition()
                .style('opacity', 1);
        }
    }


    return function(selection) {
        if (!osm) return;
        wrap = selection;
        update();

        osm.on('loaded.contributors', debouncedUpdate);
        map.on('draw', debouncedUpdate);
    };
}
