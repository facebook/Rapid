export { ServiceImproveOsm } from './ServiceImproveOsm';
export { ServiceKeepRight } from './ServiceKeepRight';
export { ServiceNominatim } from './ServiceNominatim';
export { ServiceOsmose } from './ServiceOsmose';
export { ServiceOsmWikibase } from './ServiceOsmWikibase';
export { ServiceTaginfo } from './ServiceTaginfo';
export { ServiceVectorTile } from './ServiceVectorTile';
export { ServiceWikidata } from './ServiceWikidata';
export { ServiceWikipedia } from './ServiceWikipedia';

import serviceEsriData from './esri_data';
import serviceFbAIFeatures from './fb_ai_features';
import serviceKartaview from './kartaview';
import serviceMapillary from './mapillary';
import serviceNsi from './nsi';
import serviceOsm from './osm';
import serviceStreetside from './streetside';

// legacy
export const services = {
  esriData: serviceEsriData,
  fbMLRoads: serviceFbAIFeatures,
  kartaview: serviceKartaview,
  mapillary: serviceMapillary,
  nsi: serviceNsi,
  osm: serviceOsm,
  streetside: serviceStreetside
};
