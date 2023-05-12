import serviceEsriData from './esri_data';
import serviceFbAIFeatures from './fb_ai_features';
import serviceImproveOSM from './improveOSM';
import serviceKartaview from './kartaview';
import serviceKeepRight from './keepRight';
import serviceMapillary from './mapillary';
import { ServiceNominatim } from './ServiceNominatim';
import serviceNsi from './nsi';
import serviceOsm from './osm';
import { ServiceOsmose } from './ServiceOsmose';
import { ServiceOsmWikibase } from './ServiceOsmWikibase';
import serviceStreetside from './streetside';
import { ServiceTaginfo } from './ServiceTaginfo';
import { ServiceVectorTile } from './ServiceVectorTile';
import { ServiceWikidata } from './ServiceWikidata';
import { ServiceWikipedia } from './ServiceWikipedia';


// legacy
export const services = {
  esriData: serviceEsriData,
  fbMLRoads: serviceFbAIFeatures,
  improveOSM: serviceImproveOSM,
  kartaview: serviceKartaview,
  keepRight: serviceKeepRight,
  mapillary: serviceMapillary,
  nsi: serviceNsi,
  osm: serviceOsm,
  streetside: serviceStreetside
};

// modern
export {
  ServiceNominatim,
  ServiceOsmose,
  ServiceOsmWikibase,
  ServiceTaginfo,
  ServiceVectorTile,
  ServiceWikidata,
  ServiceWikipedia
};
