import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { resolveStrings } from 'osm-community-index';

import { uiIcon } from './icon.js';
import { uiDisclosure } from '../ui/disclosure.js';
import { utilRebind } from '../util/rebind.js';


let _oci = null;

export function uiSuccess(context) {
  const assets = context.systems.assets;
  const locations = context.systems.locations;
  const l10n = context.systems.l10n;
  const map = context.systems.map;

  const dispatch = d3_dispatch('cancel');
  const MAXEVENTS = 2;

  let _changeset;
  let _location;

  getCommunityIndexAsync();   // start fetching the data


  function getCommunityIndexAsync() {
    return Promise.all([
        assets.loadAssetAsync('oci_features'),
        assets.loadAssetAsync('oci_resources'),
        assets.loadAssetAsync('oci_defaults')
      ])
      .then(vals => {
        if (_oci) return _oci;

        // Merge Custom Features
        if (vals[0] && Array.isArray(vals[0].features)) {
          locations.mergeCustomGeoJSON(vals[0]);
        }

        let ociResources = Object.values(vals[1].resources);
        if (ociResources.length) {
          // Resolve all locationSet features.
          return locations.mergeLocationSets(ociResources)
            .then(() => {
              _oci = {
                resources: ociResources,
                defaults: vals[2].defaults
              };
              return _oci;
            });
        } else {
          _oci = {
            resources: [],   // no resources?
            defaults:  vals[2].defaults
          };
          return _oci;
        }
      });
  }


  // string-to-date parsing in JavaScript is weird
  function parseEventDate(when) {
    if (!when) return;

    let raw = when.trim();
    if (!raw) return;

    if (!/Z$/.test(raw)) {   // if no trailing 'Z', add one
      raw += 'Z';            // this forces date to be parsed as a UTC date
    }

    const parsed = new Date(raw);
    return new Date(parsed.toUTCString().slice(0, 25));  // convert to local timezone
  }


  function success(selection) {
    let header = selection
      .append('div')
      .attr('class', 'header fillL');

    header
      .append('h3')
      .text(l10n.t('success.just_edited'));

    header
      .append('button')
      .attr('class', 'close')
      .on('click', () => dispatch.call('cancel'))
      .call(uiIcon('#rapid-icon-close'));

    let body = selection
      .append('div')
      .attr('class', 'body save-success fillL');

    let summary = body
      .append('div')
      .attr('class', 'save-summary');

    summary
      .append('h3')
      .text(l10n.t('success.thank_you' + (_location ? '_location' : ''), { where: _location }));

    summary
      .append('p')
      .text(l10n.t('success.your_changes'))  // "Your changes should appear in a few minutes..."
      .append('a')
      .attr('class', 'link-out')
      .attr('target', '_blank')
      .attr('href', l10n.t('success.help_link_url'))
      .call(uiIcon('#rapid-icon-out-link', 'inline'))
      .append('span')
      .text(l10n.t('success.help_link_text'));

    let osm = context.services.osm;
    if (!osm) return;

    let changesetURL = osm.changesetURL(_changeset.id);

    let table = summary
      .append('table')
      .attr('class', 'summary-table');

    let row = table
      .append('tr')
      .attr('class', 'summary-row');

    row
      .append('td')
      .attr('class', 'cell-icon summary-icon')
      .append('a')
      .attr('target', '_blank')
      .attr('href', changesetURL)
      .append('svg')
      .attr('class', 'logo-small')
      .append('use')
      .attr('xlink:href', '#rapid-logo-osm');

    let summaryDetail = row
      .append('td')
      .attr('class', 'cell-detail summary-detail');

    summaryDetail
      .append('a')
      .attr('class', 'cell-detail summary-view-on-osm')
      .attr('target', '_blank')
      .attr('href', changesetURL)
      .text(l10n.t('success.view_on_osm'));

    summaryDetail
      .append('div')
      .text(l10n.t('success.your_changeset_id'))   // "Your changeset #:"
      .append('a')
      .attr('target', '_blank')
      .attr('href', changesetURL)
      .text(_changeset.id);

    // Get OSM community index features intersecting the map..
    getCommunityIndexAsync()
      .then(oci => {
        const loc = map.center();
        const validHere = locations.locationSetsAt(loc);

        // Gather the communities
        let communities = [];
        oci.resources.forEach(resource => {
          const area = validHere[resource.locationSetID];
          if (!area) return;

          // Resolve strings
          const localize = (stringID) => l10n.t(`_community.${stringID}`);
          resource.resolved = resolveStrings(resource, oci.defaults, localize);

          communities.push({
            area: area,
            order: resource.order || 0,
            resource: resource
          });
        });

        // sort communities by feature area ascending, community order descending
        communities.sort((a, b) => a.area - b.area || b.order - a.order);

        body
          .call(showCommunityLinks, communities.map(c => c.resource));
      });
  }


  function showCommunityLinks(selection, resources) {
    let communityLinks = selection
      .append('div')
      .attr('class', 'save-communityLinks');

    communityLinks
      .append('h3')
      .text(l10n.t('success.like_osm'));  // "Like OpenStreetMap? Connect with others:"

    let table = communityLinks
      .append('table')
      .attr('class', 'community-table');

    let row = table.selectAll('.community-row')
      .data(resources);

    let rowEnter = row.enter()
      .append('tr')
      .attr('class', 'community-row');

    rowEnter
      .append('td')
      .attr('class', 'cell-icon community-icon')
      .append('a')
      .attr('target', '_blank')
      .attr('href', d => d.resolved.url)
      .append('svg')
      .attr('class', 'logo-small')
      .append('use')
      .attr('xlink:href', d => `#community-${d.type}`);

    let communityDetail = rowEnter
      .append('td')
      .attr('class', 'cell-detail community-detail');

    communityDetail
      .each(showCommunityDetails);

    communityLinks
      .append('div')
      .attr('class', 'community-missing')
      .text(l10n.t('success.missing'))
      .append('a')
      .attr('class', 'link-out')
      .attr('target', '_blank')
      .call(uiIcon('#rapid-icon-out-link', 'inline'))
      .attr('href', 'https://github.com/osmlab/osm-community-index/issues')
      .append('span')
      .text(l10n.t('success.tell_us'));
  }


  function showCommunityDetails(d, i, nodes) {
    let selection = d3_select(nodes[i]);
    let communityID = d.id;

    selection
      .append('div')
      .attr('class', 'community-name')
      .html(d.resolved.nameHTML);

    selection
      .append('div')
      .attr('class', 'community-description')
      .html(d.resolved.descriptionHTML);

    // Create an expanding section if any of these are present..
    if (d.resolved.extendedDescriptionHTML || (d.languageCodes && d.languageCodes.length)) {
      selection
        .append('div')
        .call(uiDisclosure(context, `community-more-${d.id}`)
          .expanded(false)
          .checkPreference(false)
          .label(l10n.t('success.more'))
          .content(showMore)
        );
    }

    let nextEvents = (d.events || [])
      .map(event => {
        event.date = parseEventDate(event.when);
        return event;
      })
      .filter(event => {      // date is valid and future (or today)
        const t = event.date.getTime();
        const now = (new Date()).setHours(0,0,0,0);
        return !isNaN(t) && t >= now;
      })
      .sort((a, b) => {       // sort by date ascending
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      })
      .slice(0, MAXEVENTS);   // limit number of events shown

    if (nextEvents.length) {
      selection
        .append('div')
        .call(uiDisclosure(context, `community-events-${d.id}`)
          .expanded(false)
          .checkPreference(false)
          .label(l10n.t('success.events'))
          .content(showNextEvents)
        )
        .select('.hide-toggle')
        .append('span')
        .attr('class', 'badge-text')
        .text(nextEvents.length);
    }


    function showMore(selection) {
      let more = selection.selectAll('.community-more')
        .data([0]);

      let moreEnter = more.enter()
        .append('div')
        .attr('class', 'community-more');

      if (d.resolved.extendedDescriptionHTML) {
        moreEnter
          .append('div')
          .attr('class', 'community-extended-description')
          .html(d.resolved.extendedDescriptionHTML);
      }

      if (d.languageCodes && d.languageCodes.length) {
        const languageList = d.languageCodes
          .map(code => l10n.languageName(code))
          .join(', ');

        moreEnter
          .append('div')
          .attr('class', 'community-languages')
          .text(l10n.t('success.languages', { languages: languageList }));
      }
    }


    function showNextEvents(selection) {
      let events = selection
        .append('div')
        .attr('class', 'community-events');

      let item = events.selectAll('.community-event')
        .data(nextEvents);

      let itemEnter = item.enter()
        .append('div')
        .attr('class', 'community-event');

      itemEnter
        .append('div')
        .attr('class', 'community-event-name')
        .append('a')
        .attr('target', '_blank')
        .attr('href', d => d.url)
        .text(d => {
          let name = d.name;
          if (d.i18n && d.id) {
            name = l10n.t(`_community.${communityID}.events.${d.id}.name`, { default: name });
          }
          return name;
        });

      itemEnter
        .append('div')
        .attr('class', 'community-event-when')
        .text(d => {
          let options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
          if (d.date.getHours() || d.date.getMinutes()) {   // include time if it has one
            options.hour = 'numeric';
            options.minute = 'numeric';
          }
          const localeCode = l10n.localeCode();
          return d.date.toLocaleString(localeCode, options);
        });

      itemEnter
        .append('div')
        .attr('class', 'community-event-where')
        .text(d => {
          let where = d.where;
          if (d.i18n && d.id) {
            where = l10n.t(`_community.${communityID}.events.${d.id}.where`, { default: where });
          }
          return where;
        });

      itemEnter
        .append('div')
        .attr('class', 'community-event-description')
        .text(d => {
          let description = d.description;
          if (d.i18n && d.id) {
            description = l10n.t(`_community.${communityID}.events.${d.id}.description`, { default: description });
          }
          return description;
        });
    }
  }


  success.changeset = function(val) {
    if (!arguments.length) return _changeset;
    _changeset = val;
    return success;
  };


  success.location = function(val) {
    if (!arguments.length) return _location;
    _location = val;
    return success;
  };


  return utilRebind(success, dispatch, 'on');
}
