<script setup>
import { ref } from "vue";
import { usePlayerStore } from "@/stores/player";
import { useLocaleStore } from "@/stores/locale";

const store = usePlayerStore();
const localeStore = useLocaleStore();

const activeTab = ref("queue");
const dragOverSidebar = ref(false);

const emit = defineEmits(["play-queue-item"]);

// 侧边栏拖拽 - 在最外层监听，用 relatedTarget 判断进出
function onSidebarDragEnter(e) {
  e.preventDefault();
  dragOverSidebar.value = true;
}

function onSidebarDragOver(e) {
  e.preventDefault();
}

function onSidebarDragLeave(e) {
  e.preventDefault();
  // 只有离开 sidebar-panel 本身时才关闭提示
  const related = e.relatedTarget;
  if (!related || !e.currentTarget.contains(related)) {
    dragOverSidebar.value = false;
  }
}

function onSidebarDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dragOverSidebar.value = false;
  const files = Array.from(e.dataTransfer.files).filter((f) =>
    f.type.startsWith("video/"),
  );
  if (files.length > 0) {
    store.addToQueue(files);
  }
}

// 从队列播放
function playQueueItem(item) {
  emit("play-queue-item", item);
}

// 从历史记录播放：优先从队列中查找
function isInQueue(fileName) {
  return store.queue.some((q) => q.fileName === fileName);
}

function playFromHistory(item) {
  const queueItem = store.queue.find((q) => q.fileName === item.fileName);
  if (queueItem) {
    emit("play-queue-item", queueItem);
  }
}

// 历史记录 - 已迁移到 localeStore.relativeTime()

function getProgressPercent(item) {
  if (!item.duration) return 0;
  return Math.min(100, (item.currentTime / item.duration) * 100);
}
</script>

<template>
  <div
    class="sidebar-panel"
    @dragenter="onSidebarDragEnter"
    @dragover="onSidebarDragOver"
    @dragleave="onSidebarDragLeave"
    @drop="onSidebarDrop"
  >
    <!-- 拖拽提示覆盖层 -->
    <div v-if="dragOverSidebar" class="drag-hint">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span>{{ localeStore.t('sidebar.dropToQueue') }}</span>
    </div>

    <!-- Tab 切换 -->
    <div class="tabs">
      <button
        :class="{ active: activeTab === 'queue' }"
        @click="activeTab = 'queue'"
      >
        {{ localeStore.t('sidebar.queue') }}
        <span v-if="store.queue.length" class="badge">{{
          store.queue.length
        }}</span>
      </button>
      <button
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        {{ localeStore.t('sidebar.history') }}
      </button>
    </div>

    <!-- 队列 Tab -->
    <div v-show="activeTab === 'queue'" class="tab-content">
      <div v-if="!store.queue.length" class="empty-state">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          opacity="0.3"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        <p>{{ localeStore.t('sidebar.queueEmpty') }}</p>
        <p class="sub">{{ localeStore.t('sidebar.queueEmptyHint') }}</p>
      </div>

      <div v-if="store.queue.length" class="queue-list">
        <div class="list-header">
          <span class="list-count">{{ localeStore.t('sidebar.videosCount', { count: store.queue.length }) }}</span>
          <button class="clear-btn" @click="store.clearQueue()">{{ localeStore.t('sidebar.clear') }}</button>
        </div>
        <div
          v-for="(item, index) in store.queue"
          :key="item.id"
          class="queue-item"
          :class="{ playing: item.id === store.currentQueueId }"
          @click="playQueueItem(item)"
        >
          <span class="item-index">{{ index + 1 }}</span>
          <div class="item-info">
            <div class="item-name" :title="item.fileName">
              {{ item.fileName }}
            </div>
            <div class="item-meta">
              <span v-if="item.fileSize">{{
                store.formatSize(item.fileSize)
              }}</span>
            </div>
          </div>
          <button
            class="remove-btn"
            @click.stop="store.removeFromQueue(item.id)"
            :title="localeStore.t('sidebar.remove')"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 历史 Tab -->
    <div v-show="activeTab === 'history'" class="tab-content">
      <div v-if="!store.history.length" class="empty-state">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          opacity="0.3"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <p>{{ localeStore.t('sidebar.historyEmpty') }}</p>
      </div>

      <div v-if="store.history.length" class="history-list">
        <div class="list-header">
          <span class="list-count">{{ localeStore.t('sidebar.recordsCount', { count: store.history.length }) }}</span>
          <button class="clear-btn" @click="store.clearHistory()">{{ localeStore.t('sidebar.clear') }}</button>
        </div>
        <div
          v-for="item in store.history"
          :key="item.fileName"
          class="history-item"
          :class="{ playable: isInQueue(item.fileName) }"
          @click="playFromHistory(item)"
        >
          <div class="item-info">
            <div class="item-name" :title="item.fileName">
              {{ item.fileName }}
              <span v-if="!isInQueue(item.fileName)" class="not-available"
                >{{ localeStore.t('sidebar.reDropRequired') }}</span
              >
            </div>
            <div class="item-meta">
              <span v-if="item.fileSize">{{
                store.formatSize(item.fileSize)
              }}</span>
              <span>{{ localeStore.relativeTime(item.lastPlayTime) }}</span>
            </div>
          </div>
          <div class="item-progress">
            <div class="progress-bar-mini">
              <div
                class="progress-fill"
                :style="{ width: getProgressPercent(item) + '%' }"
              ></div>
            </div>
            <span class="progress-text">
              {{ store.formatTime(item.currentTime) }} /
              {{ store.formatTime(item.duration) }}
            </span>
          </div>
          <button
            class="remove-btn"
            @click.stop="store.removeHistory(item.fileName)"
            :title="localeStore.t('sidebar.delete')"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #111;
  overflow: hidden;
  position: relative;
}

