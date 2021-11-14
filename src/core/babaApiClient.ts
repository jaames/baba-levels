import { assert, assertTypeOf } from './utils';

const BASE_URL = 'https://8778eno8ha.execute-api.eu-central-1.amazonaws.com';
const LINEBREAK = '\n';
const WORDBREAK = '\u0001';

export interface BabaLevelInfo {
  name: string;
  author: string;
  difficulty: string;
};

export interface BabaExtendedLevelInfo extends BabaLevelInfo {
  desc: string;
  id: string;
};

function listToObject(list: string[]): Record<string, string> {
  let ret = {};
  assert(list.length % 2 === 0, 'List length must be even');
  for (let i = 0; i < list.length; i += 2) {
    const key = list[i];
    const value = list[i + 1];
    ret[key] = value;
  }
  return ret;
}

async function get(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(path, BASE_URL);
  const searchParams = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, `${v}`]));
  url.search = searchParams.toString();
  const resp = await fetch(url.toString());
  const data = await resp.text();
  // split response into lines, and then lines into words
  return data.split(LINEBREAK).map(line => line.split(WORDBREAK));
}

export async function listLevels(category: string, page: number) {
  const data = await get('/prod/list_levels2', { category, page });
  const [[assetPath], [numPages], ...levelData] = data;
  const levels = levelData.map(level => {
    const levelInfo = listToObject(level);
    assertTypeOf<BabaExtendedLevelInfo>(levelInfo, 'name', 'author', 'difficulty', 'desc', 'id');
    return levelInfo as BabaExtendedLevelInfo;
  });
  return {
    assetPath,
    numPages: parseInt(numPages),
    levels
  }
}

export async function getLevel(level: string) {
  const data = await get('/prod/get_level', { level });
  const [[assetPath], [...levelData]] = data;
  const levelInfo = listToObject(levelData);
  assertTypeOf<BabaLevelInfo>(levelInfo, 'name', 'author', 'difficulty');
  return {
    assetPath,
    ...levelInfo
  }
}