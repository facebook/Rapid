
export function uiDetectionDetails(context) {
  const l10n = context.systems.l10n;
  let _detection;


  function _localeDateString(s) {
    if (!s) return null;
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;

    const localeCode = l10n.localeCode();
    return d.toLocaleDateString(localeCode, options);
  }


  function render(selection) {
    const $details = selection.selectAll('.error-details')
      .data(_detection ? [_detection] : [], d => d.key);

    $details.exit()
      .remove();

    const $$details = $details.enter()
      .append('div')
      .attr('class', 'error-details qa-details-container');

    // description
    const $$description = $$details
      .append('div')
      .attr('class', 'qa-details-subsection');

    $$description
      .append('h3')
      .text(l10n.t('inspector.details') + ':');

    const $$firstseen = $$description
      .attr('class', 'qa-details-item')
      .append('div');

    $$firstseen
      .append('strong')
      .text(l10n.t('inspector.first_seen') + ':');

    $$firstseen
      .append('span')
      .text(d => d.first_seen_at ? _localeDateString(d.first_seen_at) : l10n.t('inspector.unknown'));

    const $$lastseen = $$description
      .attr('class', 'qa-details-item')
      .append('div');

    $$lastseen
      .append('strong')
      .text(l10n.t('inspector.last_seen') + ':');

    $$lastseen
      .append('span')
      .text(d => d.last_seen_at ? _localeDateString(d.last_seen_at) : l10n.t('inspector.unknown'));

  }


  render.datum = function(val) {
    if (!arguments.length) return _detection;
    _detection = val;
    return render;
  };

  return render;
}
