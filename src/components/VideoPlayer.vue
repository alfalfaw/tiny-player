<script setup>
import {
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  computed,
} from "vue";
import { usePlayerStore } from "@/stores/player";

const store = usePlayerStore();

const videoRef = ref(null);
const dragOver = ref(false);
const showControls = ref(true);
const showVolumeSlider = ref(false);
const showSpeedMenu = ref(false);
const isFullscreen = ref(false);
const progressDragging = ref(false);
const hoverProgress = ref(0);
const controlsTimer = ref(null);

const videoSrc = ref("");
const videoFileName = ref("");
const videoFileSize = ref(0);
const videoId = ref("");

// 标记相关状态
const showMarkInput = ref(false);
const markDraft = ref("");
const markDraftTime = ref(0);
const markInputRef = ref(null);

// 当前视频的标记（按时间升序）
const currentMarks = computed(() => store.getMarks(videoId.value));

const emit = defineEmits(["switch-video", "video-ended"]);

// 判断拖拽内容是否包含真实文件（区分文件拖入与页面内元素拖拽）
function dragHasFiles(e) {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

// 拖拽事件 - 播放器区域仅响应「文件」拖拽
function onDragOver(e) {
  e.preventDefault();
  if (dragHasFiles(e)) {
    dragOver.value = true;
  }
}

function onDragLeave(e) {
  e.preventDefault();
  dragOver.value = false;
}

function onDrop(e) {
  e.preventDefault();
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    // 拖到播放器 = 立即切换
    emit("switch-video", files[0]);
  }
}

// 阻止从控制栏内部发起原生拖拽（避免拖进度条时被浏览器当成元素拖拽）
function onControlsDragStart(e) {
  e.preventDefault();
}

// 通过文件选择器选择文件
function pickFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*";
  input.multiple = true;
  input.onchange = async (e) => {
    if (e.target.files.length > 0) {
      // 第一个文件立即播放，其余加入队列
      emit("switch-video", e.target.files[0]);
      if (e.target.files.length > 1) {
        const rest = Array.from(e.target.files).slice(1);
        await store.addToQueue(rest);
      }
    }
  };
  input.click();
}

// 加载视频（由 App.vue 调用）
function loadVideo(url, fileName, fileSize, id) {
  videoSrc.value = url;
  videoFileName.value = fileName;
  videoFileSize.value = fileSize;
  videoId.value = id || "";

  // 关闭上一个视频残留的标记输入
  showMarkInput.value = false;
  markDraft.value = "";

  store.setCurrentVideo({
    videoId: videoId.value,
    fileName,
    fileSize,
  });

  // 等待 DOM 更新后自动播放
  nextTick(() => {
    if (videoRef.value) {
      videoRef.value.play().catch(() => {});
    }
  });
}

// 视频事件
function onLoadedMetadata() {
  const video = videoRef.value;
  if (!video) return;
  store.duration = video.duration;
  const saved = store.getProgress(videoId.value);
  if (saved && saved.currentTime > 0 && saved.currentTime < video.duration) {
    video.currentTime = saved.currentTime;
  }
  // 恢复音量和速率
  video.volume = store.volume;
  video.playbackRate = store.playbackRate;
}

function onTimeUpdate() {
  const video = videoRef.value;
  if (!video || progressDragging.value) return;
  // 播放失败时 currentTime 会变为 0，不要覆盖已保存的进度
  if (video.currentTime === 0) return;
  store.currentTime = video.currentTime;
}

function onPlay() {
  store.isPlaying = true;
}

function onPause() {
  store.isPlaying = false;
  saveCurrentProgress();
}

function onEnded() {
  store.isPlaying = false;
  saveCurrentProgress();
  emit("video-ended");
}

function onVideoClick() {
  togglePlay();
}

