import { select as d3_select } from 'd3-selection';
import { marked } from 'marked';

import { uiIcon } from '../icon.js';
import { uiIntro } from '../intro/intro.js';
import { uiPane } from '../pane.js';
import { uiTooltip } from '../tooltip.js';
import { helpHtml } from '../intro/helper.js';


export function uiPaneHelp(context) {
  const l10n = context.systems.l10n;
  const ui = context.systems.ui;

  let _selection = null;
  let _currIndex = 0;

  const docSections = [
    ['help', [
      'welcome',
      'open_data_h',
      'open_data',
      'before_start_h',
      'before_start',
      'open_source_h',
      'open_source',
      'open_source_help'
    ]],
    ['overview', [
      'navigation_h',
      'navigation_pan',
      'navigation_zoom',
      'navigation_rotate',
      'features_h',
      'features',
      'nodes_ways'
    ]],
    ['editing', [
      'select_h',
      'select_left_click',
      'select_right_click',
      'select_space',
      'multiselect_h',
      'multiselect',
      'multiselect_shift_click',
      'multiselect_lasso',
      'undo_redo_h',
      'undo_redo',
      'save_h',
      'save',
      'save_validation',
      'upload_h',
      'upload',
      'backups_h',
      'backups',
      'keyboard_h',
      'keyboard'
    ]],
    ['feature_editor', [
      'intro',
      'definitions',
      'type_h',
      'type',
      'type_picker',
      'fields_h',
      'fields_all_fields',
      'fields_example',
      'fields_add_field',
      'tags_h',
      'tags_all_tags',
      'tags_resources'
    ]],
    ['points', [
      'intro',
      'add_point_h',
      'add_point',
      'add_point_finish',
      'move_point_h',
      'move_point',
      'delete_point_h',
      'delete_point',
      'delete_point_command'
    ]],
    ['lines', [
      'intro',
      'add_line_h',
      'add_line',
      'add_line_draw',
      'add_line_continue',
      'add_line_finish',
      'modify_line_h',
      'modify_line_dragnode',
      'modify_line_addnode',
      'connect_line_h',
      'connect_line',
      'connect_line_display',
      'connect_line_drag',
      'connect_line_tag',
      'disconnect_line_h',
      'disconnect_line_command',
      'move_line_h',
      'move_line_command',
      'move_line_connected',
      'delete_line_h',
      'delete_line',
      'delete_line_command'
    ]],
    ['areas', [
      'intro',
      'point_or_area_h',
      'point_or_area',
      'add_area_h',
      'add_area_command',
      'add_area_draw',
      'add_area_continue',
      'add_area_finish',
      'square_area_h',
      'square_area_command',
      'modify_area_h',
      'modify_area_dragnode',
      'modify_area_addnode',
      'delete_area_h',
      'delete_area',
      'delete_area_command'
    ]],
    ['relations', [
      'intro',
      'edit_relation_h',
      'edit_relation',
      'edit_relation_add',
      'edit_relation_delete',
      'maintain_relation_h',
      'maintain_relation',
      'relation_types_h',
      'multipolygon_h',
      'multipolygon',
      'multipolygon_create',
      'multipolygon_merge',
      'turn_restriction_h',
      'turn_restriction',
      'turn_restriction_field',
      'turn_restriction_editing',
      'route_h',
      'route',
      'route_add',
      'boundary_h',
      'boundary',
      'boundary_add'
    ]],
    ['operations', [
      'intro',
      'intro_2',
      'straighten',
      'orthogonalize',
      'circularize',
      'move',
      'rotate',
      'reflect',
      'continue',
      'reverse',
      'disconnect',
      'split',
      'extract',
      'merge',
      'delete',
      'downgrade',
      'copy_paste'
    ]],
    ['notes', [
      'intro',
      'add_note_h',
      'add_note',
      'place_note',
      'move_note',
      'update_note_h',
      'update_note',
      'save_note_h',
      'save_note'
    ]],
    ['imagery', [
      'intro',
      'sources_h',
      'choosing',
      'sources',
      'offsets_h',
      'offset',
      'offset_change'
    ]],
    ['streetlevel', [
      'intro',
      'using_h',
      'using',
      'photos',
      'viewer'
    ]],
    ['gps', [
      'intro',
      'survey',
      'using_h',
      'using',
      'tracing',
      'upload'
    ]],
    ['qa', [
      'intro',
      'tools_h',
      'tools',
      'issues_h',
      'issues'
    ]]
  ];

  const headings = {
    'help.help.open_data_h': 3,
    'help.help.before_start_h': 3,
    'help.help.open_source_h': 3,
    'help.overview.navigation_h': 3,
    'help.overview.features_h': 3,
    'help.editing.select_h': 3,
    'help.editing.multiselect_h': 3,
    'help.editing.undo_redo_h': 3,
    'help.editing.save_h': 3,
    'help.editing.upload_h': 3,
    'help.editing.backups_h': 3,
    'help.editing.keyboard_h': 3,
    'help.feature_editor.type_h': 3,
    'help.feature_editor.fields_h': 3,
    'help.feature_editor.tags_h': 3,
    'help.points.add_point_h': 3,
    'help.points.move_point_h': 3,
    'help.points.delete_point_h': 3,
    'help.lines.add_line_h': 3,
    'help.lines.modify_line_h': 3,
    'help.lines.connect_line_h': 3,
    'help.lines.disconnect_line_h': 3,
    'help.lines.move_line_h': 3,
    'help.lines.delete_line_h': 3,
    'help.areas.point_or_area_h': 3,
    'help.areas.add_area_h': 3,
    'help.areas.square_area_h': 3,
    'help.areas.modify_area_h': 3,
    'help.areas.delete_area_h': 3,
    'help.relations.edit_relation_h': 3,
    'help.relations.maintain_relation_h': 3,
    'help.relations.relation_types_h': 2,
    'help.relations.multipolygon_h': 3,
    'help.relations.turn_restriction_h': 3,
    'help.relations.route_h': 3,
    'help.relations.boundary_h': 3,
    'help.notes.add_note_h': 3,
    'help.notes.update_note_h': 3,
    'help.notes.save_note_h': 3,
    'help.imagery.sources_h': 3,
    'help.imagery.offsets_h': 3,
    'help.streetlevel.using_h': 3,
    'help.gps.using_h': 3,
    'help.qa.tools_h': 3,
    'help.qa.issues_h': 3
  };

  // common replacements that we may use anywhere in the help text
  const replacements = {
    version: `**${context.version}**`,
    rapidicon: `<svg class="icon pre-text rapid"><use xlink:href="#rapid-logo-rapid-wordmark"></use></svg>`
  };


  // For each doc section, squash all the subsections into a single markdown document
  let docs = [];
  for (const [section, subsections] of docSections) {
    const markdown = subsections.reduce((acc, subsection) => {
      const stringID = `help.${section}.${subsection}`;
      const depth = headings[stringID];                             // is this string a heading?
      const hhh = depth ? Array(depth + 1).join('#') + ' ' : '';    // if so, prepend with some ##'s
      return acc + hhh + helpHtml(context, stringID, replacements) + '\n\n';
    }, '');

    docs.push({
      title: l10n.t(`help.${section}.title`),
      contentHtml: marked.parse(markdown.trim())
        .replace(/<code>/g, '<kbd>')       // use <kbd> styling for shortcuts
        .replace(/<\/code>/g, '<\/kbd>')
    });
  }


  const helpPane = uiPane(context, 'help')
    .key(l10n.t('help.key'))
    .label(l10n.t('help.title'))
    .description(l10n.t('help.title'))
    .iconName('rapid-icon-help');



  /**
   * renderContent
   * All panes have a `renderContent` function that will render this pane's
   * content into the given parent selection.
   * (this is the render function)
   */
  helpPane.renderContent = function(selection) {
    _selection = selection;

    // table of contents
    const tocEnter = selection.selectAll('.toc')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'toc');

    tocEnter.selectAll('li')
      .data(docs)
      .enter()
      .append('li')
      .append('a')
      .attr('href', '#')
      .text(d => d.title)
      .on('click', (d3_event, d) => {
        d3_event.preventDefault();
        clickChapter(d, docs.indexOf(d));
      });

    // button for the shortcuts
    const shortcutsEnter = tocEnter
      .append('li')
      .attr('class', 'shortcuts')
      .call(uiTooltip(context)
        .title(l10n.t('shortcuts.tooltip'))
        .shortcut('?')
        .placement('top')
      )
      .append('a')
      .attr('href', '#')
      .on('click', clickShortcuts);

    shortcutsEnter
      .append('div')
      .text(l10n.t('shortcuts.title'));

    // button for the walkthrough
    const walkthroughEnter = tocEnter
      .append('li')
      .attr('class', 'walkthrough')
      .append('a')
      .attr('href', '#')
      .on('click', clickWalkthrough);

    walkthroughEnter
      .append('svg')
      .attr('class', 'logo logo-walkthrough')
      .append('use')
      .attr('xlink:href', '#rapid-logo-walkthrough');

    walkthroughEnter
      .append('div')
      .text(l10n.t('splash.walkthrough'));

    // help content (everything that's not the table of contents)
    const wrapEnter = selection.selectAll('.help-content-wrap')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'help-content-wrap');

    wrapEnter
      .append('div')
      .attr('class', 'help-content');

    wrapEnter
      .append('div')
      .attr('class', 'nav');

    clickChapter(docs[_currIndex], _currIndex);
  };


  /**
   * clickChapter
   */
  function clickChapter(d, i) {
    if (!_selection) return;  // called too early

    _currIndex = i;

    const isRTL = l10n.isRTL();
    _selection.property('scrollTop', 0);

    const helpPane = d3_select(_selection.node().parentElement);
    helpPane.selectAll('.pane-heading > h2').text(d.title);

    const content = _selection.selectAll('.help-content');
    content.html(d.contentHtml);
    content.selectAll('a').attr('target', '_blank');  // outbound links should open in new tab

    _selection.selectAll('.toc > li')
      .classed('selected', item => item === d);

    const nav = _selection.selectAll('.nav');
    nav.html('');    // empty innerHtml and replace it
    if (isRTL) {
      nav.call(drawNext).call(drawPrevious);
    } else {
      nav.call(drawPrevious).call(drawNext);
    }


    function drawNext(selection) {
      if (i === docs.length - 1) return;

      const nextLink = selection
        .append('a')
        .attr('href', '#')
        .attr('class', 'next')
        .on('click', d3_event => {
          d3_event.preventDefault();
          clickChapter(docs[i + 1], i + 1);
        });

      nextLink
        .append('span')
        .text(docs[i + 1].title)
        .call(uiIcon((isRTL ? '#rapid-icon-backward' : '#rapid-icon-forward'), 'inline'));
    }


    function drawPrevious(selection) {
      if (i === 0) return;

      const prevLink = selection
        .append('a')
        .attr('href', '#')
        .attr('class', 'previous')
        .on('click', d3_event => {
          d3_event.preventDefault();
          clickChapter(docs[i - 1], i - 1);
        });

      prevLink
        .call(uiIcon((isRTL ? '#rapid-icon-forward' : '#rapid-icon-backward'), 'inline'))
        .append('span')
        .text(docs[i - 1].title);
    }
  }


  function clickWalkthrough(d3_event) {
    d3_event.preventDefault();
    if (context.inIntro) return;
    context.container().call(uiIntro(context));
    ui.togglePanes();
  }


  function clickShortcuts(d3_event) {
    d3_event.preventDefault();
    ui.shortcuts.show();
  }


  return helpPane;
}
