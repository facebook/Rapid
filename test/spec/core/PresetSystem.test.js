describe('PresetSystem', () => {
  let _context;
  let _savedAreaKeys;

  class MockStorageSystem {
    constructor() { }
    getItem() { return ''; }
  }

  class MockLocationSystem {
    constructor() { }
  }

  class MockContext {
    constructor()   {
      this._storageSystem = new MockStorageSystem();
      this._locationSystem = new MockLocationSystem();
     }
    storageSystem()  { return this._storageSystem; }
    locationSystem() { return this._locationSystem; }
  }


  beforeEach(() => {
    _context = new MockContext();
    Rapid.fileFetcher.cache().preset_presets = {};
    _savedAreaKeys = Rapid.osmAreaKeys;
  });

  afterEach(() => {
    Rapid.fileFetcher.cache().preset_presets = {};
    Rapid.osmSetAreaKeys(_savedAreaKeys);
  });


  describe('#initAsync', () => {
    it('has a fallback point preset', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const graph = new Rapid.Graph([node]);
      const presets = new Rapid.PresetSystem(_context);
      expect(presets.match(node, graph).id).to.eql('point');
    });

    it('has a fallback line preset', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const way = Rapid.osmWay({ id: 'w', nodes: ['n'] });
      const graph = new Rapid.Graph([node, way]);
      const presets = new Rapid.PresetSystem(_context);
      expect(presets.match(way, graph).id).to.eql('line');
    });

    it('has a fallback area preset', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const way = Rapid.osmWay({ id: 'w', nodes: ['n'], tags: { area: 'yes' }});
      const graph = new Rapid.Graph([node, way]);
      const presets = new Rapid.PresetSystem(_context);
      expect(presets.match(way, graph).id).to.eql('area');
    });

    it('has a fallback relation preset', () => {
      const relation = Rapid.osmRelation({ id: 'r' });
      const graph = new Rapid.Graph([relation]);
      const presets = new Rapid.PresetSystem(_context);
      expect(presets.match(relation, graph).id).to.eql('relation');
    });
  });


  describe('#match', () => {
    const testPresets = {
      residential: { tags: { highway: 'residential' }, geometry: ['line'] },
      park: { tags: { leisure: 'park' }, geometry: ['point', 'area'] }
    };

    it('returns a collection containing presets matching a geometry and tags', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);

      return presets.initAsync().then(() => {
        const way = Rapid.osmWay({ tags: { highway: 'residential' } });
        const graph = new Rapid.Graph([way]);
        expect(presets.match(way, graph).id).to.eql('residential');
      });
    });

    it('returns the appropriate fallback preset when no tags match', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      const point = Rapid.osmNode();
      const line = Rapid.osmWay({ tags: { foo: 'bar' } });
      const graph = new Rapid.Graph([point, line]);

      return presets.initAsync().then(() => {
        expect(presets.match(point, graph).id).to.eql('point');
        expect(presets.match(line, graph).id).to.eql('line');
      });
    });

    it('matches vertices on a line as points', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      const point = Rapid.osmNode({ tags: { leisure: 'park' } });
      const line = Rapid.osmWay({ nodes: [point.id], tags: { 'highway': 'residential' } });
      const graph = new Rapid.Graph([point, line]);

      return presets.initAsync().then(() => {
        expect(presets.match(point, graph).id).to.eql('point');
      });
    });

    it('matches vertices on an addr:interpolation line as points', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      const point = Rapid.osmNode({ tags: { leisure: 'park' } });
      const line = Rapid.osmWay({ nodes: [point.id], tags: { 'addr:interpolation': 'even' } });
      const graph = new Rapid.Graph([point, line]);

      return presets.initAsync().then(() => {
        expect(presets.match(point, graph).id).to.eql('park');
      });
    });
  });


  describe('#areaKeys', () => {
    const testPresets = {
      'amenity/fuel/shell': { tags: { 'amenity': 'fuel' }, geometry: ['point', 'area'], suggestion: true },
      'highway/foo': { tags: { 'highway': 'foo' }, geometry: ['area'] },
      'leisure/track': { tags: { 'leisure': 'track' }, geometry: ['line', 'area'] },
      'natural': { tags: { 'natural': '*' }, geometry: ['point', 'vertex', 'area'] },
      'natural/peak': { tags: { 'natural': 'peak' }, geometry: ['point', 'vertex'] },
      'natural/tree_row': { tags: { 'natural': 'tree_row' }, geometry: ['line'] },
      'natural/wood': { tags: { 'natural': 'wood' }, geometry: ['point', 'area'] }
    };

    it('includes keys for presets with area geometry', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      return presets.initAsync().then(() => {
        expect(presets.areaKeys()).to.include.keys('natural');
      });
    });

    it('discards key-values for presets with a line geometry', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      return presets.initAsync().then(() => {
        expect(presets.areaKeys().natural).to.include.keys('tree_row');
        expect(presets.areaKeys().natural.tree_row).to.be.true;
      });
    });

    it('discards key-values for presets with both area and line geometry', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      return presets.initAsync().then(() => {
        expect(presets.areaKeys().leisure).to.include.keys('track');
      });
    });

    it('does not discard key-values for presets with neither area nor line geometry', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      return presets.initAsync().then(() => {
        expect(presets.areaKeys().natural).not.to.include.keys('peak');
      });
    });

    it('does not discard generic \'*\' key-values', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      return presets.initAsync().then(() => {
        expect(presets.areaKeys().natural).not.to.include.keys('natural');
      });
    });

    it('ignores keys like \'highway\' that are assumed to be lines', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      return presets.initAsync().then(() => {
        expect(presets.areaKeys()).not.to.include.keys('highway');
      });
    });

    it('ignores suggestion presets', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      return presets.initAsync().then(() => {
        expect(presets.areaKeys()).not.to.include.keys('amenity');
      });
    });
  });


  describe('#merge', () => {
    it('builds presets from provided', () => {
      const surfShop = Rapid.osmNode({ tags: { amenity: 'shop', 'shop:type': 'surf' } });
      const presets = new Rapid.PresetSystem(_context);
      const presetData = {
        presets: {
          'amenity/shop/surf': {
            tags: { amenity: 'shop', 'shop:type': 'surf' },
            geometry: ['point', 'area']
          }
        }
      };

      let matched = presets.match(surfShop, new Rapid.Graph([surfShop]));
      expect(matched.id).to.eql('point');   // no surfshop preset yet, matches fallback point
      presets.merge(presetData);

      matched = presets.match(surfShop, new Rapid.Graph([surfShop]));
      expect(matched.id).to.eql('amenity/shop/surf');
    });
  });


  describe('#match', () => {
    const testPresets = {
      building: {
        name: 'Building',
        tags: { building: 'yes' },
        geometry: ['area']
      },
      'type/multipolygon': {
        name: 'Multipolygon',
        geometry: ['area', 'relation'],
        tags: { 'type': 'multipolygon' },
        searchable: false,
        matchScore: 0.1
      },
      address: {
        name: 'Address',
        geometry: ['point', 'vertex', 'area'],
        tags: { 'addr:*': '*' },
        matchScore: 0.15
      },
      'highway/pedestrian_area': {
        name: 'Pedestrian Area',
        geometry: ['area'],
        tags: { highway: 'pedestrian', area: 'yes' }
      }
    };

    it('prefers building to multipolygon', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      const relation = Rapid.osmRelation({ tags: { type: 'multipolygon', building: 'yes' } });
      const graph = new Rapid.Graph([relation]);
      return presets.initAsync().then(() => {
        const match = presets.match(relation, graph);
        expect(match.id).to.eql('building');
      });
    });

    it('prefers building to address', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      const way = Rapid.osmWay({ tags: { area: 'yes', building: 'yes', 'addr:housenumber': '1234' } });
      const graph = new Rapid.Graph([way]);
      return presets.initAsync().then(() => {
        const match = presets.match(way, graph);
        expect(match.id).to.eql('building');
      });
    });

    it('prefers pedestrian to area', () => {
      Rapid.fileFetcher.cache().preset_presets = testPresets;
      const presets = new Rapid.PresetSystem(_context);
      const way = Rapid.osmWay({ tags: { area: 'yes', highway: 'pedestrian' } });
      const graph = new Rapid.Graph([way]);
      return presets.initAsync().then(() => {
        const match = presets.match(way, graph);
        expect(match.id).to.eql('highway/pedestrian_area');
      });
    });
  });

});
