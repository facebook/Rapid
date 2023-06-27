import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon';


export function uiNoteComments(context) {
  let _note;


  function noteComments(selection) {
    if (_note.isNew()) return;  // new notes won't have a comment section

    let comments = selection.selectAll('.comments-container')
      .data([0]);

    comments = comments.enter()
      .append('div')
      .attr('class', 'comments-container')
      .merge(comments);

    let commentEnter = comments.selectAll('.comment')
      .data(_note.comments)
      .enter()
      .append('div')
      .attr('class', 'comment');

    commentEnter
      .append('div')
      .attr('class', d => `comment-avatar user-${d.uid}`)
      .call(uiIcon('#rapid-icon-avatar', 'comment-avatar-icon'));

    let mainEnter = commentEnter
      .append('div')
      .attr('class', 'comment-main');

    let metadataEnter = mainEnter
      .append('div')
      .attr('class', 'comment-metadata');

    metadataEnter
      .append('div')
      .attr('class', 'comment-author')
      .each((d, i, nodes) => {
        let selection = d3_select(nodes[i]);
        const osm = context.services.osm;
        if (osm && d.user) {
          selection = selection
            .append('a')
            .attr('class', 'comment-author-link')
            .attr('href', osm.userURL(d.user))
            .attr('target', '_blank');
        }
        selection
          .html(d => d.user || context.tHtml('note.anonymous'));
      });

    metadataEnter
      .append('div')
      .attr('class', 'comment-date')
      .html(d => context.t(`note.status.${d.action}`, { when: localeDateString(d.date) }));

    mainEnter
      .append('div')
      .attr('class', 'comment-text')
      .html(d => d.html)
      .selectAll('a')
        .attr('rel', 'noopener nofollow')
        .attr('target', '_blank');

    comments
      .call(replaceAvatars);
  }


  function replaceAvatars(selection) {
    const storageSystem = context.storageSystem();
    const showThirdPartyIcons = storageSystem.getItem('preferences.privacy.thirdpartyicons') ?? 'true';
    const osm = context.services.osm;
    if (showThirdPartyIcons !== 'true' || !osm) return;

    const uids = new Set();  // gather uids in the comment thread
    for (const d of _note.comments) {
      if (d.uid) uids.add(d.uid);
    }

    for (const uid of uids) {
      osm.loadUser(uid, (err, user) => {
        if (!user || !user.image_url) return;

        selection.selectAll(`.comment-avatar.user-${uid}`)
          .html('')
          .append('img')
          .attr('class', 'icon comment-avatar-icon')
          .attr('src', user.image_url)
          .attr('alt', user.display_name);
      });
    }
  }


  function localeDateString(s) {
    if (!s) return null;
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    s = s.replace(/-/g, '/'); // fix browser-specific Date() issues
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;

    const localeCode = context.localizationSystem().localeCode();
    return d.toLocaleDateString(localeCode, options);
  }


  noteComments.note = function(val) {
    if (!arguments.length) return _note;
    _note = val;
    return noteComments;
  };


  return noteComments;
}
