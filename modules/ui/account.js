import { uiIcon } from './icon.js';


export function uiAccount(context) {
  const l10n = context.systems.l10n;
  const osm = context.services.osm;


  function updateUserDetails(selection) {
    if (!osm || !osm.authenticated()) {
      render(selection, null);
    } else {
      osm.userDetails((err, user) => render(selection, user));
    }
  }


  function render(selection, user) {
    const userInfo = selection.select('.userInfo');
    const loginLogout = selection.select('.loginLogout');

    if (!user) {
      userInfo
        .html('')
        .classed('hide', true);

    } else {
      userInfo
        .html('')
        .classed('hide', false);

      const userLink = userInfo
        .append('a')
        .attr('href', osm.userURL(user.display_name))
        .attr('target', '_blank');

      // Add user's image or placeholder
      if (user.image_url) {
        userLink.append('img')
          .attr('class', 'icon pre-text user-icon')
          .attr('src', user.image_url);
      } else {
        userLink
          .call(uiIcon('#rapid-icon-avatar', 'pre-text light'));
      }

      // Add user name
      userLink.append('span')
        .attr('class', 'label')
        .text(user.display_name);
    }


    if (!osm) {  // show nothing
      loginLogout
        .classed('hide', true);

    } else if (osm.authenticated()) {    // show "Log Out"
      loginLogout
        .classed('hide', false)
        .select('a')
        .text(l10n.t('logout'))
        .on('click', e => {
          e.preventDefault();
          osm.logout();
          tryLogout();
        });

    } else {   // show "Log In"
      loginLogout
        .classed('hide', false)
        .select('a')
        .text(l10n.t('login'))
        .on('click', e => {
          e.preventDefault();
          osm.authenticate();
        });
    }
  }


  // OAuth2's idea of "logout" is just to get rid of the bearer token.
  // If we try to "login" again, it will just grab the token again.
  // What a user probably _really_ expects is to logout of OSM so that they can switch users.
  function tryLogout()  {
    if (!osm) return;

    const locale = l10n.localeCode();
    const url = osm.wwwroot + `/logout?locale=${locale}&referer=` + encodeURIComponent(`/login?locale=${locale}`);

    // Create a 600x550 popup window in the center of the screen
    const w = 600;
    const h = 550;
    const settings = [
      ['width', w],
      ['height', h],
      ['left', window.screen.width / 2 - w / 2],
      ['top', window.screen.height / 2 - h / 2],
    ]
    .map(x => x.join('='))
    .join(',');

    window.open(url, '_blank', settings);
  }


  return function(selection) {
    if (!osm) return;

    selection.append('li')
      .attr('class', 'userInfo')
      .classed('hide', true);

    selection.append('li')
      .attr('class', 'loginLogout')
      .classed('hide', true)
      .append('a')
      .attr('href', '#');

    osm.on('authchange', () => updateUserDetails(selection));
    updateUserDetails(selection);
  };

}
