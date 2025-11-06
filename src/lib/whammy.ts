type EBMLElement = {
  id: number[];
  data: Uint8Array;
};

function uintToArray(value: number, bytes = 1): Uint8Array {
  const arr = new Uint8Array(bytes);
  for (let i = bytes - 1; i >= 0; i--) {
    arr[i] = value & 0xff;
    value >>= 8;
  }
  return arr;
}

function float64ToArray(value: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value);
  return new Uint8Array(buffer);
}

function encodeVint(value: number): Uint8Array {
  let length = 1;
  while (value >= Math.pow(2, 7 * length) - 1 && length < 8) {
    length++;
  }
  const buffer = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    buffer[i] = value & 0xff;
    value >>= 8;
  }
  buffer[0] |= 1 << (8 - length);
  return buffer;
}

function encodeElement(id: number[], data: Uint8Array): Uint8Array {
  const size = encodeVint(data.length);
  const result = new Uint8Array(id.length + size.length + data.length);
  result.set(id, 0);
  result.set(size, id.length);
  result.set(data, id.length + size.length);
  return result;
}

function concatArrays(...arrays: Uint8Array[]): Uint8Array {
  const length = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function extractVP8Bitstream(webp: Uint8Array): Uint8Array {
  const signature = [0x56, 0x50, 0x38, 0x20]; // "VP8 "
  for (let i = 0; i <= webp.length - 10; i++) {
    if (
      webp[i] === signature[0] &&
      webp[i + 1] === signature[1] &&
      webp[i + 2] === signature[2] &&
      webp[i + 3] === signature[3]
    ) {
      const size =
        webp[i + 4] |
        (webp[i + 5] << 8) |
        (webp[i + 6] << 16) |
        (webp[i + 7] << 24);
      const start = i + 8;
      return webp.subarray(start, start + size);
    }
  }
  throw new Error("VP8 bitstream not found in WebP image.");
}

function dataURLToUint8Array(dataURL: string): Uint8Array {
  const index = dataURL.indexOf(",");
  const b64 = dataURL.slice(index + 1);
  const binaryString = atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createSimpleBlock(vp8Frame: Uint8Array, timecode: number): Uint8Array {
  const trackNumber = new Uint8Array([0x81]); // Track 1
  const tc = new Uint8Array(2);
  tc[0] = (timecode >> 8) & 0xff;
  tc[1] = timecode & 0xff;
  const flags = new Uint8Array([0x80]); // Keyframe
  const payload = concatArrays(trackNumber, tc, flags, vp8Frame);
  return encodeElement([0xa3], payload);
}

function createWebM(
  frames: Uint8Array[],
  frameDurationMs: number,
  width: number,
  height: number
): Uint8Array {
  const frameCount = frames.length;
  const durationMs = frameDurationMs * frameCount;

  const ebml = encodeElement([0x1a, 0x45, 0xdf, 0xa3], concatArrays(
    encodeElement([0x42, 0x86], new Uint8Array([0x01])),
    encodeElement([0x42, 0xf7], new Uint8Array([0x01])),
    encodeElement([0x42, 0xf2], new Uint8Array([0x04])),
    encodeElement([0x42, 0xf3], new Uint8Array([0x08])),
    encodeElement([0x42, 0x82], new TextEncoder().encode("webm")),
    encodeElement([0x42, 0x87], new Uint8Array([0x02])),
    encodeElement([0x42, 0x85], new Uint8Array([0x02]))
  ));

  const segmentInfo = encodeElement([0x15, 0x49, 0xa9, 0x66], concatArrays(
    encodeElement([0x2a, 0xd7, 0xb1], uintToArray(1000000, 4)),
    encodeElement([0x44, 0x89], float64ToArray(durationMs / 1000)),
    encodeElement([0x4d, 0x80], new TextEncoder().encode("AnimArrange")),
    encodeElement([0x57, 0x41], new TextEncoder().encode("AnimArrange"))
  ));

  const trackEntry = encodeElement([0xae], concatArrays(
    encodeElement([0xd7], uintToArray(1)),
    encodeElement([0x73, 0xc5], uintToArray(1)),
    encodeElement([0x9c], new Uint8Array([0x00])),
    encodeElement([0x83], new Uint8Array([0x01])),
    encodeElement([0x86], new TextEncoder().encode("V_VP8")),
    encodeElement([0xe0], concatArrays(
      encodeElement([0xb0], uintToArray(width, 2)),
      encodeElement([0xba], uintToArray(height, 2))
    ))
  ));

  const tracks = encodeElement([0x16, 0x54, 0xae, 0x6b], trackEntry);

  const clusterTimecode = encodeElement([0xe7], uintToArray(0, 2));
  const simpleBlocks: Uint8Array[] = [];
  let timecode = 0;
  for (const frame of frames) {
    simpleBlocks.push(createSimpleBlock(frame, timecode));
    timecode += frameDurationMs;
  }
  const cluster = encodeElement([0x1f, 0x43, 0xb6, 0x75], concatArrays(clusterTimecode, ...simpleBlocks));

  const segment = encodeElement([0x18, 0x53, 0x80, 0x67], concatArrays(segmentInfo, tracks, cluster));

  return concatArrays(ebml, segment);
}

export async function fromImageArray(
  frames: string[],
  fps: number,
  width: number,
  height: number
): Promise<Blob> {
  const frameDurationMs = Math.round(1000 / fps);
  const vp8Frames: Uint8Array[] = frames.map((frame) => {
    const webp = dataURLToUint8Array(frame);
    return extractVP8Bitstream(webp);
  });

  const webmBytes = createWebM(vp8Frames, frameDurationMs, width, height);
  return new Blob([webmBytes], { type: "video/webm" });
}
