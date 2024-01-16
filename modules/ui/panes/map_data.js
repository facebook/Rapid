import { uiPane } from '../pane.js';

import { uiSectionDataLayers } from '../sections/data_layers.js';
import { uiSectionMapFeatures } from '../sections/map_features.js';
import { uiSectionMapStyleOptions } from '../sections/map_style_options.js';
import { uiSectionPhotoOverlays } from '../sections/photo_overlays.js';


export function uiPaneMapData(context) {
  const l10n = context.systems.l10n;

  return uiPane(context, 'map-data')
    .key(l10n.t('map_data.key'))
    .label(l10n.t('map_data.title'))
    .description(l10n.t('map_data.description'))
    .iconName('rapid-icon-data')
    .sections([
      uiSectionDataLayers(context),
      uiSectionPhotoOverlays(context),
      uiSectionMapStyleOptions(context),
      uiSectionMapFeatures(context)
    ]);
}
