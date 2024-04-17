import { afterEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';
import { geoArea as d3_geoArea } from 'd3-geo';


if (!global.window) {  // mock window for Node
  global.window = {
    devicePixelRatio: 1
  };
}

class MockLocalizationSystem {
  constructor() { }
  initAsync()   { return Promise.resolve(); }
  t(id, options) { return options.default || id; }  // Return the default option if it's provided
  tHtml(id, options) { return options.default || id; }  // Do the same for tHtml
  localeCode()  { return 'en'; }
}

class MockContext {
  constructor()  {
    this.systems = {
      l10n:  new MockLocalizationSystem(this)
    };
  }
}

function closeTo(a, b, epsilon = 1e-3) {
  return Math.abs(a - b) < epsilon;
}

const mockResponse = {
  ok: true,
  status: 200,
  statusText: 'OK',
  url: 'http://example.com/data.json',
  headers: {
    get: () => 'application/json'
  }
};


describe('ImagerySource', () => {
  const context = new MockContext();

  describe('url', () => {
    it('does not error with blank template', () => {
      const source = new Rapid.ImagerySource(context, { template: '', id:'anyid' });
      assert.equal(source.url([0,1,2]), '');
    });

    it('supports tms replacement tokens', () => {
      const source = new Rapid.ImagerySource(context, {
        id: 'anyid',
        type: 'tms',
        template: '{z}/{x}/{y}'
      });
      assert.equal(source.url([0,1,2]), '2/0/1');
    });

    it('supports wms replacement tokens', () => {
      const source = new Rapid.ImagerySource(context, {
        id:'anyid',
        type: 'wms',
        projection: 'EPSG:3857',
        template: 'SRS={proj}&imageSR={wkid}&bboxSR={wkid}&FORMAT=image/jpeg&WIDTH={width}&HEIGHT={height}&BBOX={bbox}'
      });

      const result = Rapid.sdk.utilStringQs(source.url([0,1,2]));
      assert.equal(result.SRS, 'EPSG:3857');
      assert.equal(result.imageSR, '3857');
      assert.equal(result.bboxSR, '3857');
      assert.equal(result.FORMAT, 'image/jpeg');
      assert.equal(result.WIDTH, '256');
      assert.equal(result.HEIGHT, '256');

      const bbox = result.BBOX.split(',');
      assert.ok(closeTo(+bbox[0], -20037508.34));
      assert.ok(closeTo(+bbox[1], 0));
      assert.ok(closeTo(+bbox[2], -10018754.17));
      assert.ok(closeTo(+bbox[3], 10018754.17));
    });

    it('supports subdomains', () => {
      const source = new Rapid.ImagerySource(context, { id:'anyid', template: '{switch:a,b}/{z}/{x}/{y}'});
      assert.equal(source.url([0,1,2]), 'b/2/0/1');
    });

    it('distributes requests between subdomains', () => {
      const source = new Rapid.ImagerySource(context, { id:'anyid', template: '{switch:a,b}/{z}/{x}/{y}' });
      assert.equal(source.url([0,1,1]), 'b/1/0/1');
      assert.equal(source.url([0,2,1]), 'a/1/0/2');
    });

    it('supports bing replacement tokens', () => {
      const source = new Rapid.ImagerySource(context, {
        id: 'anyid',
        type: 'bing',
        template: '{u}'
      });
      const coord = [1, 1, 1];  // Choose coordinates that will result in a non-empty 'u' string
      assert.strictEqual(source.url(coord), '3');
    });

    it('supports bing replacement tokens', () => {
      const source = new Rapid.ImagerySource(context, {
        id: 'anyid',
        type: 'bing',
        template: 'http://example.com/{u}'
      });
      const url = source.url([1, 1, 1]);
      assert.ok(url.includes('3'));
    });

    it('replaces {switch:} tokens in the template', () => {
      const source = new Rapid.ImagerySource(context, {
        id: 'anyid',
        type: 'tms',
        template: 'http://example.com/{switch:a,b,c}/{z}/{x}/{y}.png'
      });
      const url = source.url([0, 1, 2]);
      assert.ok(/http:\/\/example.com\/[abc]\/2\/0\/1\.png/.test(url));
    });
  });


  describe('validZoom', () => {
    it('returns false if passed not a number', () => {
      const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16] });
      assert.equal(source.validZoom(), false);
      assert.equal(source.validZoom(NaN), false);
      assert.equal(source.validZoom(null), false);
      assert.equal(source.validZoom('fake'), false);
    });

    it('correctly respects min/max zoomExtent', () => {
      const source = new Rapid.ImagerySource(context, { id:'anyid', zoomExtent: [6,16] });
      assert.equal(source.validZoom(-Infinity), false);
      assert.equal(source.validZoom(5), false);
      assert.equal(source.validZoom(6), true);
      assert.equal(source.validZoom(16), true);
      assert.equal(source.validZoom(17), false);
      assert.equal(source.validZoom(Infinity), false);
    });
  });


  describe('isLocatorOverlay', () => {
    it('returns true only for the locator overlay', () => {
      const source1 = new Rapid.ImagerySource(context, { id:'anyid' });
      const source2 = new Rapid.ImagerySource(context, { id:'mapbox_locator_overlay' });
      assert.equal(source1.isLocatorOverlay(), false);
      assert.equal(source2.isLocatorOverlay(), true);
    });
  });


  describe('_localeDateString', () => {
    it('returns null if the input is not provided', () => {
      const source = new Rapid.ImagerySource(context, { id: 'test' });
      assert.strictEqual(source._localeDateString(), null);
    });

    it('returns null if the input is not a valid date', () => {
      const source = new Rapid.ImagerySource(context, { id: 'test' });
      assert.strictEqual(source._localeDateString('not a date'), null);
    });

    it('returns a formatted date string if the input is a valid date', () => {
      const source = new Rapid.ImagerySource(context, { id: 'test' });
      assert.strictEqual(source._localeDateString('2020-01-01'), '2020-01-01');
    });
  });


  describe('_vintageRange', () => {
    it('returns undefined if the input does not have a start or end', () => {
      const source = new Rapid.ImagerySource(context, { id: 'test' });
      assert.strictEqual(source._vintageRange({}), undefined);
    });

    it('returns a string with the start date if only the start is provided', () => {
      const source = new Rapid.ImagerySource(context, { id: 'test' });
      assert.strictEqual(source._vintageRange({ start: 'Jan 1, 2020' }), 'Jan 1, 2020 - ?');
    });

    it('returns a string with the end date if only the end is provided', () => {
      const source = new Rapid.ImagerySource(context, { id: 'test' });
      assert.strictEqual(source._vintageRange({ end: 'Dec 31, 2020' }), '? - Dec 31, 2020');
    });

    it('returns a range string if both the start and end are provided', () => {
      const source = new Rapid.ImagerySource(context, { id: 'test' });
      assert.strictEqual(source._vintageRange({ start: 'Jan 1, 2020', end: 'Dec 31, 2020' }), 'Jan 1, 2020 - Dec 31, 2020');
    });
  });


  describe('fetchTilemap', () => {
    // Save the original fetch function
    const originalFetch = global.fetch;
    afterEach(() => {
      // Restore the original fetch function after each test
      global.fetch = originalFetch;
    });
    it('fetches a tilemap and updates the zoom extent', async () => {
      const source = new Rapid.ImagerySourceEsri(context, {
        id: 'anyid',
        template: 'http://example.com/tile/{z}/{x}/{y}?blankTile=false'
      });
      // Mock the fetch function to return a tilemap with all tiles present
      global.fetch = () => Promise.resolve({
        ...mockResponse,
        json: () => Promise.resolve({ data: Array(64).fill(1) })  // An 8x8 grid with all tiles present
      });
      await source.fetchTilemap([0, 0]);
      // Check that the zoom extent was updated to 22
      assert.strictEqual(source.zoomExtent[1], 22);
    });
  });


  describe('constructor and getters', () => {
    const src = {
      id: 'test',
      name: 'Test Source',
      description: 'Test Description',
      template: 'http://example.com/{z}/{x}/{y}.png',
      best: true,
      endDate: '2020-12-31',
      icon: 'test-icon',
      overlay: true,
      polygon: [[0, 0], [0, 1], [1, 1], [1, 0]],
      projection: 'EPSG:3857',
      startDate: '2020-01-01',
      terms_html: '<p>Terms</p>',
      terms_text: 'Terms',
      terms_url: 'http://example.com/terms',
      tileSize: 512,
      type: 'tms',
      zoomExtent: [0, 18]
    };
    const source = new Rapid.ImagerySource(context, src);
    it('sets properties based on the src object', () => {
      assert.strictEqual(source._id, src.id);
      assert.strictEqual(source._idtx, src.id.replace(/\./g, '<TX_DOT>'));
      assert.strictEqual(source._name, src.name);
      assert.strictEqual(source._description, src.description);
      assert.strictEqual(source._template, src.template);
      assert.strictEqual(source.best, src.best);
      assert.strictEqual(source.endDate, src.endDate);
      assert.strictEqual(source.icon, src.icon);
      assert.strictEqual(source.overlay, src.overlay);
      assert.deepStrictEqual(source.polygon, src.polygon);
      assert.strictEqual(source.projection, src.projection);
      assert.strictEqual(source.startDate, src.startDate);
      assert.strictEqual(source.terms_html, src.terms_html);
      assert.strictEqual(source.terms_text, src.terms_text);
      assert.strictEqual(source.terms_url, src.terms_url);
      assert.strictEqual(source.tileSize, src.tileSize);
      assert.strictEqual(source.type, src.type);
      assert.deepStrictEqual(source.zoomExtent, src.zoomExtent);
      assert.strictEqual(source.isBlocked, false);
      assert.deepStrictEqual(source.offset, [0, 0]);
    });
    it('returns the correct id', () => {
      assert.strictEqual(source.id, src.id);
    });
    it('returns the correct idtx', () => {
      assert.strictEqual(source.idtx, src.id.replace(/\./g, '<TX_DOT>'));
    });
    it('returns the correct name', () => {
      assert.strictEqual(source.name, src.name);
    });
    it('returns the correct description', () => {
      assert.strictEqual(source.description, src.description);
    });
    it('returns the correct imageryUsed', () => {
      assert.strictEqual(source.imageryUsed, src.name);
    });
    it('returns the correct template', () => {
      assert.strictEqual(source.template, src.template);
    });
    it('returns the correct area', () => {
      const expectedArea = d3_geoArea({ type: 'Polygon', coordinates: [src.polygon] });
      assert.ok(closeTo(source.area, expectedArea));
    });
  });

  describe('nudge', () => {
    it('updates the offset property', () => {
      const source = new Rapid.ImagerySource(context, { id: 'anyid' });
      assert.deepStrictEqual(source.offset, [0, 0]);  // Check initial offset
      source.nudge([10, 20], 0);
      assert.deepStrictEqual(source.offset, [10, 20]);  // Check offset after nudging
      source.nudge([-5, -10], 0);
      assert.deepStrictEqual(source.offset, [5, 10]);  // Check offset after nudging again
    });
  });

  describe('getMetadata', () => {
    it('updates the vintage property of the metadata', () => {
      const source = new Rapid.ImagerySource(context, {
        id: 'anyid',
        startDate: '2020-01-01',
        endDate: '2020-12-31'
      });
      source.getMetadata([0, 0], [0, 0, 0], (err, metadata) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(metadata.vintage, {
          start: '2020-01-01',
          end: '2020-12-31',
          range: '2020-01-01 - 2020-12-31'
        });
      });
    });
  });


  describe('fetchTilemap', () => {
    // Save the original fetch function
    const originalFetch = global.fetch;
    afterEach(() => {
      // Restore the original fetch function after each test
      global.fetch = originalFetch;
    });

    // it('updates the zoom extent when some tiles are missing', async () => {
    //   const source = new Rapid.ImagerySourceEsri(context, {
    //     id: 'anyid',
    //     template: 'http://example.com/tile/{z}/{x}/{y}?blankTile=false'
    //   });

    //   // Mock the fetch function to return a tilemap with some tiles missing
    //   global.fetch = () => Promise.resolve({
    //     ...mockResponse,
    //     json: () => Promise.resolve({ data: Array(63).fill(1).concat(0) })  // An 8x8 grid with one tile missing
    //   });

    //   await source.fetchTilemap([0, 0]);

    //   // Check that the zoom extent was updated to 19
    //   assert.strictEqual(source.zoomExtent[1], 19);
    // });

    it('does not update the zoom extent when the fetch request fails', async () => {
      const source = new Rapid.ImagerySourceEsri(context, {
        id: 'anyid',
        template: 'http://example.com/tile/{z}/{x}/{y}?blankTile=false'
      });
      // Mock the fetch function to reject the promise
      global.fetch = () => Promise.reject(new Error('Network error'));
      await source.fetchTilemap([0, 0]);
      // Check that the zoom extent was not updated
      assert.strictEqual(source.zoomExtent[1], 22);
    });
  });
});