// 播放控制
function togglePlay() {
  const video = videoRef.value;
  if (!video) return;
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

function seek(time) {
  const video = videoRef.value;
  if (!video) return;
  video.currentTime = time;
  store.currentTime = time;
}

// 进度条
const progressPercent = computed(() => {
  if (!store.duration) return 0;
  return (store.currentTime / store.duration) * 100;
});

// 根据指针位置换算目标时间并跳转
function seekFromPointer(e, bar) {
  const rect = bar.getBoundingClientRect();
  if (!rect.width) return;
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  seek(percent * store.duration);
}

function onProgressMouseMove(e) {
  const bar = e.currentTarget;
  const rect = bar.getBoundingClientRect();
  if (!rect.width) return;
  const percent = Math.max(
    0,
    Math.min(1, (e.clientX - rect.left) / rect.width),
  );
  hoverProgress.value = percent * store.duration;
}

// 使用 Pointer Events + 指针捕获：
// 指针捕获保证 pointerup/pointercancel 一定回到进度条上，即使指针移出元素或
// 被浏览器接管（如触发原生拖拽），也能可靠地结束拖拽状态，避免监听器泄漏。
function onProgressPointerDown(e) {
  if (e.button !== 0) return;
  const bar = e.currentTarget;
  e.preventDefault();

  progressDragging.value = true;
  try {
    bar.setPointerCapture(e.pointerId);
  } catch {
    // 部分环境不支持指针捕获，忽略即可
  }
  seekFromPointer(e, bar);

  const onPointerMove = (ev) => {
    if (!progressDragging.value) return;
    seekFromPointer(ev, bar);
  };

  const finish = (ev) => {
    if (!progressDragging.value) return;
    progressDragging.value = false;
    if (ev?.pointerId !== undefined) {
      try {
        bar.releasePointerCapture(ev.pointerId);
      } catch {
        // 忽略
      }
    }
    saveCurrentProgress();
    bar.removeEventListener("pointermove", onPointerMove);
    bar.removeEventListener("pointerup", finish);
    bar.removeEventListener("pointercancel", finish);
  };

  bar.addEventListener("pointermove", onPointerMove);
  bar.addEventListener("pointerup", finish);
  bar.addEventListener("pointercancel", finish);
}

// 音量
function onVolumeChange(e) {
  const video = videoRef.value;
  if (!video) return;
  store.volume = parseFloat(e.target.value);
  video.volume = store.volume;
}

function toggleMute() {
  const video = videoRef.value;
  if (!video) return;
  if (video.muted) {
    video.muted = false;
    store.volume = video.volume || 0.8;
  } else {
    video.muted = true;
  }
}

// 播放速率
const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

function setSpeed(rate) {
  const video = videoRef.value;
  if (!video) return;
  video.playbackRate = rate;
  store.playbackRate = rate;
  showSpeedMenu.value = false;
}

// 全屏
function toggleFullscreen() {
  const container = document.querySelector(".player-container");
  if (!container) return;
  if (!document.fullscreenElement) {
    container.requestFullscreen();
    isFullscreen.value = true;
  } else {
    document.exitFullscreen();
    isFullscreen.value = false;
  }
}

// 保存进度
function saveCurrentProgress() {
  if (videoId.value) {
    store.saveProgress(
      videoId.value,
      store.currentTime,
      store.duration,
      videoFileName.value,
    );
  }
}

// 控制栏自动隐藏
function showControlsTemporarily() {
  showControls.value = true;
  clearTimeout(controlsTimer.value);
  // 正在输入标记时不自动隐藏
  if (store.isPlaying && !showMarkInput.value) {
    controlsTimer.value = setTimeout(() => {
      showControls.value = false;
    }, 3000);
  }
}

function onMouseMove() {
  showControlsTemporarily();
}

// 键盘快捷键
function onKeyDown(e) {
  const video = videoRef.value;
  if (!video) return;
  // 正在输入（如标记内容）时不触发快捷键
  const target = e.target;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    if (e.key === "Escape") cancelMarkInput();
    return;
  }
  switch (e.key) {
    case " ":
    case "k":
      e.preventDefault();
      togglePlay();
      break;
    case "n":
      e.preventDefault();
      openMarkInput();
      break;
    case "ArrowLeft":
      e.preventDefault();
      seek(Math.max(0, video.currentTime - 5));
      break;
    case "ArrowRight":
      e.preventDefault();
      seek(Math.min(video.duration, video.currentTime + 5));
      break;
    case "ArrowUp":
      e.preventDefault();
      store.volume = Math.min(1, store.volume + 0.05);
      video.volume = store.volume;
      break;
    case "ArrowDown":
      e.preventDefault();
      store.volume = Math.max(0, store.volume - 0.05);
      video.volume = store.volume;
      break;
    case "f":
      toggleFullscreen();
      break;
    case "m":
      toggleMute();
      break;
  }
}

// 定时保存进度
let saveInterval = null;

onMounted(() => {
  document.addEventListener("keydown", onKeyDown);
  saveInterval = setInterval(() => {
    if (store.isPlaying) {
      saveCurrentProgress();
    }
  }, 5000);
  nextTick(() => {
    if (videoRef.value) {
      videoRef.value.volume = store.volume;
      videoRef.value.playbackRate = store.playbackRate;
    }
  });
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
  clearInterval(saveInterval);
  saveCurrentProgress();
});

