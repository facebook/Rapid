describe('MapillaryService', () => {
  let _mapillary;

  class MockContext {
    constructor() {
      this.systems = { };

      this.viewport = new sdk.Viewport();
      this.viewport.transform = { x: -116508, y: 0, k: sdk.geoZoomToScale(14) };  // [10°, 0°]
      this.viewport.dimensions = [64, 64];
    }
    deferredRedraw() { }
  }


  beforeEach(() => {
    fetchMock.reset();
    _mapillary = new Rapid.MapillaryService(new MockContext());

    // Mock function for retieving tile data.. The original expects a protobuffer vector tile.
    _mapillary._loadTileDataToCache = () => { };

    return _mapillary.initAsync();
  });


  describe('#initAsync', () => {
    it('initializes cache', () => {
      const cache = _mapillary._mlyCache;
      expect(cache).to.have.property('images');
      expect(cache).to.have.property('image_detections');
      expect(cache).to.have.property('points');
      expect(cache).to.have.property('signs');
      expect(cache).to.have.property('sequences');
    });
  });


  describe('#resetAsync', () => {
    it('resets cache and selected image', () => {
      _mapillary._mlyCache.images.forImageID.foo = { id: 'foo' };
      _mapillary._mlyActiveImage = 'foo';

      return _mapillary.resetAsync()
        .then(() => {
          expect(_mapillary._mlyCache.images.forImageID).to.not.have.property('foo');
          expect(_mapillary._mlyActiveImage).to.be.null;
        });
    });
  });


  describe('#getData', () => {
    it('returns images in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0], ca: 90 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0], ca: 90 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1], ca: 90 } }
      ];

      _mapillary._mlyCache.images.rtree.load(data);
      const result = _mapillary.getData('images');
      expect(result).to.deep.eql([
        { id: '0', loc: [10,0], ca: 90 },
        { id: '1', loc: [10,0], ca: 90 }
      ]);
    });

    it('returns map features in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0] } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0] } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1] } }
      ];

      _mapillary._mlyCache.points.rtree.load(data);
      const result = _mapillary.getData('points');
      expect(result).to.deep.eql([
        { id: '0', loc: [10,0] },
        { id: '1', loc: [10,0] }
      ]);
    });

    it('returns signs in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0] } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0] } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1] } }
      ];

      _mapillary._mlyCache.signs.rtree.load(data);
      const result = _mapillary.getData('signs');
      expect(result).to.deep.eql([
        { id: '0', loc: [10,0] },
        { id: '1', loc: [10,0] }
      ]);
    });
  });


  describe('#getSequences', () => {
    it('returns sequence linestrings in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0], ca: 90, sequenceID: '-' } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0], ca: 90, sequenceID: '-' } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1], ca: 90, sequenceID: '-' } }
      ];

      _mapillary._mlyCache.images.rtree.load(data);

      const gj = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[10,0], [10,0], [10,1]],
          properties: {
            id: '-',
            isPano: false,
            coordinateProperties: {
              cas: [90, 90, 90],
              image_ids: ['0', '1', '2']
            }
          }
        }
      };

      _mapillary._mlyCache.sequences = new Map().set('-', [gj]);

      const result = _mapillary.getSequences();
      expect(result).to.deep.eql([[gj]]);
    });
  });


  describe('#loadTiles', () => {
    it('fires loadedImages when image tiles are loaded', done => {
      fetchMock.mock(new RegExp('/mly1_public/'), {
        body: '{"data":[]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      _mapillary.on('loadedImages', () => {
        expect(fetchMock.calls().length).to.eql(1);
        done();
      });

      _mapillary.loadTiles('images');
    });


    it('does not load tiles around Null Island', done => {
      const spy = sinon.spy();
      fetchMock.mock(new RegExp('/mly1_public/'), {
        body: '{"data":[]}',
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      _mapillary.context.viewport.transform.translation = [0, 0];  // move map to Null Island
      _mapillary.on('loadedImages', spy);
      _mapillary.loadTiles('images');

      window.setTimeout(() => {
        expect(spy.notCalled).to.be.ok;
        expect(fetchMock.calls().length).to.eql(0);   // no tile requests of any kind
        done();
      }, 20);
    });
  });



  describe('#setActiveImage', () => {
    it('gets and sets the selected image', () => {
      const image = { id: 'baz', originalLngLat: { lng: 10, lat: 0 }};
      _mapillary.setActiveImage(image);
      expect(_mapillary.getActiveImage().id).to.eql(image.id);
    });
  });

});
