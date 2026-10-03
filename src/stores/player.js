import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { computeVideoId } from "@/utils/videoId";
import { buildExportPayload, mergeMarkMap } from "@/utils/marksIO";

export const usePlayerStore = defineStore(
  "player",
  () => {
    // 当前播放的视频信息
    const currentVideo = ref(null);
    // 当前播放进度（秒）
    const currentTime = ref(0);
    // 视频总时长
    const duration = ref(0);
    // 是否正在播放
    const isPlaying = ref(false);
    // 音量 0-1
    const volume = ref(0.8);
    // 播放速率
    const playbackRate = ref(1);

    // 播放进度记录 { [videoId]: { currentTime, duration, fileName, lastPlayTime } }
    const progressMap = ref({});

    // 播放历史 { videoId, fileName, fileSize, lastPlayTime, currentTime, duration }
    const history = ref([]);

    // 播放队列 { id, file, url, videoId, fileName, fileSize }
    // 注意：队列不持久化（File 对象无法序列化）
    const queue = ref([]);

    // 视频标记 { [videoId]: Mark[] }
    // Mark: { id, time, content, color, createdAt, updatedAt }
    const marks = ref({});

    // 当前播放项在队列中的 id
    const currentQueueId = ref(null);

    // 队列中当前项的索引
    const currentQueueIndex = computed(() => {
      if (!currentQueueId.value) return -1;
      return queue.value.findIndex((item) => item.id === currentQueueId.value);
    });

    // 是否有下一个
    const hasNext = computed(() => {
      const idx = currentQueueIndex.value;
      return idx >= 0 && idx < queue.value.length - 1;
    });

    // 是否有上一个
    const hasPrevious = computed(() => {
      return currentQueueIndex.value > 0;
    });

    // 队列项 id 生成器
    let queueIdSeq = 0;
    function nextQueueId() {
      return `${Date.now()}-${queueIdSeq++}`;
    }

    // 添加到队列（按视频内容指纹 videoId 去重，而非文件名）
    async function addToQueue(files) {
      const items = [];
      for (const file of files) {
        if (!file.type.startsWith("video/")) continue;

        // 计算内容指纹；失败时退化为文件名，保证仍可播放
        let videoId = null;
        try {
          videoId = await computeVideoId(file);
        } catch {
          videoId = `name:${file.name}`;
        }

        const existingIdx = queue.value.findIndex((q) => q.videoId === videoId);
        const url = URL.createObjectURL(file);
        if (existingIdx >= 0) {
          // 同一内容已存在，更新 file/url 并保留原顺序
          const old = queue.value[existingIdx];
          if (old.url) URL.revokeObjectURL(old.url);
          queue.value[existingIdx] = {
            ...old,
            file,
            url,
            fileName: file.name,
            fileSize: file.size,
            videoId,
          };
          items.push(queue.value[existingIdx]);
        } else {
          const item = {
            id: nextQueueId(),
            file,
            url,
            videoId,
            fileName: file.name,
            fileSize: file.size,
          };
          items.push(item);
          queue.value.push(item);
        }
      }
      return items;
    }

    // 从队列中移除
    function removeFromQueue(id) {
      const idx = queue.value.findIndex((item) => item.id === id);
      if (idx < 0) return;
      const item = queue.value[idx];
      URL.revokeObjectURL(item.url);
      queue.value.splice(idx, 1);
    }

    // 清空队列
    function clearQueue() {
      for (const item of queue.value) {
        URL.revokeObjectURL(item.url);
      }
      queue.value = [];
      currentQueueId.value = null;
    }

    // 获取下一个
    function getNext() {
      const idx = currentQueueIndex.value;
      if (idx >= 0 && idx < queue.value.length - 1) {
        return queue.value[idx + 1];
      }
      return null;
    }

    // 获取上一个
    function getPrevious() {
      const idx = currentQueueIndex.value;
      if (idx > 0) {
        return queue.value[idx - 1];
      }
      return null;
    }

    // 设置当前播放项
    function setCurrentQueueItem(id) {
      currentQueueId.value = id;
    }

    // 保存播放进度（按 videoId 记录，fileName 仅用于展示）
    function saveProgress(videoId, currentTimeVal, durationVal, fileName) {
      if (!videoId) return;
      const prev = progressMap.value[videoId];
      progressMap.value[videoId] = {
        currentTime: currentTimeVal,
        duration: durationVal,
        fileName: fileName || prev?.fileName || null,
        lastPlayTime: Date.now(),
      };
      updateHistory(videoId, fileName, null, currentTimeVal, durationVal);
    }

    // 获取播放进度
    function getProgress(videoId) {
      if (!videoId) return null;
      return progressMap.value[videoId] || null;
    }

    // 更新播放历史
    function updateHistory(videoId, fileName, fileSize, currentTimeVal, durationVal) {
      if (!videoId) return;
      const existingIndex = history.value.findIndex((h) => h.videoId === videoId);
      const prev = existingIndex >= 0 ? history.value[existingIndex] : null;
      const record = {
        videoId,
        fileName: fileName || prev?.fileName || null,
        fileSize: fileSize || prev?.fileSize || null,
        lastPlayTime: Date.now(),
        currentTime: currentTimeVal ?? 0,
        duration: durationVal ?? 0,
      };
      if (existingIndex >= 0) {
        history.value.splice(existingIndex, 1);
      }
      history.value.unshift(record);
      if (history.value.length > 50) {
        history.value = history.value.slice(0, 50);
      }
    }

    // 从历史记录中删除
    function removeHistory(videoId) {
      if (!videoId) return;
      history.value = history.value.filter((h) => h.videoId !== videoId);
      delete progressMap.value[videoId];
    }

    // 清空历史
    function clearHistory() {
      history.value = [];
      progressMap.value = {};
    }

    // 设置当前视频
    function setCurrentVideo(videoInfo) {
      currentVideo.value = videoInfo;
      const saved = getProgress(videoInfo?.videoId);
      if (saved) {
        currentTime.value = saved.currentTime;
      }
    }

    // ---------- 标记 ----------

    // 获取某个视频的标记（按时间升序）
    function getMarks(videoId) {
      if (!videoId) return [];
      return marks.value[videoId] || [];
    }

    // 新增标记
    function addMark(videoId, time, content) {
      if (!videoId) return null;
      const now = Date.now();
      const mark = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `mark-${now}-${Math.random().toString(16).slice(2)}`,
        time: Math.max(0, Number(time) || 0),
        content: String(content || "").trim(),
        color: null,
        createdAt: now,
        updatedAt: now,
      };
      const list = [...(marks.value[videoId] || []), mark].sort(
        (a, b) => a.time - b.time,
      );
      marks.value = { ...marks.value, [videoId]: list };
      return mark;
    }

    // 更新标记（内容或时间）
    function updateMark(videoId, markId, patch) {
      const list = marks.value[videoId];
      if (!list) return;
      const next = list
        .map((mark) =>
          mark.id === markId
            ? {
                ...mark,
                ...patch,
                time:
                  patch.time !== undefined
                    ? Math.max(0, Number(patch.time) || 0)
                    : mark.time,
                content:
                  patch.content !== undefined
                    ? String(patch.content).trim()
                    : mark.content,
                updatedAt: Date.now(),
              }
            : mark,
        )
        .sort((a, b) => a.time - b.time);
      marks.value = { ...marks.value, [videoId]: next };
    }

    // 删除标记
    function removeMark(videoId, markId) {
      const list = marks.value[videoId];
      if (!list) return;
      const next = list.filter((mark) => mark.id !== markId);
      const map = { ...marks.value };
      if (next.length) {
        map[videoId] = next;
      } else {
        delete map[videoId];
      }
      marks.value = map;
    }

    // 清空某个视频的全部标记
    function clearMarks(videoId) {
      if (!marks.value[videoId]) return;
      const map = { ...marks.value };
      delete map[videoId];
      marks.value = map;
    }

    // 构建导出内容（一次导出全部标记，附带已知的视频展示信息）
    function buildMarksExport() {
      const meta = {};
      for (const item of queue.value) {
        if (item.videoId) {
          meta[item.videoId] = { fileName: item.fileName, duration: null };
        }
      }
      for (const record of history.value) {
        if (!record.videoId) continue;
        meta[record.videoId] = {
          fileName: record.fileName,
          duration: record.duration,
        };
      }
      for (const [videoId, progress] of Object.entries(progressMap.value)) {
        meta[videoId] = {
          fileName: meta[videoId]?.fileName ?? progress.fileName ?? null,
          duration: progress.duration ?? meta[videoId]?.duration ?? null,
        };
      }
      return buildExportPayload(marks.value, meta);
    }

    // 应用导入结果（合并），返回统计信息
    function applyImportedMarks(incomingVideos) {
      const { map, stats } = mergeMarkMap(marks.value, incomingVideos);
      marks.value = map;
      return stats;
    }

    // 格式化时间
    function formatTime(seconds) {
      if (!seconds || isNaN(seconds)) return "00:00";
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) {
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    // 格式化文件大小
    function formatSize(bytes) {
      if (!bytes) return "";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      if (bytes < 1024 * 1024 * 1024)
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    return {
      currentVideo,
      currentTime,
      duration,
      isPlaying,
      volume,
      playbackRate,
      progressMap,
      history,
      queue,
      marks,
      currentQueueId,
      currentQueueIndex,
      hasNext,
      hasPrevious,
      addToQueue,
      removeFromQueue,
      clearQueue,
      getNext,
      getPrevious,
      setCurrentQueueItem,
      saveProgress,
      getProgress,
      updateHistory,
      removeHistory,
      clearHistory,
      setCurrentVideo,
      getMarks,
      addMark,
      updateMark,
      removeMark,
      clearMarks,
      buildMarksExport,
      applyImportedMarks,
      formatTime,
      formatSize,
    };
  },
  {
    persist: {
      paths: [
        "currentVideo",
        "currentTime",
        "duration",
        "volume",
        "playbackRate",
        "progressMap",
        "history",
        "marks",
      ],
    },
  },
);
