// 视频内容指纹（videoId）计算。
//
// 目标：同一视频内容无论改名、移动、换设备导入，都得到同一个 id，
// 从而让播放进度与标记可以稳定地挂在这个 id 上，而不再依赖文件名。
//
// 算法：采样「首 / 中 / 尾」各 1MB 数据，拼上文件长度后做 SHA-256。
// 小文件（<= 3MB）直接对全文哈希。采样读取量恒定，避免 GB 级视频全量
// 哈希导致的界面卡顿；非恶意场景下几乎不会碰撞。
//
// 注意：crypto.subtle 仅在安全上下文（localhost / https）可用，
// 不可用时退化为 FNV-1a 兜底哈希（仍基于同样采样数据）。

const SAMPLE_SIZE = 1024 * 1024; // 1MB
const SMALL_FILE_LIMIT = SAMPLE_SIZE * 3;

// 按「文件名 + 大小 + 修改时间」缓存结果，避免重复拖入时重算。
// 文件名只用于缓存键，不影响指纹结果本身。
const cache = new Map();

function cacheKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

// 非安全上下文下的兜底哈希（64 位 FNV-1a）
function fnv1a64(bytes) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash ^ BigInt(bytes[i])) * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

async function readChunk(file, start, end) {
  const buffer = await file.slice(start, end).arrayBuffer();
  return new Uint8Array(buffer);
}

async function buildFingerprintBytes(file) {
  const size = file.size;
  const parts = [];

  // 将文件长度纳入指纹，避免「长度不同但采样巧合相同」的碰撞。
  const sizeBytes = new Uint8Array(8);
  new DataView(sizeBytes.buffer).setBigUint64(0, BigInt(size), false);
  parts.push(sizeBytes);

  if (size <= SMALL_FILE_LIMIT) {
    parts.push(new Uint8Array(await file.arrayBuffer()));
  } else {
    const starts = [
      0,
      Math.floor((size - SAMPLE_SIZE) / 2),
      size - SAMPLE_SIZE,
    ];
    for (const start of starts) {
      parts.push(await readChunk(file, start, start + SAMPLE_SIZE));
    }
  }

  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

async function compute(file) {
  const bytes = await buildFingerprintBytes(file);
  if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return `sha256:${toHex(digest)}`;
  }
  return `fnv1a:${fnv1a64(bytes)}`;
}

/**
 * 计算视频内容指纹，返回 Promise<string>。
 * 相同内容（即使文件名不同）会得到相同的 id。
 */
export function computeVideoId(file) {
  if (!file) return Promise.resolve(null);
  const key = cacheKey(file);
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = compute(file).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, promise);
  return promise;
}
