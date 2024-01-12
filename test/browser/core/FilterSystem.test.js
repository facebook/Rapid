describe('FilterSystem', () => {
  let _filterSystem;

  class MockStorageSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    getItem()     { return ''; }
    setItem()     { }
  }

  class MockUrlHashSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    getParam()    { return ''; }
    setParam()    { }
    on()          { return this; }
  }

  class MockEditSystem {
    constructor() {}
    get staging() { return { graph: new Rapid.Graph() }; }
  }

  class MockContext {
    constructor()   {
      this.systems = {
        editor:  new MockEditSystem(),
        storage: new MockStorageSystem(),
        urlhash: new MockUrlHashSystem()
      };
    }
  }


  beforeEach(() => {
    _filterSystem = new Rapid.FilterSystem(new MockContext());
    return _filterSystem.initAsync();
  });


  it('gets keys', () => {
    const keys = _filterSystem.keys;
    expect(keys).to.include(
      'points', 'traffic_roads', 'service_roads', 'paths',
      'buildings', 'landuse', 'boundaries', 'water', 'rail',
      'power', 'past_future', 'others'
    );
  });

  it('disable', () => {
    _filterSystem.disable('water');
    expect(_filterSystem.isEnabled('water')).to.be.false;
  });

  it('disableAll', () => {
    _filterSystem.disableAll();
    for (const k of _filterSystem.keys) {
      expect(_filterSystem.isEnabled(k)).to.be.false;
    }
  });

  it('enable', () => {
    _filterSystem.disable('water');
    _filterSystem.enable('water');
    expect(_filterSystem.isEnabled('water')).to.be.true;
  });

  it('enableAll', () => {
    _filterSystem.disableAll();
    _filterSystem.enableAll();
    for (const k of _filterSystem.keys) {
      expect(_filterSystem.isEnabled(k)).to.be.true;
    }
  });

  describe('#toggle', () => {
    it('toggles', () => {
      _filterSystem.toggle('water');
      expect(_filterSystem.isEnabled('water')).to.be.false;

      _filterSystem.toggle('water');
      expect(_filterSystem.isEnabled('water')).to.be.true;
    });
  });


  describe('#gatherStats', () => {
    it('counts features', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'point_bar', tags: { amenity: 'bar' }, version: 1}),
        Rapid.osmNode({id: 'point_dock', tags: { waterway: 'dock' }, version: 1}),
        Rapid.osmNode({id: 'point_rail_station', tags: { railway: 'station' }, version: 1}),
        Rapid.osmNode({id: 'point_generator', tags: { power: 'generator' }, version: 1}),
        Rapid.osmNode({id: 'point_old_rail_station', tags: { railway: 'station', disused: 'yes' }, version: 1}),
        Rapid.osmWay({id: 'motorway', tags: { highway: 'motorway' }, version: 1}),
        Rapid.osmWay({id: 'building_yes', tags: { area: 'yes', amenity: 'school', building: 'yes' }, version: 1}),
        Rapid.osmWay({id: 'boundary', tags: { boundary: 'administrative' }, version: 1}),
        Rapid.osmWay({id: 'fence', tags: { barrier: 'fence' }, version: 1})
      ]);
      const all = [...graph.base.entities.values()];

      _filterSystem.gatherStats(all, graph);
      const stats = _filterSystem.stats();

      expect(stats.boundaries).to.eql(1);
      expect(stats.buildings).to.eql(1);
      expect(stats.landuse).to.eql(0);
      expect(stats.traffic_roads).to.eql(1);
      expect(stats.service_roads).to.eql(0);
      expect(stats.others).to.eql(1);
      expect(stats.past_future).to.eql(1);
      expect(stats.paths).to.eql(0);
      expect(stats.points).to.eql(5);
      expect(stats.power).to.eql(1);
      expect(stats.rail).to.eql(2);
      expect(stats.water).to.eql(1);
    });
  });


  describe('matching', () => {
    const graph = new Rapid.Graph([
      // Points
      Rapid.osmNode({id: 'point_bar', tags: {amenity: 'bar'}, version: 1}),
      Rapid.osmNode({id: 'point_dock', tags: {waterway: 'dock'}, version: 1}),
      Rapid.osmNode({id: 'point_rail_station', tags: {railway: 'station'}, version: 1}),
      Rapid.osmNode({id: 'point_generator', tags: {power: 'generator'}, version: 1}),
      Rapid.osmNode({id: 'point_old_rail_station', tags: {railway: 'station', disused: 'yes'}, version: 1}),

      // Traffic Roads
      Rapid.osmWay({id: 'motorway', tags: {highway: 'motorway'}, version: 1}),
      Rapid.osmWay({id: 'motorway_link', tags: {highway: 'motorway_link'}, version: 1}),
      Rapid.osmWay({id: 'trunk', tags: {highway: 'trunk'}, version: 1}),
      Rapid.osmWay({id: 'trunk_link', tags: {highway: 'trunk_link'}, version: 1}),
      Rapid.osmWay({id: 'primary', tags: {highway: 'primary'}, version: 1}),
      Rapid.osmWay({id: 'primary_link', tags: {highway: 'primary_link'}, version: 1}),
      Rapid.osmWay({id: 'secondary', tags: {highway: 'secondary'}, version: 1}),
      Rapid.osmWay({id: 'secondary_link', tags: {highway: 'secondary_link'}, version: 1}),
      Rapid.osmWay({id: 'tertiary', tags: {highway: 'tertiary'}, version: 1}),
      Rapid.osmWay({id: 'tertiary_link', tags: {highway: 'tertiary_link'}, version: 1}),
      Rapid.osmWay({id: 'residential', tags: {highway: 'residential'}, version: 1}),
      Rapid.osmWay({id: 'unclassified', tags: {highway: 'unclassified'}, version: 1}),
      Rapid.osmWay({id: 'living_street', tags: {highway: 'living_street'}, version: 1}),

      // Service Roads
      Rapid.osmWay({id: 'service', tags: {highway: 'service'}, version: 1}),
      Rapid.osmWay({id: 'road', tags: {highway: 'road'}, version: 1}),
      Rapid.osmWay({id: 'track', tags: {highway: 'track'}, version: 1}),

      // Paths
      Rapid.osmWay({id: 'path', tags: {highway: 'path'}, version: 1}),
      Rapid.osmWay({id: 'footway', tags: {highway: 'footway'}, version: 1}),
      Rapid.osmWay({id: 'cycleway', tags: {highway: 'cycleway'}, version: 1}),
      Rapid.osmWay({id: 'bridleway', tags: {highway: 'bridleway'}, version: 1}),
      Rapid.osmWay({id: 'steps', tags: {highway: 'steps'}, version: 1}),
      Rapid.osmWay({id: 'pedestrian', tags: {highway: 'pedestrian'}, version: 1}),

      // Buildings
      Rapid.osmWay({id: 'building_yes', tags: {area: 'yes', amenity: 'school', building: 'yes'}, version: 1}),
      Rapid.osmWay({id: 'building_no', tags: {area: 'yes', amenity: 'school', building: 'no'}, version: 1}),
      Rapid.osmWay({id: 'building_part', tags: { 'building:part': 'yes'}, version: 1}),
      Rapid.osmWay({id: 'garage1', tags: {area: 'yes', amenity: 'parking', parking: 'multi-storey'}, version: 1}),
      Rapid.osmWay({id: 'garage2', tags: {area: 'yes', amenity: 'parking', parking: 'sheds'}, version: 1}),
      Rapid.osmWay({id: 'garage3', tags: {area: 'yes', amenity: 'parking', parking: 'carports'}, version: 1}),
      Rapid.osmWay({id: 'garage4', tags: {area: 'yes', amenity: 'parking', parking: 'garage_boxes'}, version: 1}),

      // Indoor
      Rapid.osmWay({id: 'room', tags: {area: 'yes', indoor: 'room'}, version: 1}),
      Rapid.osmWay({id: 'indoor_area', tags: {area: 'yes', indoor: 'area'}, version: 1}),
      Rapid.osmWay({id: 'indoor_bar', tags: {area: 'yes', indoor: 'room', amenity: 'bar'}, version: 1}),
      Rapid.osmWay({id: 'corridor', tags: {highway: 'corridor', indoor: 'yes'}, version: 1}),

      // Pistes
      Rapid.osmWay({id: 'downhill_piste', tags: {'piste:type': 'downhill'}, version: 1}),
      Rapid.osmWay({id: 'piste_track_combo', tags: {'piste:type': 'alpine', highway: 'track'}, version: 1}),

      // Aerialways
      Rapid.osmWay({id: 'gondola', tags: {aerialway: 'gondola'}, version: 1}),
      Rapid.osmWay({id: 'zip_line', tags: {aerialway: 'zip_line'}, version: 1}),
      Rapid.osmWay({id: 'aerialway_platform', tags: {public_transport: 'platform', aerialway: 'yes'}, version: 1}),
      Rapid.osmWay({id: 'old_aerialway_station', tags: {area: 'yes', aerialway: 'station'}, version: 1}),

      // Landuse
      Rapid.osmWay({id: 'forest', tags: {area: 'yes', landuse: 'forest'}, version: 1}),
      Rapid.osmWay({id: 'scrub', tags: {area: 'yes', natural: 'scrub'}, version: 1}),
      Rapid.osmWay({id: 'industrial', tags: {area: 'yes', landuse: 'industrial'}, version: 1}),
      Rapid.osmWay({id: 'parkinglot', tags: {area: 'yes', amenity: 'parking', parking: 'surface'}, version: 1}),

      // Landuse Multipolygon
      Rapid.osmWay({id: 'outer', version: 1}),
      Rapid.osmWay({id: 'inner1', version: 1}),
      Rapid.osmWay({id: 'inner2', tags: {barrier: 'fence'}, version: 1}),
      Rapid.osmWay({id: 'inner3', tags: {highway: 'residential'}, version: 1}),
      Rapid.osmRelation({id: 'retail', tags: {landuse: 'retail', type: 'multipolygon'},
        members: [
          {id: 'outer', role: 'outer', type: 'way'},
          {id: 'inner1', role: 'inner', type: 'way'},
          {id: 'inner2', role: 'inner', type: 'way'},
          {id: 'inner3', role: 'inner', type: 'way'}
        ],
        version: 1
      }),

      // Boundaries
      Rapid.osmWay({id: 'boundary', tags: {boundary: 'administrative'}, version: 1}),
      Rapid.osmWay({id: 'boundary_road', tags: {boundary: 'administrative', highway: 'primary'}, version: 1}),
      Rapid.osmWay({id: 'boundary_member', version: 1}),
      Rapid.osmWay({id: 'boundary_member2', version: 1}),

      // Boundary relations
      Rapid.osmRelation({id: 'boundary_relation', tags: {type: 'boundary', boundary: 'administrative'},
        members: [
          {id: 'boundary_member'},
        ],
        version: 1
      }),
      Rapid.osmRelation({id: 'boundary_relation2', tags: {type: 'boundary', boundary: 'administrative'},
        members: [
          // ways can be members of multiple boundary relations
          {id: 'boundary_member'},
          {id: 'boundary_member2'}
        ],
        version: 1
      }),

      // Water
      Rapid.osmWay({id: 'water', tags: {area: 'yes', natural: 'water'}, version: 1}),
      Rapid.osmWay({id: 'coastline', tags: {natural: 'coastline'}, version: 1}),
      Rapid.osmWay({id: 'bay', tags: {area: 'yes', natural: 'bay'}, version: 1}),
      Rapid.osmWay({id: 'pond', tags: {area: 'yes', landuse: 'pond'}, version: 1}),
      Rapid.osmWay({id: 'basin', tags: {area: 'yes', landuse: 'basin'}, version: 1}),
      Rapid.osmWay({id: 'reservoir', tags: {area: 'yes', landuse: 'reservoir'}, version: 1}),
      Rapid.osmWay({id: 'salt_pond', tags: {area: 'yes', landuse: 'salt_pond'}, version: 1}),
      Rapid.osmWay({id: 'river', tags: {waterway: 'river'}, version: 1}),

      // Rail
      Rapid.osmWay({id: 'railway', tags: {railway: 'rail'}, version: 1}),
      Rapid.osmWay({id: 'rail_landuse', tags: {area: 'yes', landuse: 'railway'}, version: 1}),
      Rapid.osmWay({id: 'rail_disused', tags: {railway: 'disused'}, version: 1}),
      Rapid.osmWay({id: 'rail_streetcar', tags: {railway: 'tram', highway: 'residential'}, version: 1}),
      Rapid.osmWay({id: 'rail_trail', tags: {railway: 'disused', highway: 'cycleway'}, version: 1}),

      // Power
      Rapid.osmWay({id: 'power_line', tags: {power: 'line'}, version: 1}),

      // Past/Future
      Rapid.osmWay({id: 'motorway_construction', tags: {highway: 'construction', construction: 'motorway'}, version: 1}),
      Rapid.osmWay({id: 'cycleway_proposed', tags: {highway: 'proposed', proposed: 'cycleway'}, version: 1}),
      Rapid.osmWay({id: 'landuse_construction', tags: {area: 'yes', landuse: 'construction'}, version: 1}),

      // Others
      Rapid.osmWay({id: 'fence', tags: {barrier: 'fence'}, version: 1}),
      Rapid.osmWay({id: 'pipeline', tags: {man_made: 'pipeline'}, version: 1}),

      // Site relation
      Rapid.osmRelation({id: 'site', tags: {type: 'site'},
        members: [
          {id: 'fence', role: 'perimeter'},
          {id: 'building_yes'}
        ],
        version: 1
      })

    ]);

    const all = [...graph.base.entities.values()];


    function doMatch(rule, ids) {
      for (const id of ids) {
        const entity = graph.entity(id);
        const geometry = entity.geometry(graph);
        expect(_filterSystem.getMatches(entity, graph, geometry), `doMatch: ${id}`)
          .to.have.property(rule);
      }
    }

    function dontMatch(rule, ids) {
      for (const id of ids) {
        const entity = graph.entity(id);
        const geometry = entity.geometry(graph);
        expect(_filterSystem.getMatches(entity, graph, geometry), `dontMatch: ${id}`)
          .not.to.have.property(rule);
      }
    }


    it('matches points', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('points', [
        'point_bar', 'point_dock', 'point_rail_station',
        'point_generator', 'point_old_rail_station'
      ]);

      dontMatch('points', [
        'motorway', 'service', 'path', 'building_yes',
        'forest', 'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence'
      ]);
    });


    it('matches traffic roads', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('traffic_roads', [
        'motorway', 'motorway_link', 'trunk', 'trunk_link',
        'primary', 'primary_link', 'secondary', 'secondary_link',
        'tertiary', 'tertiary_link', 'residential', 'living_street',
        'unclassified', 'boundary_road', 'inner3'
      ]);

      dontMatch('traffic_roads', [
        'point_bar', 'service', 'road', 'track', 'path', 'building_yes',
        'forest', 'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence'
      ]);
    });


    it('matches service roads', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('service_roads', [
        'service', 'road', 'track', 'piste_track_combo'
      ]);

      dontMatch('service_roads', [
        'point_bar', 'motorway', 'unclassified', 'living_street',
        'path', 'building_yes', 'forest', 'boundary', 'boundary_member', 'water',
        'railway', 'power_line', 'motorway_construction', 'fence'
      ]);
    });


    it('matches paths', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('paths', [
        'path', 'footway', 'cycleway', 'bridleway',
        'steps', 'pedestrian'
      ]);

      dontMatch('paths', [
        'point_bar', 'motorway', 'service', 'building_yes',
        'forest', 'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence', 'corridor'
      ]);
    });


    it('matches buildings', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('buildings', [
        'building_yes',
        'garage1', 'garage2', 'garage3', 'garage4'
      ]);

      dontMatch('buildings', [
        'building_no', 'point_bar', 'motorway', 'service', 'path',
        'forest', 'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence'
      ]);
    });


    it('matches building_parts', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('building_parts', [
        'building_part'
      ]);

      dontMatch('building_parts', [
        'building_yes',
        'garage1', 'garage2', 'garage3', 'garage4',
        'building_no', 'point_bar', 'motorway', 'service', 'path',
        'forest', 'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence'
      ]);
    });


    it('matches indoor', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('indoor', [
        'room', 'indoor_area', 'indoor_bar', 'corridor'
      ]);

      dontMatch('indoor', [
        'downhill_piste', 'piste_track_combo',
        'building_part', 'garage1', 'garage2', 'garage3', 'garage4',
        'building_no', 'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence',
        'inner3', 'forest', 'scrub', 'industrial', 'parkinglot', 'building_no',
        'rail_landuse', 'landuse_construction', 'retail',
        'outer', 'inner1', 'inner2'
      ]);
    });


    it('matches pistes', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('pistes', [
        'downhill_piste', 'piste_track_combo'
      ]);

      dontMatch('pistes', [
        'room', 'indoor_area', 'indoor_bar', 'corridor',
        'building_part', 'garage1', 'garage2', 'garage3', 'garage4',
        'building_no', 'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence',
        'inner3', 'forest', 'scrub', 'industrial', 'parkinglot', 'building_no',
        'rail_landuse', 'landuse_construction', 'retail',
        'outer', 'inner1', 'inner2'
      ]);
    });


    it('matches aerialways', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('aerialways', [
        'gondola', 'zip_line'
      ]);

      dontMatch('aerialways', [
        'aerialway_platform', 'old_aerialway_station',

        'downhill_piste', 'piste_track_combo',
        'room', 'indoor_area', 'indoor_bar', 'corridor',
        'building_part', 'garage1', 'garage2', 'garage3', 'garage4',
        'building_no', 'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence',
        'inner3', 'forest', 'scrub', 'industrial', 'parkinglot', 'building_no',
        'rail_landuse', 'landuse_construction', 'retail',
        'outer', 'inner1', 'inner2'
      ]);
    });


    it('matches landuse', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('landuse', [
        'forest', 'scrub', 'industrial', 'parkinglot', 'building_no',
        'rail_landuse', 'landuse_construction', 'retail',
        'outer', 'inner1', 'inner2'  // non-interesting members of landuse multipolygon
      ]);

      dontMatch('landuse', [
        'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence',
        'inner3'   // member of landuse multipolygon, but tagged as highway
      ]);
    });


    it('matches boundaries', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('boundaries', [
        'boundary',
        // match ways that are part of boundary relations - #5601
        'boundary_member', 'boundary_member2',
        // relations
        'boundary_relation', 'boundary_relation2'
      ]);

      dontMatch('boundaries', [
        'boundary_road',   // because boundary also used as highway - #4973
        'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'forest', 'water', 'railway', 'power_line',
        'motorway_construction', 'fence'
      ]);
    });


    it('matches water', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('water', [
        'point_dock', 'water', 'coastline', 'bay', 'pond',
        'basin', 'reservoir', 'salt_pond', 'river'
      ]);

      dontMatch('water', [
        'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'forest', 'boundary', 'boundary_member', 'railway', 'power_line',
        'motorway_construction', 'fence'
      ]);
    });


    it('matches rail', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('rail', [
        'point_rail_station', 'point_old_rail_station',
        'railway', 'rail_landuse', 'rail_disused'
      ]);

      dontMatch('rail', [
        'rail_streetcar', 'rail_trail',  // because rail also used as highway
        'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'forest', 'boundary', 'boundary_member', 'water', 'power_line',
        'motorway_construction', 'fence'
      ]);
    });


    it('matches power', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('power', [
        'point_generator', 'power_line'
      ]);

      dontMatch('power', [
        'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'forest', 'boundary', 'boundary_member', 'water', 'railway',
        'motorway_construction', 'fence'
      ]);
    });


    it('matches past/future', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('past_future', [
        'point_old_rail_station', 'rail_disused',
        'motorway_construction', 'cycleway_proposed', 'landuse_construction'
      ]);

      dontMatch('past_future', [
        'rail_trail',  // because rail also used as highway
        'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'forest', 'boundary', 'boundary_member', 'water', 'railway', 'power_line', 'fence'
      ]);
    });


    it('matches others', () => {
      _filterSystem.gatherStats(all, graph);

      doMatch('others', [
        'fence', 'pipeline'
      ]);

      dontMatch('others', [
        'point_bar', 'motorway', 'service', 'path', 'building_yes',
        'forest', 'boundary', 'boundary_member', 'water', 'railway', 'power_line',
        'motorway_construction', 'retail', 'outer', 'inner1', 'inner2', 'inner3'
      ]);
    });
  });


  describe('hiding', () => {
    it('hides child vertices on a hidden way', () => {
      const a = Rapid.osmNode({id: 'a', version: 1});
      const b = Rapid.osmNode({id: 'b', version: 1});
      const w = Rapid.osmWay({id: 'w', nodes: [a.id, b.id], tags: { highway: 'path' }, version: 1});
      const graph = new Rapid.Graph([a, b, w]);
      const geometry = a.geometry(graph);
      const all = [...graph.base.entities.values()];

      _filterSystem.disable('paths');
      _filterSystem.gatherStats(all, graph);

      expect(_filterSystem.isHiddenChild(a, graph, geometry)).to.be.true;
      expect(_filterSystem.isHiddenChild(b, graph, geometry)).to.be.true;
      expect(_filterSystem.isHidden(a, graph, geometry)).to.be.true;
      expect(_filterSystem.isHidden(b, graph, geometry)).to.be.true;
    });

    it('hides uninteresting (e.g. untagged or "other") member ways on a hidden multipolygon relation', () => {
      const outer = Rapid.osmWay({id: 'outer', tags: {area: 'yes', natural: 'wood'}, version: 1});
      const inner1 = Rapid.osmWay({id: 'inner1', tags: {barrier: 'fence'}, version: 1});
      const inner2 = Rapid.osmWay({id: 'inner2', version: 1});
      const inner3 = Rapid.osmWay({id: 'inner3', tags: {highway: 'residential'}, version: 1});
      const r = Rapid.osmRelation({
        id: 'r',
        tags: {type: 'multipolygon'},
        members: [
          {id: outer.id, role: 'outer', type: 'way'},
          {id: inner1.id, role: 'inner', type: 'way'},
          {id: inner2.id, role: 'inner', type: 'way'},
          {id: inner3.id, role: 'inner', type: 'way'}
        ],
        version: 1
      });
      const graph = new Rapid.Graph([outer, inner1, inner2, inner3, r]);
      const all = [...graph.base.entities.values()];

      _filterSystem.disable('landuse');
      _filterSystem.gatherStats(all, graph);

      expect(_filterSystem.isHidden(outer, graph, outer.geometry(graph))).to.be.true;     // iD#2548
      expect(_filterSystem.isHidden(inner1, graph, inner1.geometry(graph))).to.be.true;   // iD#2548
      expect(_filterSystem.isHidden(inner2, graph, inner2.geometry(graph))).to.be.true;   // iD#2548
      expect(_filterSystem.isHidden(inner3, graph, inner3.geometry(graph))).to.be.false;  // iD#2887
    });

    it('hides only versioned entities', () => {
      const a = Rapid.osmNode({id: 'a', version: 1});
      const b = Rapid.osmNode({id: 'b'});
      const graph = new Rapid.Graph([a, b]);
      const ageo = a.geometry(graph);
      const bgeo = b.geometry(graph);
      const all = [...graph.base.entities.values()];

      _filterSystem.disable('points');
      _filterSystem.gatherStats(all, graph);

      expect(_filterSystem.isHidden(a, graph, ageo)).to.be.true;
      expect(_filterSystem.isHidden(b, graph, bgeo)).to.be.false;
    });

    it('shows a hidden entity if forceVisible', () => {
      const a = Rapid.osmNode({id: 'a', version: 1});
      const graph = new Rapid.Graph([a]);
      const ageo = a.geometry(graph);
      const all = [...graph.base.entities.values()];

      _filterSystem.disable('points');
      _filterSystem.gatherStats(all, graph);
      _filterSystem.forceVisible(['a']);

      expect(_filterSystem.isHidden(a, graph, ageo)).to.be.false;
    });

  });

});
