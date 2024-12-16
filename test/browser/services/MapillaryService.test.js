describe('MapillaryService', () => {
  let _mapillary;

  class MockGfxSystem {
    constructor()     {}
    deferredRedraw()  {}
    immediateRedraw() {}
  }

  class MockContext {
    constructor() {
      this.systems = {
        gfx: new MockGfxSystem()
      };

      this.viewport = new Rapid.sdk.Viewport();
      this.viewport.transform = { x: -116508, y: 0, k: Rapid.sdk.geoZoomToScale(14) };  // [10°, 0°]
      this.viewport.dimensions = [64, 64];
    }
  }


  beforeEach(() => {
    fetchMock.removeRoutes().clearHistory();
    _mapillary = new Rapid.MapillaryService(new MockContext());

    // Mock function for retieving tile data.. The original expects a protobuffer vector tile.
    _mapillary._loadTileDataToCache = () => { };

    return _mapillary.initAsync();
  });

  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();
  });


  describe('#initAsync', () => {
    it('initializes cache', () => {
      const cache = _mapillary._cache;
      expect(cache).to.have.property('images');
      expect(cache).to.have.property('detections');
      expect(cache).to.have.property('signs');
      expect(cache).to.have.property('sequences');
      expect(cache).to.have.property('segmentations');
    });
  });


  describe('#resetAsync', () => {
    it('resets cache', () => {
      _mapillary._cache.images.data.set('foo', 'bar');

      return _mapillary.resetAsync()
        .then(() => {
          expect(_mapillary._cache.images.data.has('foo')).to.be.false;
        });
    });
  });


  describe('#getData', () => {
    it('returns images in the visible map area', () => {
      const data = [
        { type: 'photo', id: 'photo0', loc: [10,0], ca: 90, isPano: false, sequenceID: 'seq1' },
        { type: 'photo', id: 'photo1', loc: [10,0], ca: 90, isPano: false, sequenceID: 'seq1' },
        { type: 'photo', id: 'photo2', loc: [10,1], ca: 90, isPano: false, sequenceID: 'seq1' }
      ];
      const boxes = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: data[0] },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: data[1] },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: data[2] }
      ];

      const cache = _mapillary._cache;
      for (const d of data) {
        cache.images.data.set(d.id, d);
      }
      cache.images.rbush.load(boxes);

      const result = _mapillary.getData('images');
      expect(result).to.deep.eql([data[0], data[1]]);
    });


    it('returns detections in the visible map area', () => {
      const data = [
        { type: 'detection', id: 'detect0', loc: [10,0], object_type: 'point' },
        { type: 'detection', id: 'detect1', loc: [10,0], object_type: 'point' },
        { type: 'detection', id: 'detect2', loc: [10,1], object_type: 'point' }
      ];
      const boxes = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: data[0] },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: data[1] },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: data[2] }
      ];

      const cache = _mapillary._cache;
      for (const d of data) {
        cache.detections.data.set(d.id, d);
      }
      cache.detections.rbush.load(boxes);

      const result = _mapillary.getData('detections');
      expect(result).to.deep.eql([data[0], data[1]]);
    });


    it('returns signs in the visible map area', () => {
      const data = [
        { type: 'detection', id: 'sign0', loc: [10,0], object_type: 'traffic_sign' },
        { type: 'detection', id: 'sign1', loc: [10,0], object_type: 'traffic_sign' },
        { type: 'detection', id: 'sign2', loc: [10,1], object_type: 'traffic_sign' }
      ];
      const boxes = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: data[0] },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: data[1] },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: data[2] }
      ];

      // signs are now also stored in the detections cache
      const cache = _mapillary._cache;
      for (const d of data) {
        cache.detections.data.set(d.id, d);
      }
      cache.detections.rbush.load(boxes);

      const result = _mapillary.getData('signs');
      expect(result).to.deep.eql([data[0], data[1]]);
    });
  });


  describe('#getSequences', () => {
    it('returns sequence linestrings in the visible map area', () => {
      const data = [
        { type: 'photo', id: 'photo0', loc: [10,0], ca: 90, isPano: false, sequenceID: 'seq1' },
        { type: 'photo', id: 'photo1', loc: [10,0], ca: 90, isPano: false, sequenceID: 'seq1' },
        { type: 'photo', id: 'photo2', loc: [10,1], ca: 90, isPano: false, sequenceID: 'seq1' }
      ];
      const boxes = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: data[0] },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: data[1] },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: data[2] }
      ];
      const sequence = {
        type: 'FeatureCollection',
        id: 'seq1',
        v: 1,
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[10,0], [10,0], [10,1]],
            properties: {
              id: 'seq1',
              isPano: false
            }
          }
        }]
      };

      const cache = _mapillary._cache;
      for (const d of data) {
        cache.images.data.set(d.id, d);
      }
      cache.images.rbush.load(boxes);
      cache.sequences.data.set(sequence.id, sequence);

      const result = _mapillary.getSequences();
      expect(result).to.deep.eql([sequence]);
    });
  });


  describe('#loadTiles', () => {
    it('fires loadedImages when image tiles are loaded', done => {
      fetchMock.route(/mly1(_computed)?_public/, {
        body: '{"data":[]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      _mapillary.on('loadedImages', () => {
        expect(fetchMock.callHistory.calls().length).to.eql(1);
        done();
      });

      _mapillary.loadTiles('images');
    });


    it('does not load tiles around Null Island', done => {
      const spy = sinon.spy();
      fetchMock.route(/mly1(_computed)?_public/, {
        body: '{"data":[]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      _mapillary.context.viewport.transform.translation = [0, 0];  // move map to Null Island
      _mapillary.on('loadedImages', spy);
      _mapillary.loadTiles('images');

      window.setTimeout(() => {
        expect(spy.notCalled).to.be.ok;
        expect(fetchMock.callHistory.calls().length).to.eql(0);   // no tile requests of any kind
        done();
      }, 20);
    });
  });

});
