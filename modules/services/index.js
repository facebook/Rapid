export { ServiceEsri } from './ServiceEsri';
export { ServiceImproveOsm } from './ServiceImproveOsm';
export { ServiceKeepRight } from './ServiceKeepRight';
export { ServiceMapWithAI } from './ServiceMapWithAI';
export { ServiceNominatim } from './ServiceNominatim';
export { ServiceNsi } from './ServiceNsi';
export { ServiceOsmose } from './ServiceOsmose';
export { ServiceOsmWikibase } from './ServiceOsmWikibase';
export { ServiceTaginfo } from './ServiceTaginfo';
export { ServiceVectorTile } from './ServiceVectorTile';
export { ServiceWikidata } from './ServiceWikidata';
export { ServiceWikipedia } from './ServiceWikipedia';

import serviceKartaview from './kartaview';
import serviceMapillary from './mapillary';
import serviceOsm from './osm';
import serviceStreetside from './streetside';

// legacy
export const services = {
  kartaview: serviceKartaview,
  mapillary: serviceMapillary,
  osm: serviceOsm,
  streetside: serviceStreetside
};
