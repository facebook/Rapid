
export function uiRapidServiceLicense(context) {
  return function(selection) {
    selection.append('a')
      .attr('href', 'https://mapwith.ai/doc/license/MapWithAILicense.pdf')
      .attr('target', '_blank')
      .text(context.t('rapid_feature_license'));
  };
}
