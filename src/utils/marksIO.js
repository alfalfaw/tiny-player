// 标记的导出 / 导入（纯本地，基于 JSON 文件）。
//
// 导出结构：
// {
//   app: "tiny-player",
//   type: "marks",
//   version: 1,
//   exportedAt: ISO 时间,
//   videos: [
//     { videoId, fileName, duration, marks: [{ id, time, content, color, createdAt, updatedAt }] }
//   ]
// }
//
// 导入采用「合并」策略：按 videoId 归组，按 mark.id 去重；
// 同一 id 冲突时取 updatedAt 较新者，不覆盖本地更新的数据。

const EXPORT_APP = "tiny-player";
const EXPORT_TYPE = "marks";
const EXPORT_VERSION = 1;

function isValidMark(mark) {
  return (
    mark &&
    typeof mark === "object" &&
    typeof mark.id === "string" &&
    Number.isFinite(mark.time) &&
    mark.time >= 0 &&
    typeof mark.content === "string"
  );
}

function normalizeMark(mark) {
  const now = Date.now();
  const createdAt = Number.isFinite(mark.createdAt) ? mark.createdAt : now;
  return {
    id: mark.id,
    time: mark.time,
    content: mark.content,
    color: mark.color ?? null,
    createdAt,
    updatedAt: Number.isFinite(mark.updatedAt) ? mark.updatedAt : createdAt,
  };
}

/** 由本地标记表构建导出内容 */
export function buildExportPayload(markMap, metaMap = {}) {
  const videos = [];
  for (const [videoId, list] of Object.entries(markMap || {})) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const meta = metaMap[videoId] || {};
    videos.push({
      videoId,
      fileName: meta.fileName ?? null,
      duration: Number.isFinite(meta.duration) ? meta.duration : null,
      marks: [...list]
        .sort((a, b) => a.time - b.time)
        .map((mark) => ({
          id: mark.id,
          time: mark.time,
          content: mark.content,
          color: mark.color ?? null,
          createdAt: mark.createdAt ?? null,
          updatedAt: mark.updatedAt ?? null,
        })),
    });
  }
  return {
    app: EXPORT_APP,
    type: EXPORT_TYPE,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    videos,
  };
}

/** 统计导出内容中的标记总数 */
export function countMarks(payload) {
  return (payload?.videos || []).reduce(
    (sum, video) => sum + (video.marks?.length || 0),
    0,
  );
}

/** 触发浏览器下载 JSON 文件 */
export function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 生成用于导出文件名的本地时间后缀，如 20261003-1530 */
export function timestampSuffix(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

/**
 * 解析导入文件的文本内容。
 * 返回可合并的视频数组；格式非法时抛出带提示信息的 Error。
 */
export function parseMarksFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("文件不是合法的 JSON");
  }
  if (!data || typeof data !== "object") {
    throw new Error("文件内容无效");
  }
  if (
    data.app !== EXPORT_APP ||
    data.type !== EXPORT_TYPE ||
    !Array.isArray(data.videos)
  ) {
    throw new Error("不是 tiny-player 的标记文件");
  }

  const videos = [];
  for (const video of data.videos) {
    if (!video || typeof video.videoId !== "string") continue;
    if (!Array.isArray(video.marks)) continue;
    const marks = video.marks.filter(isValidMark).map(normalizeMark);
    if (marks.length === 0) continue;
    videos.push({
      videoId: video.videoId,
      fileName: typeof video.fileName === "string" ? video.fileName : null,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      marks,
    });
  }
  return videos;
}

/**
 * 将导入数据合并进本地标记表。
 * 返回 { map, stats }，map 为合并后的新对象（不修改入参）。
 */
export function mergeMarkMap(localMap, incomingVideos) {
  const next = {};
  for (const [videoId, list] of Object.entries(localMap || {})) {
    next[videoId] = Array.isArray(list) ? list.map((mark) => ({ ...mark })) : [];
  }

  let added = 0;
  let updated = 0;
  const touched = new Set();

  for (const video of incomingVideos) {
    if (!next[video.videoId]) next[video.videoId] = [];
    const list = next[video.videoId];
    const byId = new Map(list.map((mark) => [mark.id, mark]));

    for (const mark of video.marks) {
      const existing = byId.get(mark.id);
      if (!existing) {
        const copy = { ...mark };
        list.push(copy);
        byId.set(copy.id, copy);
        added += 1;
      } else if ((mark.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        Object.assign(existing, mark);
        updated += 1;
      }
    }

    list.sort((a, b) => a.time - b.time);
    touched.add(video.videoId);
  }

  return {
    map: next,
    stats: { videos: touched.size, added, updated },
  };
}