// 点击外部关闭菜单
function onDocumentClick(e) {
  if (!e.target.closest(".speed-control")) {
    showSpeedMenu.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
});

function formatTime(seconds) {
  return store.formatTime(seconds);
}

// ---------- 标记 ----------

// 标记在时间轴上的水平位置（百分比）
function markPercent(mark) {
  if (!store.duration) return 0;
  return Math.min(100, Math.max(0, (mark.time / store.duration) * 100));
}

// 点击标记跳转到对应时间
function onMarkClick(mark) {
  seek(mark.time);
}

// 打开标记输入（默认记录当前播放时间）
function openMarkInput() {
  const video = videoRef.value;
  if (!video || !videoId.value) return;
  markDraftTime.value = video.currentTime;
  markDraft.value = "";
  showMarkInput.value = true;
  showControls.value = true;
  clearTimeout(controlsTimer.value);
  nextTick(() => markInputRef.value?.focus());
}

function cancelMarkInput() {
  showMarkInput.value = false;
  markDraft.value = "";
}

function submitMarkInput() {
  if (!videoId.value) return;
  const content = markDraft.value.trim();
  if (!content) return;
  store.addMark(videoId.value, markDraftTime.value, content);
  showMarkInput.value = false;
  markDraft.value = "";
}

// 供侧边栏标记列表跳转使用
function seekTo(time) {
  seek(time);
  const video = videoRef.value;
  if (video && video.paused) video.play().catch(() => {});
}

// 暴露方法给父组件
defineExpose({ loadVideo, seekTo });
</script>

