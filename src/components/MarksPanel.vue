<script setup>
import { computed, ref } from "vue";
import { usePlayerStore } from "@/stores/player";
import { downloadJson, parseMarksFile, timestampSuffix } from "@/utils/marksIO";

const store = usePlayerStore();

const emit = defineEmits(["seek"]);

const fileInputRef = ref(null);
const message = ref("");
const editingId = ref(null);
const editDraft = ref("");

// 当前播放视频的 videoId
const videoId = computed(() => store.currentVideo?.videoId || "");
const currentMarks = computed(() => store.getMarks(videoId.value));

// 本地全部标记数量（导出范围）
const totalMarkCount = computed(() =>
  Object.values(store.marks).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  ),
);

function jumpTo(mark) {
  emit("seek", mark.time);
}

function startEdit(mark) {
  editingId.value = mark.id;
  editDraft.value = mark.content;
}

function cancelEdit() {
  editingId.value = null;
  editDraft.value = "";
}

function saveEdit(mark) {
  const content = editDraft.value.trim();
  if (content) {
    store.updateMark(videoId.value, mark.id, { content });
  }
  cancelEdit();
}

function remove(mark) {
  store.removeMark(videoId.value, mark.id);
}

// 导出全部标记
function exportAll() {
  if (totalMarkCount.value === 0) {
    message.value = "暂无标记可导出";
    return;
  }
  const payload = store.buildMarksExport();
  downloadJson(payload, `tiny-player-marks-${timestampSuffix()}.json`);
  message.value = `已导出 ${totalMarkCount.value} 条标记`;
}

function triggerImport() {
  fileInputRef.value?.click();
}

async function onFileChange(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const videos = parseMarksFile(text);
    const incoming = videos.reduce((sum, v) => sum + v.marks.length, 0);
    if (incoming === 0) {
      message.value = "文件中没有可导入的标记";
      return;
    }
    const stats = store.applyImportedMarks(videos);
    message.value = `导入完成：新增 ${stats.added} 条，更新 ${stats.updated} 条`;
  } catch (err) {
    message.value = `导入失败：${err.message}`;
  }
}
</script>

<template>
  <div class="marks-panel">
    <!-- 全局导入导出 -->
    <div class="io-bar">
      <button class="io-btn" @click="exportAll">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        导出全部
      </button>
      <button class="io-btn" @click="triggerImport">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        导入
      </button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".json,application/json"
        class="hidden-input"
        @change="onFileChange"
      />
    </div>

    <div v-if="message" class="io-message">{{ message }}</div>

    <!-- 当前视频标记 -->
    <div v-if="!videoId" class="empty-state">
      <p>播放视频后可在此查看标记</p>
      <p class="sub">在播放器控制栏点击旗帜图标添加标记</p>
    </div>

    <template v-else>
      <div class="list-header">
        <span class="list-count">
          {{ currentMarks.length }} 条标记
          <template v-if="store.currentVideo?.fileName">
            · {{ store.currentVideo.fileName }}
          </template>
        </span>
        <button
          v-if="currentMarks.length"
          class="clear-btn"
          @click="store.clearMarks(videoId)"
        >
          清空
        </button>
      </div>

      <div v-if="!currentMarks.length" class="empty-state">
        <p>当前视频暂无标记</p>
        <p class="sub">播放时按 n 或点击旗帜图标添加</p>
      </div>

      <div v-else class="mark-list">
        <div v-for="mark in currentMarks" :key="mark.id" class="mark-item">
          <button
            class="mark-time"
            @click="jumpTo(mark)"
            title="跳转到该时间"
          >
            {{ store.formatTime(mark.time) }}
          </button>

          <div class="mark-body">
            <template v-if="editingId === mark.id">
              <input
                v-model="editDraft"
                class="mark-edit-input"
                type="text"
                maxlength="200"
                @keydown.enter.prevent="saveEdit(mark)"
                @keydown.esc="cancelEdit"
              />
            </template>
            <template v-else>
              <div class="mark-content">{{ mark.content }}</div>
            </template>
          </div>

          <div class="mark-actions">
            <template v-if="editingId === mark.id">
              <button class="icon-btn ok" @click="saveEdit(mark)" title="保存">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
              <button class="icon-btn" @click="cancelEdit" title="取消">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </template>
            <template v-else>
              <button class="icon-btn" @click="startEdit(mark)" title="编辑">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                </svg>
              </button>
              <button
                class="icon-btn danger"
                @click="remove(mark)"
                title="删除"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.marks-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.marks-panel::-webkit-scrollbar {
  width: 4px;
}

.marks-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.io-bar {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
}

.io-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #bbb;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s;
}

.io-btn:hover {
  background: rgba(251, 191, 36, 0.12);
  border-color: rgba(251, 191, 36, 0.35);
  color: #fbbf24;
}

.hidden-input {
  display: none;
}

.io-message {
  margin: 0 12px 8px;
  padding: 6px 10px;
  background: rgba(99, 102, 241, 0.12);
  border-radius: 6px;
  font-size: 11px;
  color: #a5b4fc;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 14px;
}

.list-count {
  font-size: 11px;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  flex-shrink: 0;
}

.clear-btn:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #444;
  gap: 6px;
  padding: 40px 20px;
  text-align: center;
}

.empty-state p {
  font-size: 13px;
  margin: 0;
}

.empty-state .sub {
  font-size: 11px;
  color: #333;
}

.mark-list {
  padding: 0 8px 8px;
}

.mark-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background 0.2s;
}

.mark-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mark-time {
  flex-shrink: 0;
  background: rgba(251, 191, 36, 0.15);
  border: none;
  color: #fbbf24;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 3px 7px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.mark-time:hover {
  background: rgba(251, 191, 36, 0.3);
}

.mark-body {
  flex: 1;
  min-width: 0;
}

.mark-content {
  font-size: 12px;
  color: #ccc;
  line-height: 1.4;
  word-break: break-word;
  white-space: pre-wrap;
}

.mark-edit-input {
  width: 100%;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(251, 191, 36, 0.5);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  outline: none;
}

.mark-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.mark-item:hover .mark-actions {
  opacity: 1;
}

.icon-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s;
}

.icon-btn:hover {
  color: #ccc;
  background: rgba(255, 255, 255, 0.08);
}

.icon-btn.ok:hover {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.12);
}

.icon-btn.danger:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
}
</style>
