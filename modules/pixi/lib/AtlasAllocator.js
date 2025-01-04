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
   * @param {number} size - the size of the textures to create
   */
  constructor(label = '', size = 2048) {
    this.label = label;
    this.size = size;
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
   * @return {PIXI.Texture} The allocated texture, if successful; otherwise, `null`.
   * @throws When dimensions are too large to fit on a slab
   */
  _allocateTexture(width, height) {
    // Always include an extra pixel of padding to avoid bleeding into neighbor texture.
    // If `avoidSeams=true` we will write pixel data into this space - see Rapid#1650
    const padding = 1;

    // Cannot allocate a texture larger than the slab size.
    if ((width + (2 * padding)) > this.size || (height + (2 * padding)) > this.size) {
      throw new Error(`Texture can not exceed slab size of ${this.size}x${this.size}`);
    }

    // Loop through the slabs and find one with enough space, if any.
    for (const slab of this.slabs) {
      const texture = this._issueTexture(slab, width, height, padding);
      if (texture) return texture;
    }

    // Need another slab.
    const slab = new AtlasSource(this.label, this.size);
    this.slabs.push(slab);

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
  _issueTexture(slab, width, height, padding = 1) {
    const rect = slab._binPacker.allocate(width + (2 * padding), height + (2 * padding));
    if (!rect) return null;

    rect.pad(-padding);   // The actual frame shouldn't include the padding

    const texture = new PIXI.Texture({
      source: slab,
      frame: rect    // Texture will make a copy
    });

    texture.__bin = rect;   // important to preserve this, it contains `__mem_area`
    return texture;
  }


  /**
   * allocate
   * Allocates the given asset, returning a PIXI.Texture, or throwing if it could not be done.
   *
   * @param {number}  width
   * @param {number}  height
   * @param {*}       asset
   * @param {boolean} avoidSeams - if true, upon upload we'll fill the padding with pixel data
   * @return {PIXI.Texture}  The issued texture
   * @throws If asset type is unrecognized, or dimensions will not fit on a slab
   */
  allocate(width, height, asset, avoidSeams) {
    if (!(asset instanceof HTMLImageElement ||
      asset instanceof HTMLCanvasElement ||
      asset instanceof ImageBitmap ||
      asset instanceof ImageData ||
      ArrayBuffer.isView(asset)
    )) {
      throw new Error('Unsupported asset type');
    }

    if (asset instanceof HTMLImageElement && !asset.complete) {
      throw new Error('HTMLImageElement not loaded - allocate in onload handler instead');
    }

    const texture = this._allocateTexture(width, height);
    const uid = texture.uid;
    const slab = texture.source;

    const item = {
      uid: uid,
      texture: texture,
      asset: asset,
      avoidSeams: avoidSeams,
      uploaded: false
    };

    slab._items.set(uid, item);
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

//    // no items left, free the slab (unless it's the first slab)
//    if (!slab._items.size && slab !== this.slabs[0]) {
//      slab.destroy();
//      slab._items = null;
//      slab._binPacker = null;
//    }
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

      const bin = item.texture.__bin;
      let source = item.asset;

      if (webGLVersion === 1) {
        if (source instanceof ImageData) {
          source = source.data; // pass the typed array directly

        } else if (source instanceof HTMLCanvasElement) {
          // note that the canvas width/height may be larger than the actual texture
          const [w, h] = [bin.width, bin.height];
          const ctx = source.getContext('2d');
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

      const { x, y, width: w, height: h } = bin;

      // Experiment: bake in 1px padding by duplicating the edge rows/cols - see Rapid#1650
      // Because it is too complicated to blit framebuffers, or grab just a few pixels from
      // the source image, I'm just going to do this 4x for the corners + 1 for the main image.
      // Goal is to avoid having images in the atlas bleed into a neighboring image by the sampler.
      if (item.avoidSeams) {
        gl.texSubImage2D(target, 0, x-1, y-1, 1, 1, format, type, source);  // left top
        gl.texSubImage2D(target, 0, x-1, y+1, w, h, format, type, source);  // left bottom
        gl.texSubImage2D(target, 0, x+1, y-1, w, h, format, type, source);  // right top
        gl.texSubImage2D(target, 0, x+1, y+1, w, h, format, type, source);  // right bottom
        gl.texSubImage2D(target, 0, x-1, y,   w, h, format, type, source);  // left mid
        gl.texSubImage2D(target, 0, x+1, y,   w, h, format, type, source);  // right mid
        gl.texSubImage2D(target, 0, x,   y-1, w, h, format, type, source);  // mid top
        gl.texSubImage2D(target, 0, x,   y+1, w, h, format, type, source);  // mid bottom
      }
      // end experiment

      gl.texSubImage2D(target, 0, x, y, w, h, format, type, source);  // the image we really want

      item.uploaded = true;
    }
  }
};


// WebGPU Uploader
const gpuUploadAtlasResource = {
  type: 'atlas',
  upload(slab, gpuTexture, gpu) {
    const premultipliedAlpha = slab.alphaMode === 'premultiply-alpha-on-upload';

    for (const item of slab._items.values()) {
      if (item.uploaded) continue;

      const { x, y, width: w, height: h } = item.texture.__bin;
      let source = item.asset;
      if (source instanceof ImageData) {
        source = source.data;
      }

      // copyexternalimagetotexture
      if (source instanceof HTMLImageElement ||
        source instanceof HTMLCanvasElement ||
        source instanceof ImageBitmap
      ) {
        const src = { source: source };
        const origin = { x: x, y: y };
        const dest = { origin: origin, premultipliedAlpha: premultipliedAlpha, texture: gpuTexture };
        const size = { width: w, height: h };

        // Same experiment as the WebGL one above
        if (item.avoidSeams) {
          origin.x = x-1;  origin.y = y-1;   // top left
          gpu.device.queue.copyExternalImageToTexture(src, dest, size);
          origin.x = x-1;  origin.y = y+1;   // bottom left
          gpu.device.queue.copyExternalImageToTexture(src, dest, size);
          origin.x = x+1;  origin.y = y-1;   // top right
          gpu.device.queue.copyExternalImageToTexture(src, dest, size);
          origin.x = x+1;  origin.y = y+1;   // bottom right
          gpu.device.queue.copyExternalImageToTexture(src, dest, size);
        }
        // end experiment

        origin.x = x;  origin.y = y;   // the image we really want
        gpu.device.queue.copyExternalImageToTexture(src, dest, size);

      // writetexture
      } else if (ArrayBuffer.isView(source)) {
        const origin = { x: x, y: y };
        const dest = { origin: origin, texture: gpuTexture };
        const layout = { bytesPerRow: source.byteLength / h };
        const size = { width: w, height: h };

        // Same experiment as the WebGL one above
        if (item.avoidSeams) {
          origin.x = x-1;  origin.y = y-1;   // top left
          gpu.device.queue.writeTexture(dest, source, layout, size);
          origin.x = x-1;  origin.y = y+1;   // bottom left
          gpu.device.queue.writeTexture(dest, source, layout, size);
          origin.x = x+1;  origin.y = y-1;   // top right
          gpu.device.queue.writeTexture(dest, source, layout, size);
          origin.x = x+1;  origin.y = y+1;   // bottom right
          gpu.device.queue.writeTexture(dest, source, layout, size);
        }
        // end experiment

        origin.x = x;  origin.y = y;   // the image we really want
        gpu.device.queue.writeTexture(dest, source, layout, size);

      } else {
        throw new Error('Unsupported source type');
      }

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
