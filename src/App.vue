<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";
import VideoPlayer from "@/components/VideoPlayer.vue";
import PlayHistory from "@/components/PlayHistory.vue";
import { usePlayerStore } from "@/stores/player";
import { useLocaleStore } from "@/stores/locale";

const store = usePlayerStore();
const localeStore = useLocaleStore();
localeStore.init();
const playerRef = ref(null);
const showSidebar = ref(true);

// 全局阻止浏览器默认的拖放打开文件行为
function preventDragDefault(e) {
  e.preventDefault();
}
onMounted(() => {
  document.addEventListener("dragover", preventDragDefault);
  document.addEventListener("drop", preventDragDefault);
});
onBeforeUnmount(() => {
  document.removeEventListener("dragover", preventDragDefault);
  document.removeEventListener("drop", preventDragDefault);
});

// 拖到播放器 → 立即切换视频
function onSwitchVideo(file) {
  if (!file.type.startsWith("video/")) return;
  const items = store.addToQueue([file]);
  if (items.length > 0) {
    playQueueItem(items[0]);
  } else {
    // 文件已在队列中，找到它并播放
    const existing = store.queue.find((q) => q.fileName === file.name);
    if (existing) playQueueItem(existing);
  }
}

// 从队列点击播放
function playQueueItem(item) {
  store.setCurrentQueueItem(item.id);
  console.log(item.id);
  nextTick(() => {
    playerRef.value?.loadVideo(item.url, item.fileName, item.fileSize);
  });
}

// 视频播放结束 → 自动播放下一个
function onVideoEnded() {
  const next = store.getNext();
  if (next) {
    playQueueItem(next);
  }
}

// 播放上一个
function playPrevious() {
  const prev = store.getPrevious();
  if (prev) {
    playQueueItem(prev);
  }
}

// 播放下一个
function playNext() {
  const next = store.getNext();
  if (next) {
    playQueueItem(next);
  }
}
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-left">
        <div class="logo">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Tiny Player</span>
        </div>
      </div>
      <div class="header-right">
        <button
          class="lang-btn"
          @click="localeStore.setLocale(localeStore.locale === 'zh' ? 'en' : 'zh')"
          :title="localeStore.locale === 'zh' ? 'Switch to English' : '切换到中文'"
        >
          {{ localeStore.locale === 'zh' ? 'EN' : '中文' }}
        </button>
        <button
          class="toggle-sidebar"
          @click="showSidebar = !showSidebar"
          :title="showSidebar ? localeStore.t('sidebar.hide') : localeStore.t('sidebar.show')"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
      </div>
    </header>

    <main class="app-main">
      <div class="player-area">
        <VideoPlayer
          ref="playerRef"
          @switch-video="onSwitchVideo"
          @video-ended="onVideoEnded"
          @play-previous="playPrevious"
          @play-next="playNext"
        />
      </div>
      <transition name="slide">
        <aside v-if="showSidebar" class="sidebar">
          <PlayHistory @play-queue-item="playQueueItem" />
        </aside>
      </transition>
    </main>
  </div>
</template>

<style>
/* 全局样式 */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #0d0d0d;
  --surface: #111;
  --border: rgba(255, 255, 255, 0.06);
  --accent: #6366f1;
  --text: #eee;
  --text-dim: #888;
}

html,
body {
  height: 100%;
  overflow: hidden;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

#app {
  height: 100%;
}
</style>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 48px;
  background: rgba(17, 17, 17, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.3px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-sidebar {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toggle-sidebar:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
}

.lang-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #777;
  cursor: pointer;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
  transition: all 0.2s;
}

.lang-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
}

.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.player-area {
  flex: 1;
  min-width: 0;
}

.sidebar {
  width: 280px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
}

/* 侧边栏动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  width: 0;
  opacity: 0;
}
</style>