<template>
  <div
    class="player-container"
    :class="{ 'has-video': videoSrc }"
    @mousemove="onMouseMove"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- 拖拽提示覆盖层（正在播放时拖入） -->
    <div v-if="dragOver && videoSrc" class="drag-overlay">
      <div class="drag-overlay-content">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <polyline points="16 16 12 12 8 16" />
          <line x1="12" y1="12" x2="12" y2="21" />
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
        </svg>
        <span>释放以切换视频</span>
      </div>
    </div>

    <!-- 空状态拖拽区域 -->
    <div
      v-if="!videoSrc"
      class="drop-zone"
      :class="{ 'drag-over': dragOver }"
      @click="pickFile"
    >
      <div class="drop-zone-content">
        <div class="drop-icon">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </div>
        <h2>拖拽视频文件到此处</h2>
        <p>或点击选择文件</p>
        <p class="hint">支持 MP4、WebM、OGG 等格式</p>
      </div>
    </div>

    <!-- 视频播放器 -->
    <div v-if="videoSrc" class="video-wrapper">
      <video
        ref="videoRef"
        :src="videoSrc"
        draggable="false"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @play="onPlay"
        @pause="onPause"
        @ended="onEnded"
        @click="onVideoClick"
        preload="metadata"
      ></video>

      <!-- 控制栏 -->
      <div
        class="controls"
        :class="{ visible: showControls || !store.isPlaying }"
        @dragstart="onControlsDragStart"
      >
        <!-- 进度条 -->
        <div
          class="progress-bar"
          draggable="false"
          @pointerdown="onProgressPointerDown"
          @mousemove="onProgressMouseMove"
          @dragstart="onControlsDragStart"
        >
          <div
            class="progress-played"
            :style="{ width: progressPercent + '%' }"
          ></div>
          <div
            class="progress-thumb"
            :style="{ left: progressPercent + '%' }"
          ></div>
          <!-- 标记点 -->
          <div
            v-for="mark in currentMarks"
            :key="mark.id"
            class="mark-marker"
            :style="{ left: markPercent(mark) + '%' }"
            @click.stop="onMarkClick(mark)"
            @mousedown.stop
          >
            <span class="mark-dot"></span>
            <div class="mark-tooltip">
              <span class="mark-tooltip-time">{{ formatTime(mark.time) }}</span>
              <span class="mark-tooltip-content">{{ mark.content }}</span>
            </div>
          </div>
          <div
            class="progress-tooltip"
            :style="{ left: progressPercent + '%' }"
          >
            {{ formatTime(hoverProgress) }}
          </div>
        </div>

        <!-- 标记输入 -->
        <div v-if="showMarkInput" class="mark-input-panel">
          <div class="mark-input-title">
            在 {{ formatTime(markDraftTime) }} 添加标记
          </div>
          <input
            ref="markInputRef"
            v-model="markDraft"
            class="mark-input"
            type="text"
            maxlength="200"
            placeholder="输入标记内容..."
            @keydown.enter.prevent="submitMarkInput"
            @keydown.esc="cancelMarkInput"
          />
          <div class="mark-input-actions">
            <button class="mark-btn-cancel" @click="cancelMarkInput">取消</button>
            <button class="mark-btn-save" @click="submitMarkInput">保存</button>
          </div>
        </div>

        <!-- 底部控制 -->
        <div class="controls-bottom">
          <div class="controls-left">
            <!-- 上一个 -->
            <button
              class="ctrl-btn"
              @click="$emit('play-previous')"
              :disabled="!store.hasPrevious"
              title="上一个"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="19 20 9 12 19 4 19 20" />
                <line
                  x1="5"
                  y1="4"
                  x2="5"
                  y2="20"
                  stroke="currentColor"
                  stroke-width="2"
                />
              </svg>
            </button>

            <!-- 播放/暂停 -->
            <button
              class="ctrl-btn play-btn"
              @click="togglePlay"
              :title="store.isPlaying ? '暂停' : '播放'"
            >
              <svg
                v-if="!store.isPlaying"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <svg
                v-else
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>

            <!-- 下一个 -->
            <button
              class="ctrl-btn"
              @click="$emit('play-next')"
              :disabled="!store.hasNext"
              title="下一个"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5 4 15 12 5 20 5 4" />
                <line
                  x1="19"
                  y1="4"
                  x2="19"
                  y2="20"
                  stroke="currentColor"
                  stroke-width="2"
                />
              </svg>
            </button>

            <!-- 时间 -->
            <span class="time-display">
              {{ formatTime(store.currentTime) }} /
              {{ formatTime(store.duration) }}
            </span>

            <!-- 添加标记 -->
            <button
              class="ctrl-btn mark-add-btn"
              :class="{ active: showMarkInput }"
              :disabled="!videoId"
              @click="openMarkInput"
              :title="`添加标记 (n)${currentMarks.length ? ` · 已有 ${currentMarks.length} 个` : ''}`"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              <span v-if="currentMarks.length" class="mark-count">{{
                currentMarks.length
              }}</span>
            </button>
          </div>

          <div class="controls-right">
            <!-- 音量 -->
            <div
              class="volume-control"
              @mouseenter="showVolumeSlider = true"
              @mouseleave="showVolumeSlider = false"
            >
              <button class="ctrl-btn" @click="toggleMute" title="静音">
                <svg
                  v-if="store.volume === 0"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
                <svg
                  v-else
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </button>
              <div
                class="volume-slider"
                :class="{ show: showVolumeSlider || true }"
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="store.volume"
                  @input="onVolumeChange"
                />
              </div>
            </div>

            <!-- 播放速率 -->
            <div class="speed-control">
              <button
                class="ctrl-btn speed-btn"
                @click.stop="showSpeedMenu = !showSpeedMenu"
                title="播放速率"
              >
                {{ store.playbackRate }}x
              </button>
              <div class="speed-menu" :class="{ show: showSpeedMenu }">
                <button
                  v-for="speed in speeds"
                  :key="speed"
                  :class="{ active: store.playbackRate === speed }"
                  @click="setSpeed(speed)"
                >
                  {{ speed }}x
                </button>
              </div>
            </div>

            <!-- 全屏 -->
            <button class="ctrl-btn" @click="toggleFullscreen" title="全屏">
              <svg
                v-if="!isFullscreen"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              <svg
                v-else
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 视频标题 -->
      <div
        class="video-title"
        :class="{ visible: showControls || !store.isPlaying }"
      >
        {{ videoFileName }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #0a0a0a;
  border-radius: 12px;
  overflow: hidden;
}

.player-container.has-video {
  border-radius: 0;
}

/* 拖拽覆盖层 */
.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(99, 102, 241, 0.15);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #a5b4fc;
  font-size: 16px;
  font-weight: 500;
}

/* 拖拽区域 */
.drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 500px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px dashed transparent;
  border-radius: 12px;
}

.drop-zone.drag-over {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.5);
}

.drop-zone-content {
  text-align: center;
  color: #888;
  transition: color 0.3s;
}

.drop-zone:hover .drop-zone-content {
  color: #bbb;
}

.drop-icon {
  margin-bottom: 20px;
  opacity: 0.6;
}

.drop-zone:hover .drop-icon {
  opacity: 1;
  color: #6366f1;
}

