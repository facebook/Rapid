describe('serviceKartaview', () => {
  const dimensions = [64, 64];
  let context, kartaview;

  before(() => {
    Rapid.services.kartaview = Rapid.serviceKartaview;
    fetchMock.reset();
  });

  after(() => {
    delete Rapid.services.kartaview;
  });

  beforeEach(() => {
    context = Rapid.coreContext()
      .assetPath('../dist/')
      .init();
    context.projection
      .scale(sdk.geoZoomToScale(14))
      .translate([-116508, 0])  // 10,0
      .dimensions([[0,0], dimensions]);

    kartaview = Rapid.services.kartaview;
    kartaview.reset();
    fetchMock.reset();
  });

  afterEach(() => {
    fetchMock.reset();
  });


  describe('#init', () => {
    it('Initializes cache one time', () => {
      const cache = kartaview.cache();
      expect(cache).to.have.property('images');
      expect(cache).to.have.property('sequences');

      kartaview.init();
      const cache2 = kartaview.cache();
      expect(cache).to.equal(cache2);
    });
  });

  describe('#reset', () => {
    it('resets cache and image', () => {
      kartaview.cache().foo = 'bar';
      kartaview.selectImage(context, {id: 'baz'});

      kartaview.reset();
      expect(kartaview.cache()).to.not.have.property('foo');
      expect(kartaview.getSelectedImage()).to.be.null;
    });
  });

  describe('#loadImages', () => {
    it('fires loadedImages when images are loaded', done => {
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

      kartaview.on('loadedImages', () => {
        expect(fetchMock.calls().length).to.eql(1);  // 1 nearby-photos
        done();
      });

      kartaview.loadImages(context.projection);
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

      context.projection.translate([0, 0]);
      kartaview.on('loadedImages', spy);
      kartaview.loadImages(context.projection);

      window.setTimeout(() => {
        expect(spy).to.have.been.not.called;
        expect(fetchMock.calls().length).to.eql(0);   // no tile requests of any kind
        done();
      }, 200);
    });
  });


  describe('#images', () => {
    it('returns images in the visible map area', () => {
      const data = [
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '0', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 0 } },
        { minX: 10, minY: 0, maxX: 10, maxY: 0, data: { id: '1', loc: [10,0], ca: 90, sequenceID: '100', sequenceIndex: 1 } },
        { minX: 10, minY: 1, maxX: 10, maxY: 1, data: { id: '2', loc: [10,1], ca: 90, sequenceID: '100', sequenceIndex: 2 } }
      ];

      kartaview.cache().rtree.load(data);
      const result = kartaview.images(context.projection);

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

      kartaview.cache().rtree.load(data);
      kartaview.cache().sequences = new Map().set('100', {
        rotation: 0,
        images: [ data[0].data, data[1].data, data[2].data ],
        v: 1
      });

      const result = kartaview.sequences(context.projection);
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
      kartaview.cache().images = new Map().set('foo', imagedata);
      kartaview.selectImage(context, 'foo');
      expect(kartaview.getSelectedImage()).to.eql(imagedata);
    });
  });

});
