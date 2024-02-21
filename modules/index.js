export * from './actions/index.js';
export * from './behaviors/index.js';
export * from './core/index.js';
export * from './geo/index.js';
export * from './modes/index.js';
export * from './operations/index.js';
export * from './osm/index.js';
export * from './services/index.js';
export * from './svg/index.js';
export * from './ui/fields/index.js';
export * from './ui/panels/index.js';
export * from './ui/panes/index.js';
export * from './ui/sections/index.js';
export * from './ui/settings/index.js';
export * from './ui/index.js';
export * from './util/index.js';
export * from './validations/index.js';

export { Context } from './Context.js';

// Reexport only what our tests use, see iD#4379
import * as D3 from 'd3';
export const d3 = {
  polygonArea: D3.polygonArea,
  polygonCentroid: D3.polygonCentroid,
  select: D3.select,
  selectAll: D3.selectAll,
  timerFlush: D3.timerFlush
};

// Reexport the sdk things that our tests use too
import * as SDKMATH from '@rapid-sdk/math';
import * as SDKUTIL from '@rapid-sdk/util';
export const sdk = {
  Extent: SDKMATH.Extent,
  Viewport: SDKMATH.Viewport,
  geoSphericalDistance: SDKMATH.geoSphericalDistance,
  geoZoomToScale: SDKMATH.geoZoomToScale,
  vecLength: SDKMATH.vecLength,
  utilQsString: SDKUTIL.utilQsString,
  utilStringQs: SDKUTIL.utilStringQs
};
