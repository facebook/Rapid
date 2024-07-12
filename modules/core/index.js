export * from './lib/index.js';

import { AbstractSystem } from './AbstractSystem.js';
import { AssetSystem } from './AssetSystem.js';
import { EditSystem } from './EditSystem.js';
import { FilterSystem } from './FilterSystem.js';
import { ImagerySystem } from './ImagerySystem.js';
import { LocalizationSystem } from './LocalizationSystem.js';
import { LocationSystem } from './LocationSystem.js';
import { Map3dSystem } from './Map3dSystem.js';
import { MapSystem } from './MapSystem.js';
import { PhotoSystem } from './PhotoSystem.js';
import { PresetSystem } from './PresetSystem.js';
import { RapidSystem } from './RapidSystem.js';
import { StorageSystem } from './StorageSystem.js';
import { StyleSystem } from './StyleSystem.js';
import { UiSystem } from './UiSystem.js';
import { UploaderSystem } from './UploaderSystem.js';
import { UrlHashSystem } from './UrlHashSystem.js';
import { ValidationSystem } from './ValidationSystem.js';

export {
  AbstractSystem,
  AssetSystem,
  EditSystem,
  FilterSystem,
  ImagerySystem,
  LocalizationSystem,
  LocationSystem,
  Map3dSystem,
  MapSystem,
  PhotoSystem,
  PresetSystem,
  RapidSystem,
  StorageSystem,
  StyleSystem,
  UiSystem,
  UploaderSystem,
  UrlHashSystem,
  ValidationSystem
};

// At init time, we will instantiate any that are in the 'available' collection.
export const systems = {
  available: new Map()   // Map (id -> System constructor)
};

systems.available.set('assets', AssetSystem);
systems.available.set('editor', EditSystem);
systems.available.set('filters', FilterSystem);
systems.available.set('imagery', ImagerySystem);
systems.available.set('l10n', LocalizationSystem);
systems.available.set('locations', LocationSystem);
systems.available.set('map', MapSystem);
systems.available.set('map3d', Map3dSystem);
systems.available.set('photos', PhotoSystem);
systems.available.set('presets', PresetSystem);
systems.available.set('rapid', RapidSystem);
systems.available.set('storage', StorageSystem);
systems.available.set('styles', StyleSystem);
systems.available.set('ui', UiSystem);
systems.available.set('uploader', UploaderSystem);
systems.available.set('urlhash', UrlHashSystem);
systems.available.set('validator', ValidationSystem);
