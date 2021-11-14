import { unzlibSync } from 'fflate';

const BASE_URL = 'https://babalevels3.s3.eu-central-1.amazonaws.com';

function decompress(buffer: ArrayBuffer) {
  const decompressed = unzlibSync(new Uint8Array(buffer));
  return decompressed.buffer;
}

async function get(path: string) {
  const url = new URL(path, BASE_URL);
  const resp = await fetch(url.toString());
  return await resp.arrayBuffer();
}

export function getThumbUrl(id: string) {
  return `${ BASE_URL }/${ id }.png`;
}

export async function getThumbImage(id: string) {
  return await get(`${ id }.png`);
}

export async function getLevelMap(id: string) {
  const buffer = await get(`${ id }.l`);
  return decompress(buffer);
}

export async function getLevelData(id: string) {
  const buffer = await get(`${ id }.ld`);
  return decompress(buffer);
}