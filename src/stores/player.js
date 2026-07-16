import { defineStore } from "pinia";
import { ref, computed } from "vue";

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

    // 播放进度记录 { fileName: { currentTime, duration, lastPlayTime } }
    const progressMap = ref({});

    // 播放历史 { fileName, fileSize, lastPlayTime, currentTime, duration }
    const history = ref([]);

    // 播放队列 { id, file, url, fileName, fileSize }
    // 注意：队列不持久化（File 对象无法序列化）
    const queue = ref([]);

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

    // 添加到队列（同名文件更新 url）
    function addToQueue(files) {
      const items = [];
      for (const file of files) {
        if (!file.type.startsWith("video/")) continue;
        const existingIdx = queue.value.findIndex(
          (q) => q.fileName === file.name,
        );
        if (existingIdx >= 0) {
          // 同名文件已存在，更新 url 和 file
          const old = queue.value[existingIdx];
          if (old.url) URL.revokeObjectURL(old.url);
          const url = URL.createObjectURL(file);
          queue.value[existingIdx] = { ...old, file, url };
          items.push(queue.value[existingIdx]);
        } else {
          const url = URL.createObjectURL(file);
          const item = {
            id: Date.now(),
            file,
            url,
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

    // 保存播放进度
    function saveProgress(fileName, currentTimeVal, durationVal) {
      if (!fileName) return;
      progressMap.value[fileName] = {
        currentTime: currentTimeVal,
        duration: durationVal,
        lastPlayTime: Date.now(),
      };
      updateHistory(fileName, null, currentTimeVal, durationVal);
    }

    // 获取播放进度
    function getProgress(fileName) {
      return progressMap.value[fileName] || null;
    }

    // 更新播放历史
    function updateHistory(fileName, fileSize, currentTimeVal, durationVal) {
      if (!fileName) return;
      const existingIndex = history.value.findIndex(
        (h) => h.fileName === fileName,
      );
      const record = {
        fileName,
        fileSize: fileSize || null,
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
    function removeHistory(fileName) {
      history.value = history.value.filter((h) => h.fileName !== fileName);
      delete progressMap.value[fileName];
    }

    // 清空历史
    function clearHistory() {
      history.value = [];
      progressMap.value = {};
    }

    // 设置当前视频
    function setCurrentVideo(videoInfo) {
      currentVideo.value = videoInfo;
      const saved = getProgress(videoInfo?.fileName);
      if (saved) {
        currentTime.value = saved.currentTime;
      }
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
      ],
    },
  },
);
