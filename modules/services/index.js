import serviceEsriData from './esri_data';
import serviceFbAIFeatures from './fb_ai_features';
import serviceKeepRight from './keepRight';
import serviceImproveOSM from './improveOSM';
import serviceOsmose from './osmose';
import serviceMapillary from './mapillary';
import serviceMapRules from './maprules';
import serviceNominatim from './nominatim';
import serviceNsi from './nsi';
import serviceKartaview from './kartaview';
import serviceOsm from './osm';
import serviceOsmWikibase from './osm_wikibase';
import serviceStreetside from './streetside';
import { ServiceTaginfo } from './ServiceTaginfo';
import { ServiceVectorTile } from './ServiceVectorTile';
import { ServiceWikidata } from './ServiceWikidata';
import { ServiceWikipedia } from './ServiceWikipedia';


// legacy
export const services = {
  esriData: serviceEsriData,
  fbMLRoads: serviceFbAIFeatures,
  geocoder: serviceNominatim,
  keepRight: serviceKeepRight,
  improveOSM: serviceImproveOSM,
  osmose: serviceOsmose,
  mapillary: serviceMapillary,
  nsi: serviceNsi,
  kartaview: serviceKartaview,
  osm: serviceOsm,
  osmWikibase: serviceOsmWikibase,
  maprules: serviceMapRules,
  streetside: serviceStreetside
};

// modern
export {
//  serviceEsriData,
//  serviceFbAIFeatures,
//  serviceKeepRight,
//  serviceImproveOSM,
//  serviceOsmose,
//  serviceMapillary,
//  serviceMapRules,
//  serviceNominatim,
//  serviceNsi,
//  serviceKartaview,
//  serviceOsm,
//  serviceOsmWikibase,
//  serviceStreetside,
  ServiceTaginfo,
  ServiceVectorTile,
  ServiceWikidata,
  ServiceWikipedia
};
