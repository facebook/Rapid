import * as PIXI from 'pixi.js';
import { numClamp } from '@rapid-sdk/math';
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
   * @param {number} size - the size of the textures to create
   */
  constructor(label = '', size = 2048) {
    this.label = label;
    this.size = size;
    this.slabs = [];
  }


  /**
   * allocate
   * Allocates the given asset, returning a `PIXI.Texture`, or throwing if it could not be done.
   * @param   {ImageData}     imageData - The asset to pack in the atlas, must be of type ImageData
   * @return  {PIXI.Texture}  The issued texture
   * @throws  If asset type is unrecognized, or dimensions will not fit on a slab
   */
  allocate(imageData) {
    if (!(imageData instanceof ImageData)) {
      throw new Error('Unsupported asset type - convert it to ImageData first');
    }

    const texture = this._allocateTexture(imageData.width, imageData.height);
    const uid = texture.uid;
    const slab = texture.source;

    const item = {
      uid: uid,
      texture: texture,
      imageData: imageData,
      uploaded: false
    };

    slab._items.set(uid, item);
    slab.update();

    return texture;
  }


  /**
   * free
   * Frees the texture and reclaims its space.
   * @param   {PIXI.Texture }  texture
   * @throws  If the texture was not found, or some other issue prevents it from freeing.
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
    item.imageData = null;
    item.texture = null;
    slab._items.delete(uid);

//    // no items left, free the slab (unless it's the first slab)
//    if (!slab._items.size && slab !== this.slabs[0]) {
//      slab.destroy();
//      slab._items = null;
//      slab._binPacker = null;
//    }
  }


  /**
   * _allocateTexture
   * Allocates a texture from this allocator.
   * If its existing slab pool has enough space, the texture is issued from one.
   * Otherwise, a new slab is created and the texture is issued from it.
   *
   * @param   {number}  width - The width of the requested texture.
   * @param   {number}  height - The height of the requested texture.
   * @return  {PIXI.Texture} The allocated texture, if successful; otherwise, `null`.
   * @throws  When dimensions are too large to fit on a slab
   */
  _allocateTexture(width, height) {
    // We'll always include an extra pixel of padding to avoid color bleeding into neighbor texture.
    const padding = 1;

    // Cannot allocate a texture larger than the slab size.
    if ((width + (2 * padding)) > this.size || (height + (2 * padding)) > this.size) {
      throw new Error(`Texture can not exceed slab size of ${this.size}x${this.size}`);
    }

    // Loop through the slabs and find one with enough space, if any.
    for (const slab of this.slabs) {
      const texture = this._issueTexture(slab, width, height);
      if (texture) return texture;
    }

    // Need another slab.
    const slab = new AtlasSource(this.label, this.size);
    this.slabs.push(slab);

    // Issue the texture from this blank slab.
    return this._issueTexture(slab, width, height);
  }


  /**
   * Issues a texture from the given texture slab, if possible.
   *
   * @param  {AtlasSource}  slab - The texture slab to allocate frame.
   * @param  {number}       width - The width of the requested texture.
   * @param  {number}       height - The height of the requested texture.
   * @return {PIXI.Texture}  The issued texture, if successful; otherwise, `null`.
   */
  _issueTexture(slab, width, height) {
    // We'll always include an extra pixel of padding to avoid color bleeding into neighbor texture.
    const padding = 1;

    const bin = slab._binPacker.allocate(width + (2 * padding), height + (2 * padding));
    if (!bin) return null;

    const texture = new PIXI.Texture({
      source: slab,
      frame: bin.clone().pad(-padding)   // The actual frame shouldn't include the padding
    });

    texture.__bin = bin;   // important to preserve this, it contains `__mem_area`
    return texture;
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
   * @param {number}  size - the size of the textures to create
   */
  constructor(label, size) {
    super({
      antialias: false,
      autoGarbageCollect: false,
      autoGenerateMipmaps: false,
      dimensions: '2d',
      format: 'rgba8unorm',
      height: size,
      label: label,
      resolution: 1,
      width: size
    });
    this.uploadMethodId = 'atlas';

    this._items = new Map();      // Map<uid, Item object>
    this._binPacker = new GuilloteneAllocator(size, size);
  }
}


// WebGL Uploader
const glUploadAtlasResource = {
  id: 'atlas',
  upload(slab, glTexture, gl, webGLVersion) {
    const { width, height } = slab;
    const { target, format, type } = glTexture;
    const premultipliedAlpha = slab.alphaMode === 'premultiply-alpha-on-upload';

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultipliedAlpha);

    // Allocate the texture on the GPU
    if (glTexture.width !== width || glTexture.height !== height) {
      glTexture.width = width;
      glTexture.height = height;

// fill red
//const size = width * height;
//const pixels = new Uint8Array(size * 4);
//for (let i = 0; i < size; i++) {
//  const j = i * 4;
//  pixels[j] = 255;
//  pixels[j+1] = 0;
//  pixels[j+2] = 0;
//  pixels[j+3] = 255;
//}
      gl.texImage2D(target, 0, format, width, height, 0, format, type, undefined);    // no fill
//      gl.texImage2D(target, 0, format, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);  // fill red
    }

    // Upload all atlas items.
    for (const item of slab._items.values()) {
      if (item.uploaded) continue;

      const { x, y, width: w, height: h } = item.texture.__bin;
      const { data: src, width: srcW, height: srcH } = item.imageData;

      // Copy image data to a new Uint8Array that duplicates the 1px edge
      const pixels = new Uint8Array(w * h * 4);

      for (let dstY = 0; dstY < h; dstY++) {
        const srcY = numClamp(dstY-1, 0, srcH-1);

        for (let dstX = 0; dstX < w; dstX++) {
          const srcX = numClamp(dstX-1, 0, srcW-1);
          const s = ((srcY * srcW) + srcX) * 4;
          const d = ((dstY * w) + dstX) * 4;
          pixels[d] = src[s];
          pixels[d+1] = src[s+1];
          pixels[d+2] = src[s+2];
          pixels[d+3] = src[s+3];
        }
      }

      gl.texSubImage2D(target, 0, x, y, w, h, format, type, pixels);

      item.uploaded = true;
    }
  }
};


// WebGPU Uploader
const gpuUploadAtlasResource = {
  type: 'atlas',
  upload(slab, gpuTexture, gpu) {
    // const premultipliedAlpha = slab.alphaMode === 'premultiply-alpha-on-upload';

    for (const item of slab._items.values()) {
      if (item.uploaded) continue;

      const { x, y, width: w, height: h } = item.texture.__bin;
      const { data: src, width: srcW, height: srcH } = item.imageData;

      // Copy image data to a new Uint8Array that duplicates the 1px edge
      const pixels = new Uint8Array(w * h * 4);

      for (let dstY = 0; dstY < h; dstY++) {
        const srcY = numClamp(dstY-1, 0, srcH-1);

        for (let dstX = 0; dstX < w; dstX++) {
          const srcX = numClamp(dstX-1, 0, srcW-1);
          const s = ((srcY * srcW) + srcX) * 4;
          const d = ((dstY * w) + dstX) * 4;
          pixels[d] = src[s];
          pixels[d+1] = src[s+1];
          pixels[d+2] = src[s+2];
          pixels[d+3] = src[s+3];
        }
      }

      const destination = { origin: { x: x, y: y }, texture: gpuTexture };
      const layout = { bytesPerRow: pixels.byteLength / h };
      const size = { width: w, height: h };

      gpu.device.queue.writeTexture(destination, pixels, layout, size);

      item.uploaded = true;
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
