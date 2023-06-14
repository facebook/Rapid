describe('KartaviewService', () => {
  let _kartaview, _projection;

  class MockContext {
    constructor()    { }
    container()      { return null; }
    deferredRedraw() { }
  }


  beforeEach(() => {
    fetchMock.reset();

    _projection = new sdk.Projection()
      .scale(sdk.geoZoomToScale(14))
      .translate([-116508, 0])  // 10,0
      .dimensions([[0,0], [64, 64]]);

    _kartaview = new Rapid.KartaviewService(new MockContext());
    _kartaview.init();
  });


  describe('#init', () => {
    it('initializes cache', () => {
      const cache = _kartaview._cache;
      expect(cache).to.have.property('images');
      expect(cache).to.have.property('sequences');
      expect(cache.images).to.be.an.instanceof(Map);
      expect(cache.sequences).to.be.an.instanceof(Map);
    });
  });

  describe('#reset', () => {
    it('resets cache and selected image', () => {
      _kartaview._cache.images.set('foo', { id: 'foo' });
      _kartaview._selectedImage = 'foo';

      _kartaview.reset();
      expect(_kartaview._cache.images.has('foo')).to.be.false;
      expect(_kartaview._selectedImage).to.be.null;
    });
  });

  describe('#loadImages', () => {
    it('fires loadedData when images are loaded', done => {
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

      _kartaview.loadImages(_projection);
    });


    it('does not load images around null island', done => {
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

      _projection.translate([0, 0]);
      _kartaview.on('loadedData', spy);
      _kartaview.loadImages(_projection);

      window.setTimeout(() => {
        expect(spy).to.have.been.not.called;
        expect(fetchMock.calls().length).to.eql(0);   // no tile requests of any kind
        done();
      }, 50);
    });
  });


  describe('#images', () => {
    it('returns images in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 0 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 1 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1], ca: 90, sequenceID: '100', sequenceIndex: 2 } }
      ];

      _kartaview._cache.rtree.load(data);
      const result = _kartaview.images(_projection);

      expect(result).to.deep.eql([
        { id: '0', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 0 },
        { id: '1', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 1 }
      ]);
    });
  });


  describe('#sequences', () => {
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

      const result = _kartaview.sequences(_projection);
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

  describe('#selectedImage', () => {
    it('sets and gets selected image', () => {
      const imagedata = { id: 'foo' };
      _kartaview._cache.images.set('foo', imagedata);
      _kartaview.selectImage('foo');
      expect(_kartaview.getSelectedImage()).to.eql(imagedata);
    });
  });

});
