describe('KartaviewService', () => {
  let _kartaview;

  class MockContext {
    constructor() {
      this.systems = { };

      this.viewport = new sdk.Viewport();
      this.viewport.transform = { x: -116508, y: 0, k: sdk.geoZoomToScale(14) };  // [10°, 0°]
      this.viewport.dimensions = [64, 64];
    }
    container()       { return null; }
    deferredRedraw()  { }
  }


  beforeEach(() => {
    fetchMock.reset();
    _kartaview = new Rapid.KartaviewService(new MockContext());
    return _kartaview.initAsync();
  });


  describe('#initAsync', () => {
    it('initializes cache', () => {
      const cache = _kartaview._cache;
      expect(cache).to.have.property('images');
      expect(cache).to.have.property('sequences');
      expect(cache.images).to.be.an.instanceof(Map);
      expect(cache.sequences).to.be.an.instanceof(Map);
    });
  });

  describe('#resetAsync', () => {
    it('resets cache and selected image', () => {
      _kartaview._cache.images.set('foo', { id: 'foo' });
      _kartaview._selectedImage = 'foo';

      return _kartaview.resetAsync()
        .then(() => {
          expect(_kartaview._cache.images.has('foo')).to.be.false;
          expect(_kartaview._selectedImage).to.be.null;
        });
    });
  });

  describe('#loadTiles', () => {
    it('fires loadedData when tiles are loaded', done => {
      const response = {
        status: { apiCode: '600', httpCode: 200, httpMessage: 'Success' },
        currentPageItems:[{
          id: '1',
          sequenceID: '100',
          sequenceIndex: '1',
          lat: '0',
          lng: '10.001',
          name: 'storage6\/files\/photo\/foo1.jpg',
          lth_name: 'storage6\/files\/photo\/lth\/foo1.jpg',
          th_name: 'storage6\/files\/photo\/th\/foo1.jpg',
          shot_date: '2017-09-24 23:58:07',
          heading: '90',
          username: 'test'
        }, {
          id: '2',
          sequenceID: '100',
          sequenceIndex: '2',
          lat: '0',
          lng: '10.002',
          name: 'storage6\/files\/photo\/foo2.jpg',
          lth_name: 'storage6\/files\/photo\/lth\/foo2.jpg',
          th_name: 'storage6\/files\/photo\/th\/foo2.jpg',
          shot_date: '2017-09-24 23:58:07',
          heading: '90',
          username: 'test'
        }, {
          id: '3',
          sequenceID: '100',
          sequenceIndex: '3',
          lat: '0',
          lng: '10.003',
          name: 'storage6\/files\/photo\/foo3.jpg',
          lth_name: 'storage6\/files\/photo\/lth\/foo3.jpg',
          th_name: 'storage6\/files\/photo\/th\/foo3.jpg',
          shot_date: '2017-09-24 23:58:07',
          heading: '90',
          username: 'test'
        }],
        totalFilteredItems: ['3']
      };

      fetchMock.mock(new RegExp('/nearby-photos/'), {
        body: JSON.stringify(response),
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      _kartaview.on('loadedData', () => {
        expect(fetchMock.calls().length).to.eql(1);  // 1 nearby-photos
        done();
      });

      _kartaview.loadTiles();
    });


    it('does not load tiles around Null Island', done => {
      const response = {
        status: { apiCode: '600', httpCode: 200, httpMessage: 'Success' },
        currentPageItems:[{
          id: '1',
          sequenceID: '100',
          sequenceIndex: '1',
          lat: '0',
          lng: '0',
          name: 'storage6\/files\/photo\/foo1.jpg',
          lth_name: 'storage6\/files\/photo\/lth\/foo1.jpg',
          th_name: 'storage6\/files\/photo\/th\/foo1.jpg',
          shot_date: '2017-09-24 23:58:07',
          heading: '90',
          username: 'test'
        }, {
          id: '2',
          sequenceID: '100',
          sequenceIndex: '2',
          lat: '0',
          lng: '0',
          name: 'storage6\/files\/photo\/foo2.jpg',
          lth_name: 'storage6\/files\/photo\/lth\/foo2.jpg',
          th_name: 'storage6\/files\/photo\/th\/foo2.jpg',
          shot_date: '2017-09-24 23:58:07',
          heading: '90',
          username: 'test'
        }, {
          id: '3',
          sequenceID: '100',
          sequenceIndex: '3',
          lat: '0',
          lng: '0',
          name: 'storage6\/files\/photo\/foo3.jpg',
          lth_name: 'storage6\/files\/photo\/lth\/foo3.jpg',
          th_name: 'storage6\/files\/photo\/th\/foo3.jpg',
          shot_date: '2017-09-24 23:58:07',
          heading: '90',
          username: 'test'
        }],
        totalFilteredItems: ['3']
      };

      const spy = sinon.spy();
      fetchMock.mock(new RegExp('/nearby-photos/'), {
        body: JSON.stringify(response),
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      _kartaview.context.viewport.transform.translation = [0, 0];  // move map to Null Island
      _kartaview.on('loadedData', spy);
      _kartaview.loadTiles();

      window.setTimeout(() => {
        expect(spy.notCalled).to.be.ok;
        expect(fetchMock.calls().length).to.eql(0);   // no tile requests of any kind
        done();
      }, 20);
    });
  });


  describe('#getImages', () => {
    it('returns images in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 0 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 1 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1], ca: 90, sequenceID: '100', sequenceIndex: 2 } }
      ];

      _kartaview._cache.rtree.load(data);

      const result = _kartaview.getImages();
      expect(result).to.deep.eql([
        { id: '0', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 0 },
        { id: '1', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 1 }
      ]);
    });
  });


  describe('#getSequences', () => {
    it('returns sequence linestrings in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 0 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 1 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1], ca: 90, sequenceID: '100', sequenceIndex: 2 } }
      ];

      _kartaview._cache.rtree.load(data);
      _kartaview._cache.sequences = new Map().set('100', {
        rotation: 0,
        images: [ data[0].data, data[1].data, data[2].data ],
        v: 1
      });

      const result = _kartaview.getSequences();
      expect(result).to.deep.eql([{
        type: 'LineString',
        coordinates: [[10,0], [10,0], [10,1]],
        properties: {
          id: '100',
          v: 1,
          captured_at: undefined,
          captured_by: undefined
        }
      }]);
    });
  });

});
