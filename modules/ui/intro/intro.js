import { select as d3_select, selectAll as d3_selectAll } from 'd3-selection';

import { t, textDirection } from '../../util/locale';
import { localize } from './helper';

import { coreGraph } from '../../core/graph';
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


const chapterUi = {
  welcome: uiIntroWelcome,
  navigation: uiIntroNavigation,
  point: uiIntroPoint,
  area: uiIntroArea,
  line: uiIntroLine,
  building: uiIntroBuilding,
  rapid: uiIntroRapid,
  startEditing: uiIntroStartEditing
};

const chapterFlow = [
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
    const INTRO_IMAGERY = 'EsriWorldImageryClarity';
    let introGraph = {};
    let rapidGraph = {};
    let _currChapter;


    // create entities for intro graph and localize names
    

    // create entities for RapiD graph and localize names
    for (let id in dataIntroRapidGraph) {
        rapidGraph[id] = osmEntity(localize(dataIntroRapidGraph[id]));
    }

    function intro(selection) {
        context.data().get('intro_graph')
            .then(dataIntroGraph => {
                for (let id in dataIntroGraph) {
                    if (!introGraph[id]){
                    introGraph[id] = osmEntity(localize(dataIntroGraph[id]));
                }
            }
        }); 
            
        context.data().get('intro_fb_graph')
            .then(dataIntroRapidGraph => {
                for (let id in dataIntroRapidGraph) {
                    if (!rapidGraph[id]){
                        rapidGraph[id] = osmEntity(localize(dataIntroRapidGraph[id]));
                }
            }
            selection.call(startIntro);
        }); 
    }
    
    
    function startIntro(selection){        
        context.enter(modeBrowse(context));

        // Save current map state
        let osm = context.connection();
        let history = context.history().toJSON();
        let hash = window.location.hash;
        let center = context.map().center();
        let zoom = context.map().zoom();
        let background = context.background().baseLayerSource();
        let overlays = context.background().overlayLayerSources();
        let opacity = d3_selectAll('#map .layer-background').style('opacity');
        let aiFeaturesOpacity = d3_selectAll('#map .layer-ai-features').style('opacity');
        let caches = osm && osm.caches();
        let baseEntities = context.history().graph().base().entities;
        let fbMLRoadsEntities = services.fbMLRoads && services.fbMLRoads.graph().entities;
        let fbMLRoadsCache = services.fbMLRoads && services.fbMLRoads.cache();

        // Block saving
        context.inIntro(true);

        // Load semi-real data used in intro
        if (osm) { osm.toggle(false).reset(); }
        context.history().reset();

        let loadedGraph = coreGraph().load(introGraph);
        let graphEntities = Object.values(loadedGraph.entities);
        context.history().merge(graphEntities);
        context.history().checkpoint('initial');

        // Setup imagery
        let imagery = context.background().findSource(INTRO_IMAGERY);
        if (imagery) {
            context.background().baseLayerSource(imagery);
        } else {
            context.background().bing();
        }
        overlays.forEach(function(d) {
            context.background().toggleOverlayLayer(d);
        });

        // Setup data layers (only OSM & ai-features)
        let layers = context.layers();
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

        let coreGraphEntities = coreGraph().load(rapidGraph).entities;
        services.fbMLRoads.merge(Object.values(coreGraphEntities));
        services.fbMLRoads.checkpoint('initial');

        d3_selectAll('#map .layer-background').style('opacity', 1);
        d3_selectAll('#map .layer-ai-features').style('opacity', 1);

        let curtain = uiCurtain();
        selection.call(curtain);

        // Store that the user started the walkthrough..
        context.storage('walkthrough_started', 'yes');

        // Restore previous walkthrough progress..
        let storedProgress = context.storage('walkthrough_progress') || '';
        let progress = storedProgress.split(';').filter(Boolean);

        let chapters = chapterFlow.map(function(chapter, i) {
            let s = chapterUi[chapter](context, curtain.reveal)
                .on('done', function() {
                    context.presets().init();  // clear away "recent" presets

                    buttons.filter(function(d) {
                        return d.title === s.title;
                    }).classed('finished', true);

                    if (i < chapterFlow.length - 1) {
                        let next = chapterFlow[i + 1];
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
            let incomplete = utilArrayDifference(chapterFlow, progress);
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

        let navwrap = selection
            .append('div')
            .attr('class', 'intro-nav-wrap fillD');

        navwrap
            .append('svg')
            .attr('class', 'intro-nav-wrap-logo')
            .append('use')
            .attr('xlink:href', '#iD-logo-walkthrough');

        let buttonwrap = navwrap
            .append('div')
            .attr('class', 'joined')
            .selectAll('button.chapter');

        let buttons = buttonwrap
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
