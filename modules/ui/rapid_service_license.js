
export function uiRapidServiceLicense(context) {
  const l10n = context.systems.l10n;

  return function(selection) {
    selection.append('a')
      .attr('href', 'https://mapwith.ai/doc/license/MapWithAILicense.pdf')
      .attr('target', '_blank')
      .text(l10n.t('rapid_feature_license'));
  };
}
