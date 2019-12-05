import {
    select as d3_select,
    selectAll as d3_selectAll
} from 'd3-selection';

import { t, textDirection } from '../../util/locale';
import { localize } from './helper';

import { coreGraph } from '../../core/graph';
import { dataIntroGraph } from '../../../data/intro_graph.json';
import { dataIntroRapidGraph } from '../../../data/intro_fb_graph.json';
import { modeBrowse } from '../../modes/browse';
import { osmEntity } from '../../osm/entity';
import { services } from '../../services'; 
import { svgIcon } from '../../svg/icon';
import { uiCurtain } from '../curtain';
import { utilArrayDifference, utilArrayUniq } from '../../util';

import { uiIntroWelcome } from './welcome';
import { uiIntroNavigation } from './navigation';
import { uiIntroPoint } from './point';
import { uiIntroArea } from './area';
import { uiIntroLine } from './line';
import { uiIntroBuilding } from './building';
import { uiIntroStartEditing } from './start_editing';
import { uiIntroRapid } from './rapid';


var chapterUi = {
    welcome: uiIntroWelcome,
    navigation: uiIntroNavigation,
    point: uiIntroPoint,
    area: uiIntroArea,
    line: uiIntroLine,
    building: uiIntroBuilding,
    rapid: uiIntroRapid,
    startEditing: uiIntroStartEditing
};

var chapterFlow = [
    'welcome',
    'navigation',
    'point',
    'area',
    'line',
    'building',
    'rapid',
    'startEditing'
];


