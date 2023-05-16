export { ServiceEsri } from './ServiceEsri';
export { ServiceImproveOsm } from './ServiceImproveOsm';
export { ServiceKartaview } from './ServiceKartaview';
export { ServiceKeepRight } from './ServiceKeepRight';
export { ServiceMapillary } from './ServiceMapillary';
export { ServiceMapWithAI } from './ServiceMapWithAI';
export { ServiceNominatim } from './ServiceNominatim';
export { ServiceNsi } from './ServiceNsi';
export { ServiceOsmose } from './ServiceOsmose';
export { ServiceOsmWikibase } from './ServiceOsmWikibase';
export { ServiceStreetside } from './ServiceStreetside';
export { ServiceTaginfo } from './ServiceTaginfo';
export { ServiceVectorTile } from './ServiceVectorTile';
export { ServiceWikidata } from './ServiceWikidata';
export { ServiceWikipedia } from './ServiceWikipedia';

import serviceOsm from './osm';

// legacy
export const services = {
  osm: serviceOsm
};
