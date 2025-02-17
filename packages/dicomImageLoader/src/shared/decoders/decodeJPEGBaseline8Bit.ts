import type {
  LibJpegTurbo8Bit,
  OpenJpegModule,
} from '@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbowasm_decode';
import type { ByteArray } from 'dicom-parser';
// @ts-ignore
import libjpegTurboFactory from '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs';

// @ts-ignore
import libjpegTurboWasm from '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm';
//const libjpegTurboWasm = new URL(
//  '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm',
//  import.meta.url
//);
import type { Types } from '@cornerstonejs/core';

const local: {
  codec: OpenJpegModule;
  decoder: LibJpegTurbo8Bit;
} = {
  codec: undefined,
  decoder: undefined,
};

function initLibjpegTurbo(): Promise<void> {
  if (local.codec) {
    return Promise.resolve();
  }

  const libjpegTurboModule = libjpegTurboFactory({
    locateFile: (f) => {
      if (f.endsWith('.wasm')) {
        return libjpegTurboWasm.toString();
      }

      return f;
    },
  });

  return new Promise((resolve, reject) => {
    libjpegTurboModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.JPEGDecoder();
      resolve();
    }, reject);
  });
}

// imageFrame.pixelRepresentation === 1 <-- Signed
/**
 *
 * @param {*} compressedImageFrame
 * @param {object}  imageInfo
 * @param {boolean} imageInfo.signed -
 */
async function decodeAsync(
  compressedImageFrame,
  imageInfo
): Promise<Types.IImageFrame> {
  await initLibjpegTurbo();
  const decoder = local.decoder;

  // get pointer to the source/encoded bit stream buffer in WASM memory
  // that can hold the encoded bitstream
  const encodedBufferInWASM = decoder.getEncodedBuffer(
    compressedImageFrame.length
  );

  // copy the encoded bitstream into WASM memory buffer
  encodedBufferInWASM.set(compressedImageFrame);

  // decode it
  decoder.decode();

  // get information about the decoded image
  const frameInfo = decoder.getFrameInfo();

  // get the decoded pixels
  const decodedPixelsInWASM = decoder.getDecodedBuffer();

  const encodedImageInfo = {
    columns: frameInfo.width,
    rows: frameInfo.height,
    bitsPerPixel: frameInfo.bitsPerSample,
    signed: imageInfo.signed,
    bytesPerPixel: imageInfo.bytesPerPixel,
    componentsPerPixel: frameInfo.componentCount,
  };

  const pixelData = getPixelData(frameInfo, decodedPixelsInWASM);
  encodedImageInfo.componentsPerPixel = pixelData.length/frameInfo.width/frameInfo.height;

  const encodeOptions = {
    frameInfo,
  };

  return {
    ...imageInfo,
    pixelData,
    imageInfo: encodedImageInfo,
    encodeOptions,
    ...encodeOptions,
    ...encodedImageInfo,
  };
}

function getPixelData(frameInfo, decodedBuffer: ByteArray) {
  if (frameInfo.isSigned) {
    return new Int8Array(
      decodedBuffer.buffer,
      decodedBuffer.byteOffset,
      decodedBuffer.byteLength
    );
  }

  const src = new Uint8Array(
    decodedBuffer.buffer,
    decodedBuffer.byteOffset,
    decodedBuffer.byteLength
  );
  // expand RGB to RGBA
  if (frameInfo.componentCount === 3) {
    const dst = new Uint8Array(src.length/3*4);
    for (let i=0; i<src.length/3; ++i) {
      dst[i*4]=src[i*3];
      dst[i*4+1]=src[i*3+1];
      dst[i*4+2]=src[i*3+2];
      dst[i*4+3]=255;
    }
    return dst
  } else {
    return src
  }
}

export default decodeAsync;
