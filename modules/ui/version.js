import { prefs } from '../core/preferences';
import { t } from '../core/localizer';
import { uiIcon } from './icon';
import { uiTooltip } from './tooltip';


// these are module variables so they are preserved through a ui.restart()
let sawVersion = null;
let isNewVersion = false;
let isNewUser = false;


export function uiVersion(context) {
  const currVersion = context.version;
  const matchedVersion = currVersion.match(/\d+\.\d+\.\d+.*/);

  if (sawVersion === null && matchedVersion !== null) {
    if (prefs('sawVersion')) {
      isNewUser = false;
      isNewVersion = prefs('sawVersion') !== currVersion && currVersion.indexOf('-') === -1;
    } else {
      isNewUser = true;
      isNewVersion = true;
    }
    prefs('sawVersion', currVersion);
    sawVersion = currVersion;
  }

  return function render(selection) {
    selection
      .append('a')
      .attr('target', '_blank')
      .attr('tabindex', -1)
      .attr('href', 'https://github.com/facebook/Rapid/blob/main/CHANGELOG.md')
      .text(currVersion);

    // Only show new version indicator to users that have used Rapid before
    if (isNewVersion && !isNewUser) {
      selection
        .append('a')
        .attr('class', 'badge')
        .attr('target', '_blank')
        .attr('tabindex', -1)
        .attr('href', 'https://github.com/facebook/Rapid/blob/main/CHANGELOG.md')
        .call(uiIcon('#maki-gift'))
        .call(uiTooltip()
          .title(t.html('version.whats_new', { version: currVersion }))
          .placement('top')
          .scrollContainer(context.container().select('.main-footer-wrap'))
        );
    }
  };
}
