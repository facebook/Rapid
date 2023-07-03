import { EsriService } from './EsriService';
import { ImproveOsmService } from './ImproveOsmService';
import { KartaviewService } from './KartaviewService';
import { KeepRightService } from './KeepRightService';
import { MapillaryService } from './MapillaryService';
import { MapWithAIService } from './MapWithAIService';
import { NominatimService } from './NominatimService';
import { NsiService } from './NsiService';
import { OsmService } from './OsmService';
import { OsmoseService } from './OsmoseService';
import { OsmWikibaseService } from './OsmWikibaseService';
import { StreetsideService } from './StreetsideService';
import { TaginfoService } from './TaginfoService';
import { VectorTileService } from './VectorTileService';
import { WikidataService } from './WikidataService';
import { WikipediaService } from './WikipediaService';

export {
  EsriService,
  ImproveOsmService,
  KartaviewService,
  KeepRightService,
  MapillaryService,
  MapWithAIService,
  NominatimService,
  NsiService,
  OsmService,
  OsmoseService,
  OsmWikibaseService,
  StreetsideService,
  TaginfoService,
  VectorTileService,
  WikidataService,
  WikipediaService
};

// At init time, we will instantiate any that are in the 'available' collection.
export const services = {
  available: new Map()  // Map (id -> Service constructor)
};

services.available.set('esri', EsriService);
services.available.set('improveOSM', ImproveOsmService);
services.available.set('kartaview', KartaviewService);
services.available.set('keepRight', KeepRightService);
services.available.set('mapillary', MapillaryService);
services.available.set('mapwithai', MapWithAIService);
services.available.set('nominatim', NominatimService);
services.available.set('nsi', NsiService);
services.available.set('osm', OsmService);
services.available.set('osmose', OsmoseService);
services.available.set('osmwikibase', OsmWikibaseService);
services.available.set('streetside', StreetsideService);
services.available.set('taginfo', TaginfoService);
services.available.set('vectortile', VectorTileService);
services.available.set('wikidata', WikidataService);
services.available.set('wikipedia', WikipediaService);
