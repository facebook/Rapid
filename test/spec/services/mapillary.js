describe('iD.serviceMapillary', () => {
  const dimensions = [64, 64];
  let context, mapillary;


  before(() => {
    iD.services.mapillary = iD.serviceMapillary;
  });

  after(() => {
    delete iD.services.mapillary;
  });

  beforeEach(() => {
    context = iD.coreContext()
      .assetPath('../dist/')
      .init();
    context.projection
      .scale(sdk.geoZoomToScale(14))
      .translate([-116508, 0])  // 10,0
      .dimensions([[0,0], dimensions]);

    // // Just for the image filtering tests, hard code these methods
    // // So we don't bring the pixi layers' existence into the mix.
    // context.photos().showsPanoramic = () => true;
    // context.photos().showsFlat = () => true;

    mapillary = iD.services.mapillary;
    mapillary.reset();
  });

  afterEach(() => {});


  describe('#init', () => {
    it('Initializes cache one time', () => {
      const cache = mapillary.cache();
      expect(cache).to.have.property('images');
      expect(cache).to.have.property('image_detections');
      expect(cache).to.have.property('points');
      expect(cache).to.have.property('signs');
      expect(cache).to.have.property('sequences');

      mapillary.init();
      const cache2 = mapillary.cache();
      expect(cache).to.equal(cache2);
    });
  });


  describe('#reset', () => {
    it('resets cache and image', () => {
      mapillary.cache().foo = 'bar';
      mapillary.selectImage(context, { id: 'baz', loc: [10,0] });

      mapillary.reset();
      expect(mapillary.cache()).to.not.have.property('foo');
      expect(mapillary.getActiveImage()).to.be.null;
    });
  });


  describe('#images', () => {
    it('returns images in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0], ca: 90 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0], ca: 90 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1], ca: 90 } }
      ];

      mapillary.cache().images.rtree.load(data);
      const result = mapillary.images(context.projection);

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

      mapillary.cache().signs.rtree.load(data);
      const result = mapillary.signs(context.projection);

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

      mapillary.cache().points.rtree.load(data);
      const result = mapillary.mapFeatures(context.projection);

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

      mapillary.cache().images.rtree.load(data);

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

      mapillary.cache().sequences = new Map().set('-', [gj]);

      const res = mapillary.sequences(context.projection);
      expect(res).to.deep.eql([[gj]]);
    });
  });


  describe('#setActiveImage', () => {
    it('gets and sets the selected image', () => {
      const image = { id: 'baz', originalLngLat: { lng: 10, lat: 0 }};
      mapillary.setActiveImage(image);
      expect(mapillary.getActiveImage().id).to.eql(image.id);
    });
  });


  describe('#filterViewer', () => {
    it('filters images by dates', () => {
      context.photos().setDateFilter('fromDate', '2020-01-01');
      context.photos().setDateFilter('toDate', '2021-01-01');
      const filter = mapillary.filterViewer(context);
      expect(filter.length).to.be.equal(3);
    });
  });
});