/* 拖拽提示覆盖层 */
.drag-hint {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(99, 102, 241, 0.12);
  border: 2px dashed rgba(99, 102, 241, 0.5);
  border-radius: 8px;
  margin: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #a5b4fc;
  font-size: 14px;
  font-weight: 500;
  pointer-events: none;
}

/* Tabs */
.tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.tabs button {
  flex: 1;
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 12px 0;
  font-size: 13px;
  font-weight: 500;
  position: relative;
  transition: color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.tabs button:hover {
  color: #aaa;
}

.tabs button.active {
  color: #eee;
}

.tabs button.active::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  background: #6366f1;
  border-radius: 1px;
}

.badge {
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

/* Tab content */
.tab-content {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.tab-content::-webkit-scrollbar {
  width: 4px;
}

.tab-content::-webkit-scrollbar-track {
  background: transparent;
}

.tab-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #444;
  gap: 6px;
  padding: 40px 20px;
}

.empty-state p {
  font-size: 13px;
  margin: 0;
}

.empty-state .sub {
  font-size: 11px;
  color: #333;
}

/* 列表头部 */
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 6px;
}

.list-count {
  font-size: 11px;
  color: #555;
}

.clear-btn {
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
}

.clear-btn:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

/* 队列列表 */
.queue-list {
  padding: 0 8px 8px;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.queue-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.queue-item.playing {
  background: rgba(99, 102, 241, 0.1);
}

.queue-item.playing .item-index {
  color: #6366f1;
  font-weight: 600;
}

.queue-item.playing .item-name {
  color: #a5b4fc;
}

.item-index {
  font-size: 12px;
  color: #555;
  min-width: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 历史列表 */
.history-list {
  padding: 0 8px 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background 0.2s;
  cursor: default;
}

.history-item.playable {
  cursor: pointer;
}

.history-item.playable:hover {
  background: rgba(255, 255, 255, 0.05);
}

.not-available {
  font-size: 10px;
  color: #555;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 6px;
  vertical-align: middle;
}

/* 通用 */
.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.item-meta {
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: #555;
}

.item-progress {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 80px;
}

.progress-bar-mini {
  width: 50px;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #6366f1;
  border-radius: 1px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 9px;
  color: #444;
  font-variant-numeric: tabular-nums;
}

.remove-btn {
  background: none;
  border: none;
  color: #333;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
  flex-shrink: 0;
}

.queue-item:hover .remove-btn,
.history-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}
</style>
