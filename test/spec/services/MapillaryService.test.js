describe('MapillaryService', () => {
  let _mapillary, _projection;

  class MockContext {
    constructor() { }
    deferredRedraw() { }
  }

  beforeEach(() => {
    fetchMock.reset();

    _projection = new sdk.Projection()
      .scale(sdk.geoZoomToScale(14))
      .translate([-116508, 0])  // 10,0
      .dimensions([[0,0], [64, 64]]);

    _mapillary = new Rapid.MapillaryService(new MockContext());
    _mapillary.init();
  });


  describe('#init', () => {
    it('initializes cache', () => {
      const cache = _mapillary._mlyCache;
      expect(cache).to.have.property('images');
      expect(cache).to.have.property('image_detections');
      expect(cache).to.have.property('points');
      expect(cache).to.have.property('signs');
      expect(cache).to.have.property('sequences');
    });
  });


  describe('#reset', () => {
    it('resets cache and selected image', () => {
      _mapillary._mlyCache.images.forImageID.foo = { id: 'foo' };
      _mapillary._mlyActiveImage = 'foo';

      _mapillary.reset();
      expect(_mapillary._mlyCache.images.forImageID).to.not.have.property('foo');
      expect(_mapillary._mlyActiveImage).to.be.null;
    });
  });


  describe('#images', () => {
    it('returns images in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0], ca: 90 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0], ca: 90 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1], ca: 90 } }
      ];

      _mapillary._mlyCache.images.rtree.load(data);
      const result = _mapillary.images(_projection);

      expect(result).to.deep.eql([
        { id: '0', loc: [10,0], ca: 90 },
        { id: '1', loc: [10,0], ca: 90 }
      ]);
    });
  });


  describe('#signs', () => {
    it('returns signs in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0] } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0] } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1] } }
      ];

      _mapillary._mlyCache.signs.rtree.load(data);
      const result = _mapillary.signs(_projection);

      expect(result).to.deep.eql([
        { id: '0', loc: [10,0] },
        { id: '1', loc: [10,0] }
      ]);
    });
  });


  describe('#mapFeatures', () => {
    it('returns map features in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0] } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0] } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1] } }
      ];

      _mapillary._mlyCache.points.rtree.load(data);
      const result = _mapillary.mapFeatures(_projection);

      expect(result).to.deep.eql([
        { id: '0', loc: [10,0] },
        { id: '1', loc: [10,0] }
      ]);
    });
  });


  describe('#sequences', () => {
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

      const res = _mapillary.sequences(_projection);
      expect(res).to.deep.eql([[gj]]);
    });
  });


  describe('#setActiveImage', () => {
    it('gets and sets the selected image', () => {
      const image = { id: 'baz', originalLngLat: { lng: 10, lat: 0 }};
      _mapillary.setActiveImage(image);
      expect(_mapillary.getActiveImage().id).to.eql(image.id);
    });
  });


// won't work until we straighten out init better - there is no scene yet
//  describe('#filterViewer', () => {
//    it('filters images by dates', () => {
//      context.photos().setDateFilter('fromDate', '2020-01-01');
//      context.photos().setDateFilter('toDate', '2021-01-01');
//      const filter = mapillary.filterViewer(context);
//      expect(filter.length).to.be.equal(3);
//    });
//  });
});