.drop-zone-content h2 {
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 8px;
  color: #ccc;
}

.drop-zone-content p {
  margin: 4px 0;
  font-size: 14px;
}

.drop-zone-content .hint {
  font-size: 12px;
  color: #555;
  margin-top: 12px;
}

/* 视频区域 */
.video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: pointer;
}

/* 控制栏 */
.controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  padding: 40px 16px 12px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.controls.visible {
  opacity: 1;
}

/* 进度条 */
.progress-bar {
  position: relative;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
  margin-bottom: 10px;
  transition: height 0.15s;
  /* 避免拖拽时选中文本或触发原生拖拽/滚动手势 */
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.progress-bar:hover {
  height: 6px;
}

.progress-played {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: #6366f1;
  border-radius: 2px;
  pointer-events: none;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background: #6366f1;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
  box-shadow: 0 0 4px rgba(99, 102, 241, 0.5);
}

.progress-bar:hover .progress-thumb {
  opacity: 1;
}

.progress-tooltip {
  position: absolute;
  bottom: 20px;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.progress-bar:hover .progress-tooltip {
  opacity: 1;
}

/* 底部控制 */
.controls-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-btn {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition:
    background 0.2s,
    opacity 0.2s;
  opacity: 0.9;
}

.ctrl-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  opacity: 1;
}

.ctrl-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.time-display {
  color: #ddd;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}

/* 音量控制 */
.volume-control {
  display: flex;
  align-items: center;
  position: relative;
}

.volume-slider {
  width: 0;
  overflow: hidden;
  transition: width 0.2s ease;
  display: flex;
  align-items: center;
}

.volume-slider.show {
  width: 80px;
  margin-left: 4px;
}

.volume-slider input[type="range"] {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  outline: none;
}

.volume-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
}

/* 速率控制 */
.speed-control {
  position: relative;
}

.speed-btn {
  font-size: 13px;
  font-weight: 500;
  min-width: 36px;
}

.speed-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  background: rgba(20, 20, 20, 0.95);
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 8px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  transition: all 0.2s ease;
  backdrop-filter: blur(10px);
}

.speed-menu.show {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.speed-menu button {
  display: block;
  width: 100%;
  padding: 6px 16px;
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
  transition: all 0.15s;
}

.speed-menu button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.speed-menu button.active {
  color: #6366f1;
  font-weight: 600;
}

/* 视频标题 */
.video-title {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 16px 20px;
  background: linear-gradient(rgba(0, 0, 0, 0.7), transparent);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  opacity: 0;
  transition: opacity 0.3s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-title.visible {
  opacity: 1;
}

/* 时间轴标记 */
.mark-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 3;
}

.mark-dot {
  width: 10px;
  height: 10px;
  background: #fbbf24;
  border: 2px solid rgba(0, 0, 0, 0.55);
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(251, 191, 36, 0.7);
  transition: transform 0.15s ease;
}

.mark-marker:hover .mark-dot {
  transform: scale(1.35);
  background: #fcd34d;
}

.mark-tooltip {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 240px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.92);
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.15s ease,
    visibility 0.15s ease;
  pointer-events: none;
  z-index: 30;
}

.mark-marker:hover .mark-tooltip {
  opacity: 1;
  visibility: visible;
}

.mark-tooltip-time {
  font-size: 11px;
  font-weight: 600;
  color: #fbbf24;
  font-variant-numeric: tabular-nums;
}

.mark-tooltip-content {
  font-size: 12px;
  color: #eee;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 添加标记按钮 */
.mark-add-btn {
  position: relative;
}

.mark-add-btn.active {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.mark-count {
  position: absolute;
  top: -2px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #fbbf24;
  color: #1a1a1a;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  border-radius: 7px;
}

/* 标记输入面板 */
.mark-input-panel {
  margin-bottom: 10px;
  padding: 10px 12px;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 8px;
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mark-input-title {
  font-size: 12px;
  color: #fbbf24;
  font-variant-numeric: tabular-nums;
}

.mark-input {
  width: 100%;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.mark-input:focus {
  border-color: #fbbf24;
}

.mark-input::placeholder {
  color: #666;
}

.mark-input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mark-input-actions button {
  padding: 5px 14px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.mark-btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
}

.mark-btn-cancel:hover {
  background: rgba(255, 255, 255, 0.14);
}

.mark-btn-save {
  background: #fbbf24;
  color: #1a1a1a;
  font-weight: 600;
}

.mark-btn-save:hover {
  background: #fcd34d;
}
</style>