describe('ImagerySourceCustom', () => {
  const context = new MockContext();

  describe('imageryUsed', () => {
    it('returns an imagery_used string', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com');
      assert.equal(source.imageryUsed, 'Custom (http://example.com )');  // note ' )' space
    });

    it('sanitizes `access_token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?access_token=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (http://example.com?access_token={apikey} )');
    });

    it('sanitizes `connectId`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?connectId=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (http://example.com?connectId={apikey} )');
    });

    it('sanitizes `token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?token=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (http://example.com?token={apikey} )');
    });

    it('sanitizes `key`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com?key=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (http://example.com?key={apikey} )');
    });

    it('sanitizes `Signature` for CloudFront', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'https://example.com/?Key-Pair-Id=foo&Policy=bar&Signature=MYTOKEN');
      assert.equal(source.imageryUsed, 'Custom (https://example.com/?Key-Pair-Id=foo&Policy=bar&Signature={apikey} )');
    });

    it('sanitizes wms path `token`', () => {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com/wms/v1/token/MYTOKEN/1.0.0/layer');
      assert.equal(source.imageryUsed, 'Custom (http://example.com/wms/v1/token/{apikey}/1.0.0/layer )');
    });

    it('sanitizes `key` in the URL path', function() {
      const source = new Rapid.ImagerySourceCustom(context, 'http://example.com/services;key=MYTOKEN/layer');
      assert.equal(source.imageryUsed, 'Custom (http://example.com/services;key={apikey}/layer )');
    });
  });
});


