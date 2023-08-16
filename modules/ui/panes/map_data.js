import { uiPane } from '../pane';

import { uiSectionDataLayers } from '../sections/data_layers';
import { uiSectionMapFeatures } from '../sections/map_features';
import { uiSectionMapStyleOptions } from '../sections/map_style_options';
import { uiSectionPhotoOverlays } from '../sections/photo_overlays';


export function uiPaneMapData(context) {
  return uiPane(context, 'map-data')
    .key(context.t('map_data.key'))
    .label(context.tHtml('map_data.title'))
    .description(context.tHtml('map_data.description'))
    .iconName('rapid-icon-data')
    .sections([
      uiSectionDataLayers(context),
      uiSectionPhotoOverlays(context),
      uiSectionMapStyleOptions(context),
      uiSectionMapFeatures(context)
    ]);
}