export function uiIntro(context, skipToRapid) {
    var INTRO_IMAGERY = 'EsriWorldImageryClarity';
    var introGraph = {};
    var rapidGraph = {};
    var _currChapter;

    // create entities for intro graph and localize names
    for (var id in dataIntroGraph) {
        introGraph[id] = osmEntity(localize(dataIntroGraph[id]));
    }

    // create entities for RapiD graph and localize names
    for (id in dataIntroRapidGraph) {
        rapidGraph[id] = osmEntity(localize(dataIntroRapidGraph[id]));
    }


    function intro(selection) {
        context.enter(modeBrowse(context));

        // Save current map state
        var osm = context.connection();
        var history = context.history().toJSON();
        var hash = window.location.hash;
        var center = context.map().center();
        var zoom = context.map().zoom();
        var background = context.background().baseLayerSource();
        var overlays = context.background().overlayLayerSources();
        var opacity = d3_selectAll('#map .layer-background').style('opacity');
        var aiFeaturesOpacity = d3_selectAll('#map .layer-ai-features').style('opacity');
        var caches = osm && osm.caches();
        var baseEntities = context.history().graph().base().entities;
        var countryCode = services.geocoder.countryCode;
        var fbMLRoadsEntities = services.fbMLRoads && services.fbMLRoads.graph().entities;
        var fbMLRoadsCache = services.fbMLRoads && services.fbMLRoads.cache();

        // Block saving
        context.inIntro(true);

        // Load semi-real data used in intro
        if (osm) { osm.toggle(false).reset(); }
        context.history().reset();

        var loadedGraph = coreGraph().load(introGraph);
        var graphEntities = Object.values(loadedGraph.entities);
        context.history().merge(graphEntities);
        context.history().checkpoint('initial');

        // Setup imagery
        var imagery = context.background().findSource(INTRO_IMAGERY);
        if (imagery) {
            context.background().baseLayerSource(imagery);
        } else {
            context.background().bing();
        }
        overlays.forEach(function(d) {
            context.background().toggleOverlayLayer(d);
        });

        // Setup data layers (only OSM & ai-features)
        var layers = context.layers();
        layers.all().forEach(function(item) {
            // if the layer has the function `enabled`
            if (typeof item.layer.enabled === 'function') {
                item.layer.enabled(item.id === 'osm' || item.id === 'ai-features');
            }
        });

        // Mock geocoder
        services.geocoder.countryCode = function(location, callback) {
            callback(null, t('intro.graph.countrycode'));
        };

        if (services.fbMLRoads) services.fbMLRoads.toggle(false).reset();

        var coreGraphEntities = coreGraph().load(rapidGraph).entities;
        services.fbMLRoads.merge(Object.values(coreGraphEntities));
        services.fbMLRoads.checkpoint('initial');

        d3_selectAll('#map .layer-background').style('opacity', 1);
        d3_selectAll('#map .layer-ai-features').style('opacity', 1);

        var curtain = uiCurtain();
        selection.call(curtain);

        // Store that the user started the walkthrough..
        context.storage('walkthrough_started', 'yes');

        // Restore previous walkthrough progress..
        var storedProgress = context.storage('walkthrough_progress') || '';
        var progress = storedProgress.split(';').filter(Boolean);

        var chapters = chapterFlow.map(function(chapter, i) {
            var s = chapterUi[chapter](context, curtain.reveal)
                .on('done', function() {
                    context.presets().init();  // clear away "recent" presets

                    buttons.filter(function(d) {
                        return d.title === s.title;
                    }).classed('finished', true);

                    if (i < chapterFlow.length - 1) {
                        var next = chapterFlow[i + 1];
                        d3_select('button.chapter-' + next)
                            .classed('next', true);
                    }

                    // Store walkthrough progress..
                    progress.push(chapter);
                    context.storage('walkthrough_progress', utilArrayUniq(progress).join(';'));
                });
            return s;
        });

        chapters[chapters.length - 1].on('startEditing', function() {
            // Store walkthrough progress..
            progress.push('startEditing');
            context.storage('walkthrough_progress', utilArrayUniq(progress).join(';'));

            // Store if walkthrough is completed..
            var incomplete = utilArrayDifference(chapterFlow, progress);
            if (!incomplete.length) {
                context.storage('walkthrough_completed', 'yes');
            }

            curtain.remove();
            navwrap.remove();
            d3_selectAll('#map .layer-background').style('opacity', opacity);
            d3_selectAll('#map .layer-ai-features').style('opacity', aiFeaturesOpacity);
            d3_selectAll('button.sidebar-toggle').classed('disabled', false);
            if (osm) { osm.toggle(true).reset().caches(caches); }
            context.history().reset().merge(Object.values(baseEntities));
            if (services.fbMLRoads) {services.fbMLRoads.toggle(true).reset().cache(fbMLRoadsCache);}
            services.fbMLRoads.reset().merge(Object.values(fbMLRoadsEntities));
            context.background().baseLayerSource(background);
            overlays.forEach(function(d) { context.background().toggleOverlayLayer(d); });
            if (history) { context.history().fromJSON(history, false); }
            context.map().centerZoom(center, zoom);
            window.location.replace(hash);
            context.inIntro(false);
        });

        var navwrap = selection
            .append('div')
            .attr('class', 'intro-nav-wrap fillD');

        navwrap
            .append('svg')
            .attr('class', 'intro-nav-wrap-logo')
            .append('use')
            .attr('xlink:href', '#iD-logo-walkthrough');

        var buttonwrap = navwrap
            .append('div')
            .attr('class', 'joined')
            .selectAll('button.chapter');

        var buttons = buttonwrap
            .data(chapters)
            .enter()
            .append('button')
            .attr('class', function(d, i) { return 'chapter chapter-' + chapterFlow[i]; })
            .on('click', enterChapter);

        buttons
            .append('span')
            .text(function(d) { return t(d.title); });

        buttons
            .append('span')
            .attr('class', 'status')
            .call(svgIcon((textDirection === 'rtl' ? '#iD-icon-backward' : '#iD-icon-forward'), 'inline'));

        enterChapter(chapters[skipToRapid ? 6 : 0]);

        function enterChapter(newChapter) {
            if (_currChapter) { _currChapter.exit(); }
            context.enter(modeBrowse(context));

            _currChapter = newChapter;
            _currChapter.enter();

            buttons
                .classed('next', false)
                .classed('active', function(d) {
                    return d.title === _currChapter.title;
                });
        }
    }


    return intro;
}
