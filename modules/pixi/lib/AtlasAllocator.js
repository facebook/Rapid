import * as PIXI from 'pixi.js';
import { GuilloteneAllocator } from './GuilloteneAllocator.js';


/**
 * This texture allocator auto-manages the base-texture with an {@link AtlasSource}. You can also
 * pass a texture source to `allocate`, mimicing {@link Texture.from} functionality.
 *
 * @public
 */
export class AtlasAllocator {
  /**
   * Creates an atlas allocator.
   * @constructor
   * @param {string} label - optional label, can be used for debugging
   * @param {number} slabWidth
   * @param {number} slabHeight
   */
  constructor(label = '', slabWidth = 2048, slabHeight = 2048) {
    this._tempRect = new PIXI.Rectangle();

    this.label = label;
    this.slabWidth = slabWidth;
    this.slabHeight = slabHeight;
    this.slabs = [];
  }


  /**
   * _allocateTexture
   * Allocates a texture from this allocator.
   * If its existing slab pool has enough space, the texture is issued from one.
   * Otherwise, a new slab is created and the texture is issued from it.
   *
   * @param  {number}  width - The width of the requested texture.
   * @param  {number}  height - The height of the requested texture.
   * @param  {number}  padding - The padding requested around the texture, to prevent bleeding.
   * @return {PIXI.Texture} The allocated texture, if successful; otherwise, `null`.
   * @throws When dimensions are too large to fit on a slab
   */
  _allocateTexture(width, height, padding = 0) {
    // Cannot allocate a texture larger than the slab size.
    if ((width + (2 * padding)) > this.slabWidth || (height + (2 * padding)) > this.slabHeight) {
      throw new Error(`Texture can not exceed slab size of ${this.slabWidth}x${this.slabHeight}`);
    }

    // Loop through the slabs and find one with enough space, if any.
    for (const slab of this.slabs) {
      const texture = this._issueTexture(slab, width, height, padding);
      if (texture) return texture;
    }

    // Need another new slab.
    const slab = new AtlasSource(this.label, this.slabWidth, this.slabHeight);

    // Append this slab to the head of the list.
    this.slabs.unshift(slab);

    // Issue the texture from this blank slab.
    return this._issueTexture(slab, width, height, padding);
  }


  /**
   * Issues a texture from the given texture slab, if possible.
   *
   * @param  {AtlasSource}  slab - The texture slab to allocate frame.
   * @param  {number}       width - The width of the requested texture.
   * @param  {number}       height - The height of the requested texture.
   * @param  {number}       padding - Padding required around the texture.
   * @return {PIXI.Texture}  The issued texture, if successful; otherwise, `null`.
   */
  _issueTexture(slab, width, height, padding = 0) {
    const bin = slab._binPacker.allocate(width + (2 * padding), height + (2 * padding));
    if (!bin) return null;

    this._tempRect.copyFrom(bin);
    this._tempRect.pad(-padding);

    const texture = new PIXI.Texture({
      source: slab,
      frame: this._tempRect  // Texture will make a copy
    });

    texture.__bin = bin;   // important to preserve this, it contains `__mem_area`
    return texture;
  }


  /**
   * allocate
   * Allocates the given asset, returning a PIXI.Texture, or throwing if it could not be done.
   *
   * @param {number}  width
   * @param {number}  height
   * @param {number}  padding
   * @param {*}       asset
   * @return {PIXI.Texture}  The issued texture
   * @throws If asset type is unrecognized, or dimensions will not fit on a slab
   */
  allocate(width, height, padding, asset) {
    if (!(asset instanceof HTMLImageElement ||
      asset instanceof HTMLCanvasElement ||
      asset instanceof ImageBitmap ||
      asset instanceof ImageData ||
      ArrayBuffer.isView(asset)
    )) {
      throw new Error('Unsupported asset type');
    }

    const texture = this._allocateTexture(width, height, padding);
    const uid = texture.uid;
    const slab = texture.source;

    const item = {
      uid: uid,
      texture: texture,
      asset: asset,
      // dirtyId !== updateId only if image loaded
      dirtyId: asset instanceof HTMLImageElement && !asset.complete ? -1 : 0,
      updateId: -1
    };

    slab._items.set(uid, item);

    if (asset instanceof HTMLImageElement && !asset.complete) {
      asset.addEventListener('load', () => {
        if (!texture.destroyed && slab._items.has(uid)) {
          item.dirtyId++;
          slab.update();
          texture.update();
        } else {
          console.warn('Image loaded after texture was destroyed');  // eslint-disable-line no-console
        }
      });
    }

    slab.update();

    return texture;
  }


