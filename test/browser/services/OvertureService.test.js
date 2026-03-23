describe('OvertureService', () => {
  let overture;
  let pmtiles;

  class MockContext {
    constructor() {
      this.systems = {};
      this.services = {
        vectortile: {
          initAsync: () => Promise.resolve(),
          startAsync: () => Promise.resolve()
        }
      };
      // PMTilesService must be available at runtime
      this.services.pmtiles = new Rapid.PMTilesService(this);
    }
  }

  beforeEach(() => {
    const ctx = new MockContext();
    overture = new Rapid.OvertureService(ctx);
    pmtiles = ctx.services.pmtiles;
  });


  describe('PMTilesService#geojsonToOSMPolygon', () => {
    const triangle = {
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]
      },
      properties: { id: '08f2649b-0733-b91f' }
    };

    it('creates a closed way with correct node count', () => {
      const tags = { building: 'yes', source: 'microsoft/BuildingFootprints' };
      const entities = pmtiles.geojsonToOSMPolygon(triangle, tags, 'feat1', 'ml-buildings-overture', 'overture');
      const way = entities[entities.length - 1];
      // 3 unique coords → 3 nodes, way refs = [n0, n1, n2, n0]
      expect(way.nodes.length).to.eql(4);
      expect(way.nodes[0]).to.eql(way.nodes[3]);
    });

    it('applies provided tags', () => {
      const tags = { building: 'yes', source: 'microsoft/BuildingFootprints' };
      const entities = pmtiles.geojsonToOSMPolygon(triangle, tags, 'feat1', 'ml-buildings-overture', 'overture');
      const way = entities[entities.length - 1];
      expect(way.tags.building).to.eql('yes');
      expect(way.tags.source).to.eql('microsoft/BuildingFootprints');
    });

    it('sets __service__ metadata from serviceName parameter', () => {
      const tags = { building: 'yes' };
      const entities = pmtiles.geojsonToOSMPolygon(triangle, tags, 'feat1', 'esri-buildings', 'overture');
      const way = entities[entities.length - 1];
      expect(way.__service__).to.eql('overture');
      expect(way.__datasetid__).to.eql('esri-buildings');
    });

    it('returns null for missing geometry', () => {
      expect(pmtiles.geojsonToOSMPolygon({}, { building: 'yes' }, 'feat1', 'esri-buildings', 'overture')).to.be.null;
    });

    it('returns null for too few coordinates', () => {
      const bad = { geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] } };
      expect(pmtiles.geojsonToOSMPolygon(bad, { building: 'yes' }, 'feat1', 'esri-buildings', 'overture')).to.be.null;
    });
  });


  describe('PMTilesService#geojsonToOSMLine', () => {
    it('creates an open way from LineString coordinates', () => {
      const coords = [[0, 0], [1, 0], [1, 1]];
      const tags = { highway: 'residential', source: 'TomTom' };
      const entities = pmtiles.geojsonToOSMLine(coords, tags, 'feat1', 'tomtom-roads', 'overture');
      const way = entities[entities.length - 1];

      // 3 coords → 3 nodes, way should NOT be closed
      expect(way.nodes.length).to.eql(3);
      expect(way.nodes[0]).to.not.eql(way.nodes[2]);
    });

    it('sets metadata on nodes and way', () => {
      const coords = [[0, 0], [1, 0]];
      const tags = { highway: 'residential', source: 'TomTom' };
      const entities = pmtiles.geojsonToOSMLine(coords, tags, 'feat1', 'tomtom-roads', 'overture');
      const way = entities[entities.length - 1];
      const node = entities[0];

      expect(way.__fbid__).to.eql('tomtom-roads-feat1');
      expect(way.__service__).to.eql('overture');
      expect(way.__datasetid__).to.eql('tomtom-roads');

      expect(node.__fbid__).to.eql('tomtom-roads-feat1-n0');
      expect(node.__service__).to.eql('overture');
      expect(node.__datasetid__).to.eql('tomtom-roads');
    });

    it('applies provided tags', () => {
      const coords = [[0, 0], [1, 0]];
      const tags = { highway: 'primary', source: 'TomTom' };
      const entities = pmtiles.geojsonToOSMLine(coords, tags, 'feat1', 'tomtom-roads', 'overture');
      const way = entities[entities.length - 1];
      expect(way.tags.highway).to.eql('primary');
      expect(way.tags.source).to.eql('TomTom');
    });

    it('returns null for too few coordinates', () => {
      expect(pmtiles.geojsonToOSMLine([[0, 0]], {}, 'feat1', 'tomtom-roads', 'overture')).to.be.null;
    });

    it('returns null for null coords', () => {
      expect(pmtiles.geojsonToOSMLine(null, {}, 'feat1', 'tomtom-roads', 'overture')).to.be.null;
    });
  });


  describe('#_getTransportationSource', () => {
    it('returns source from sources array with dataset field', () => {
      expect(overture._getTransportationSource({
        sources: [{ dataset: 'TomTom', license: 'ODbL-1.0' }]
      })).to.eql('TomTom');
    });

    it('parses sources when encoded as JSON string', () => {
      expect(overture._getTransportationSource({
        sources: '[{"dataset":"TomTom","license":"ODbL-1.0"}]'
      })).to.eql('TomTom');
    });

    it('returns null for missing properties', () => {
      expect(overture._getTransportationSource(null)).to.be.null;
      expect(overture._getTransportationSource({})).to.be.null;
    });

    it('returns null for empty sources array', () => {
      expect(overture._getTransportationSource({ sources: [] })).to.be.null;
    });

    it('returns null for malformed JSON string', () => {
      expect(overture._getTransportationSource({ sources: 'not-json' })).to.be.null;
    });
  });


  describe('#_mapOvertureTransportationTags', () => {
    it('maps basic highway class', () => {
      const tags = overture._mapOvertureTransportationTags({ class: 'residential' });
      expect(tags.highway).to.eql('residential');
      expect(tags.source).to.eql('TomTom');
    });

    it('maps unknown class to road', () => {
      const tags = overture._mapOvertureTransportationTags({ class: 'unknown' });
      expect(tags.highway).to.eql('road');
    });

    it('appends _link for link subclass', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'motorway',
        subclass_rules: [{ value: 'link' }]
      });
      expect(tags.highway).to.eql('motorway_link');
    });

    it('does not append _link for non-link types', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'residential',
        subclass_rules: [{ value: 'link' }]
      });
      // residential is not in the linkTypes set
      expect(tags.highway).to.eql('residential');
    });

    it('handles subclass_rules as a string', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'primary',
        subclass_rules: 'link'
      });
      expect(tags.highway).to.eql('primary_link');
    });

    it('maps sidewalk subclass to footway=sidewalk', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'footway',
        subclass_rules: [{ value: 'sidewalk' }]
      });
      expect(tags.highway).to.eql('footway');
      expect(tags.footway).to.eql('sidewalk');
    });

    it('maps crosswalk subclass to footway=crossing', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'footway',
        subclass_rules: [{ value: 'crosswalk' }]
      });
      expect(tags.footway).to.eql('crossing');
    });

    it('does not set footway tag if highway is not footway', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'residential',
        subclass_rules: [{ value: 'sidewalk' }]
      });
      expect(tags.footway).to.be.undefined;
    });

    it('maps road_surface to surface tag', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'residential',
        road_surface: [{ value: 'gravel' }]
      });
      expect(tags.surface).to.eql('gravel');
    });

    it('handles surface as a string fallback', () => {
      const tags = overture._mapOvertureTransportationTags({
        class: 'residential',
        surface: 'paved'
      });
      expect(tags.surface).to.eql('paved');
    });

    it('always sets source=TomTom', () => {
      const tags = overture._mapOvertureTransportationTags({});
      expect(tags.source).to.eql('TomTom');
    });
  });


  describe('PMTilesService#sampleLinePoints', () => {
    it('returns empty for less than 2 coords', () => {
      expect(pmtiles.sampleLinePoints([[0, 0]], 20, 5)).to.eql([]);
      expect(pmtiles.sampleLinePoints([], 20, 5)).to.eql([]);
      expect(pmtiles.sampleLinePoints(null, 20, 5)).to.eql([]);
    });

    it('returns first point for zero-length line', () => {
      const result = pmtiles.sampleLinePoints([[5, 5], [5, 5]], 20, 5);
      expect(result.length).to.eql(1);
      expect(result[0]).to.eql([5, 5]);
    });

    it('samples points along a line', () => {
      // A line about 111km long (1 degree of latitude)
      const coords = [[0, 0], [0, 1]];
      const result = pmtiles.sampleLinePoints(coords, 20, 5);
      expect(result.length).to.be.greaterThan(1);
      expect(result.length).to.be.at.most(20);
      // First point should be the start
      expect(result[0]).to.eql([0, 0]);
    });

    it('respects maxSamples limit', () => {
      const coords = [[0, 0], [0, 1]];
      const result = pmtiles.sampleLinePoints(coords, 5, 1);
      expect(result.length).to.be.at.most(5);
    });
  });


  describe('PMTilesService#isConflatedWithOSM', () => {
    it('returns false for null/short coords', () => {
      expect(pmtiles.isConflatedWithOSM(null, [])).to.be.false;
      expect(pmtiles.isConflatedWithOSM([[0, 0]], [])).to.be.false;
    });

    it('returns false when no highways to compare against', () => {
      const coords = [[10, 10], [10.001, 10]];
      expect(pmtiles.isConflatedWithOSM(coords, [])).to.be.false;
    });

    it('returns true when line overlaps an OSM highway', () => {
      const lineCoords = [[10, 10], [10.001, 10]];
      const highway = {
        coords: [[10, 10], [10.001, 10]],
        bbox: { minX: 9.999, minY: 9.999, maxX: 10.002, maxY: 10.001 }
      };
      expect(pmtiles.isConflatedWithOSM(lineCoords, [highway])).to.be.true;
    });

    it('returns false when line is far from OSM highways', () => {
      const lineCoords = [[20, 20], [20.001, 20]];
      const highway = {
        coords: [[10, 10], [10.001, 10]],
        bbox: { minX: 9.999, minY: 9.999, maxX: 10.002, maxY: 10.001 }
      };
      expect(pmtiles.isConflatedWithOSM(lineCoords, [highway])).to.be.false;
    });

    it('returns false when line diverges from OSM highway at an angle', () => {
      // A road that shares a starting point with an OSM highway but diverges at ~45 degrees.
      // The interior sample points should be far enough away to avoid conflation.
      const lineCoords = [[10, 10], [10.0003, 10.0003], [10.0006, 10.0006]];
      const highway = {
        coords: [[10, 10], [10.0003, 10], [10.0006, 10]],
        bbox: { minX: 9.999, minY: 9.999, maxX: 10.001, maxY: 10.001 }
      };
      expect(pmtiles.isConflatedWithOSM(lineCoords, [highway])).to.be.false;
    });
  });


  describe('#_conflateTransportation', () => {
    // _conflateTransportation requires a fully wired context with editor, viewport, etc.
    // These tests use minimal mocks to test the filtering and conversion logic.

    function makeContextWithOSMHighways(osmWays) {
      // Build a minimal mock graph and editor
      const nodeEntities = {};
      const wayEntities = {};
      const allEntities = [];

      for (const w of osmWays) {
        const nodeIDs = [];
        for (let i = 0; i < w.coords.length; i++) {
          const nodeID = `n${Object.keys(nodeEntities).length}`;
          nodeEntities[nodeID] = { id: nodeID, type: 'node', loc: w.coords[i] };
          nodeIDs.push(nodeID);
        }
        const wayID = `w${Object.keys(wayEntities).length}`;
        const way = {
          id: wayID,
          type: 'way',
          tags: { highway: w.highway },
          nodes: nodeIDs
        };
        wayEntities[wayID] = way;
        allEntities.push(way);
      }

      const graph = {
        entity: (id) => nodeEntities[id] || wayEntities[id]
      };

      const ctx = {
        systems: {
          editor: {
            staging: { graph },
            intersects: () => allEntities,
            on: () => {}
          }
        },
        services: {
          vectortile: {
            initAsync: () => Promise.resolve(),
            startAsync: () => Promise.resolve()
          }
        },
        viewport: {
          transform: { zoom: 18 },
          visibleExtent: () => ({
            min: [-180, -90],
            max: [180, 90],
            rectangle: () => [-180, -90, 180, 90],
            bbox: () => ({ minX: -180, minY: -90, maxX: 180, maxY: 90 })
          })
        }
      };

      // Add PMTilesService to the mock context
      ctx.services.pmtiles = new Rapid.PMTilesService(ctx);

      return ctx;
    }

    it('rejects OSM-sourced features', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
          properties: { sources: [{ dataset: 'OpenStreetMap' }], class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result).to.eql([]);
    });

    it('rejects non-TomTom features', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
          properties: { sources: [{ dataset: 'SomeOther' }], class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result).to.eql([]);
    });

    it('accepts TomTom features with no nearby OSM highways', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result.length).to.be.greaterThan(0);
    });

    it('accepts TomTom features via sources JSON string', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1b',
        geojson: {
          id: 'f1b',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: '[{"dataset":"TomTom"}]', class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result.length).to.be.greaterThan(0);
    });

    it('skips Point geometry', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result).to.eql([]);
    });

    it('deduplicates features by ID', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f1',
        geojson: {
          id: 'f1',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'residential' }
        }
      }];

      // Process twice
      svc._conflateTransportation(features, 'tomtom-roads');
      // Second call: f1 is already in seen set, should not add again
      const result = svc._conflateTransportation(features, 'tomtom-roads');
      // The ways from tree should contain only 1 way (from the first call)
      const ways = result.filter(e => e.type === 'way');
      expect(ways.length).to.eql(1);
    });

    it('returns empty for null/empty input', () => {
      const ctx = makeContextWithOSMHighways([]);
      const svc = new Rapid.OvertureService(ctx);
      expect(svc._conflateTransportation(null, 'tomtom-roads')).to.eql([]);
      expect(svc._conflateTransportation([], 'tomtom-roads')).to.eql([]);
    });

    it('rejects TomTom road overlapping a same-mode OSM highway', () => {
      const ctx = makeContextWithOSMHighways([
        { highway: 'residential', coords: [[10, 10], [10.001, 10]] }
      ]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f2',
        geojson: {
          id: 'f2',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'residential' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result).to.eql([]);
    });

    it('does not reject a non-motorized road near a motorized OSM highway', () => {
      const ctx = makeContextWithOSMHighways([
        { highway: 'residential', coords: [[10, 10], [10.001, 10]] }
      ]);
      const svc = new Rapid.OvertureService(ctx);

      const features = [{
        id: 'f3',
        geojson: {
          id: 'f3',
          geometry: { type: 'LineString', coordinates: [[10, 10], [10.001, 10]] },
          properties: { sources: [{ dataset: 'TomTom' }], class: 'footway' }
        }
      }];

      const result = svc._conflateTransportation(features, 'tomtom-roads');
      expect(result.length).to.be.greaterThan(0);
    });
  });

});