  /**
   * free
   * Frees the texture and reclaims its space.
   *
   * @param  {PIXI.Texture }  texture
   * @throws If the texture was not found, or some other issue prevents it from freeing.
   */
  free(texture) {
    const slab = this.slabs.find(slab => slab === texture.source);
    const uid = texture.uid;

    if (!slab) {
      throw new Error('Texture is not managed by this AtlasAllocator');
    }

    const bin = texture.__bin;
    if (!bin) {
      throw new Error('Texture bin has been lost.');
    }
    slab._binPacker.free(bin);

    const item = slab._items.get(uid);
    if (!item) {
      throw new Error('Texture not found on slab.');
    }
    item.texture.destroy(false);
    item.asset = null;
    item.texture = null;
    slab._items.delete(uid);

    // if (!slab._items.size) {
    //   free slab?
    // }
  }

}



/**
 * AtlasSource
 * An {@code AtlasSource} is used by {@link AtlasAllocator} to manage texture sources.
 * @public
 */
export class AtlasSource extends PIXI.TextureSource {
  /**
   * Creates a TextureSource for the textures in the atlas (aka a "slab")
   * @param {string}  label - optional label, can be used for debugging
   * @param {number}  width
   * @param {number}  height
   */
  constructor(label, width, height) {
    super({
      antialias: false,
      autoGarbageCollect: false,
      autoGenerateMipmaps: false,
      height: height,
      label: label,
      resolution: 1,
      width: width
    });
    this.uploadMethodId = 'atlas';

    this._items = new Map();      // Map<uid, Item object>
    this._binPacker = new GuilloteneAllocator(width, height);
  }
}


// WebGL Uploader
const glUploadAtlasResource = {
  id: 'atlas',
  upload(slab, glTexture, gl, webGLVersion) {
    const { width, height } = slab;
    const premultipliedAlpha = slab.alphaMode === 'premultiply-alpha-on-upload';

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultipliedAlpha);

    // Allocate the texture on the GPU
    if (glTexture.width !== width || glTexture.height !== height) {
      glTexture.width = width;
      glTexture.height = height;

      gl.texImage2D(
        glTexture.target,
        0,
        glTexture.format,
        width,
        height,
        0,
        glTexture.format,
        glTexture.type,
        undefined
      );
    }

    // Upload all atlas items.
    for (const item of slab._items.values()) {
      // see https://github.com/rapideditor/pixi-texture-allocator/issues/2  ??
      if (item.updateId === item.dirtyId) continue;

      const frame = item.texture.frame;
      let source = item.asset;

      if (webGLVersion === 1) {
        if (source instanceof ImageData) {
          source = source.data; // pass the typed array directly

        } else if (source instanceof HTMLCanvasElement) {
          const ctx = source.getContext('2d');
          const [w, h] = [source.width, source.height];

          source = ctx.getImageData(0, 0, w, h).data;

        } else if (source instanceof HTMLImageElement) {
          const [w, h] = [source.naturalWidth, source.naturalHeight];
          const canvas = document.createElement('canvas');

          canvas.width = w;
          canvas.height = h;

          const ctx = canvas.getContext('2d');

          ctx.drawImage(source, 0, 0);
          source = ctx.getImageData(0, 0, w, h).data;
        }
      }

      gl.texSubImage2D(
        glTexture.target,
        0,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        glTexture.format,
        glTexture.type,
        source
      );

      item.updateId = item.dirtyId;
    }
  }
};


// WebGPU Uploader
const gpuUploadAtlasResource = {
  type: 'atlas',
  upload(slab, gpuTexture, gpu) {
    const premultipliedAlpha = slab.alphaMode === 'premultiply-alpha-on-upload';

    for (const item of slab._items.values()) {
      // see https://github.com/rapideditor/pixi-texture-allocator/issues/2  ??
      if (item.updateId === item.dirtyId) continue;

      const frame = item.texture.frame;

      gpu.device.queue.copyExternalImageToTexture(
        { source: item.asset },
        {
          texture: gpuTexture, premultipliedAlpha,
          origin: {
            x: frame.x,
            y: frame.y,
          },
        },
        {
          height: frame.height,
          width: frame.width,
        }
      );

      item.updateId = item.dirtyId;
    }
  }
};



/**
 * Registers the upload handlers with the given Pixi renderer
 * @param renderer
 * @public
 */
export function registerAtlasUploader(renderer) {
  if (renderer.type === PIXI.RendererType.WEBGL) {
    renderer.texture['_uploads'].atlas = glUploadAtlasResource;   // eslint-disable-line dot-notation
  } else {
    renderer.texture['_uploads'].atlas = gpuUploadAtlasResource;  // eslint-disable-line dot-notation
  }
}
