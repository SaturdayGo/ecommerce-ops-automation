import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { chromium, type Browser, type Page } from 'playwright';

import {
  bootstrapVideoCategoryFromRecent,
  fillVideo,
  resolveLocalVideoUploadSpec,
} from '../src/modules';
import type { ProductData } from '../src/types';

function makeProductData(): ProductData {
  return {
    category: '',
    title: '',
    image_dir: '',
    carousel: [],
    white_bg_image: '',
    marketing_image: '',
    video_file: '',
    attributes: {
      brand: '',
      origin: '',
      product_type: '',
      hazardous_chemical: '',
      material: '',
      voltage: '',
      special_features: [],
      accessory_position: '',
      fitment: { car_make: '', car_model: '', year: '' },
      custom_attributes: {},
    },
    customs: { hs_code: '' },
    pricing_settings: { min_unit: '', sell_by: '' },
    taobao_price_cny: 0,
    price_formula: { multiplier: 0, shipping_buffer_cny: 0 },
    skus: [],
    weight_kg: 0,
    package_dimensions: { length_cm: 0, width_cm: 0, height_cm: 0 },
    wholesale: { min_quantity: 0, discount_percent: 0 },
    buyers_note_template: '',
    buyers_note_extra: '',
    detail_images: [],
    app_description: '',
    shipping: {
      total_weight_kg: 0,
      total_dimensions: { length_cm: 0, width_cm: 0, height_cm: 0 },
      shipping_template: '',
    },
    other_settings: {
      stock_deduction: '',
      eu_responsible_person: false,
      manufacturer_linked: false,
    },
    notes: '',
    gemini_raw_data: '',
  };
}

const html = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <h2>基本信息</h2>
      <div class="product-video-panel">
        <div>商品视频</div>
        <button id="open-video-modal" type="button">上传视频</button>
      </div>
    </section>

    <div id="video-modal" style="display:none; width: 1200px; min-height: 700px; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane">
        <div id="upload-zone">点击此处或者将文件拖至此处</div>
        <input id="video-file-input" type="file" accept="video/*" style="display:none;" />
        <div id="video-preview" style="display:none;">
          <span id="video-filename"></span>
        </div>
        <label>视频名称：<input id="video-name" /></label>
      </div>
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const uploadZone = document.getElementById('upload-zone');
      const fileInput = document.getElementById('video-file-input');
      const preview = document.getElementById('video-preview');
      const filename = document.getElementById('video-filename');
      const nameInput = document.getElementById('video-name');
      const confirmBtn = document.getElementById('confirm-video');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });

      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
      });

      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
      });

      uploadZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        preview.style.display = 'block';
        filename.textContent = file.name;
        nameInput.value = file.name.replace(/\.[^.]+$/, '');
        confirmBtn.disabled = false;
        document.body.dataset.videoUploaded = file.name;
      });

      confirmBtn.addEventListener('click', () => {
        document.body.dataset.videoConfirmed = nameInput.value;
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlDivTrigger = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <h2>基本信息</h2>
      <div class="product-video-panel">
        <div>商品视频</div>
        <div id="video-upload-card" style="width:96px;height:96px;border:1px dashed #999;cursor:pointer;">
          <div>+</div>
          <div>上传视频</div>
        </div>
      </div>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <div id="tab-local">本地上传</div>
      <div id="tab-library">媒体中心</div>
      <div id="local-pane">
        <div id="upload-zone">点击此处或者将文件拖至此处</div>
        <input id="video-file-input" type="file" accept="video/*" style="display:none;" />
        <div id="video-preview" style="display:none;">
          <span id="video-filename"></span>
        </div>
        <label>视频名称：<input id="video-name" /></label>
      </div>
      <div id="confirm-video" role="button" aria-disabled="true">确定</div>
    </div>

    <script>
      const openBtn = document.getElementById('video-upload-card');
      const modal = document.getElementById('video-modal');
      const uploadZone = document.getElementById('upload-zone');
      const fileInput = document.getElementById('video-file-input');
      const preview = document.getElementById('video-preview');
      const filename = document.getElementById('video-filename');
      const nameInput = document.getElementById('video-name');
      const confirmBtn = document.getElementById('confirm-video');

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });

      uploadZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        preview.style.display = 'block';
        filename.textContent = file.name;
        nameInput.value = file.name.replace(/\\.[^.]+$/, '');
        confirmBtn.dataset.enabled = 'true';
        confirmBtn.setAttribute('aria-disabled', 'false');
        document.body.dataset.videoUploaded = file.name;
      });

      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.dataset.enabled !== 'true') return;
        document.body.dataset.videoConfirmed = nameInput.value;
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlVideoBootstrap = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <h2>基本信息</h2>
      <div class="category-area">
        <input id="category-input" placeholder="可输入商品名称关键词、平台已有商品ID或商品链接搜索类目" value="" />
        <button id="recent-btn" type="button">最近使用</button>
        <div class="category-history-lists" style="display:none;">
          <div id="headlight-option">汽车及零配件 / 车灯 / 头灯总成</div>
          <div id="taillight-option">汽车及零配件 / 车灯 / 信号灯总成 / 尾灯总成</div>
        </div>
      </div>

      <div class="product-video-panel" style="display:none;">
        <div>商品视频</div>
        <button id="open-video-modal" type="button">上传视频</button>
      </div>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane">
        <div id="upload-zone">点击此处或者将文件拖至此处</div>
        <input id="video-file-input" type="file" accept="video/*" style="display:none;" />
        <div id="video-preview" style="display:none;">
          <span id="video-filename"></span>
        </div>
        <label>视频名称：<input id="video-name" /></label>
      </div>
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const recentBtn = document.getElementById('recent-btn');
      const history = document.querySelector('.category-history-lists');
      const categoryInput = document.getElementById('category-input');
      const headlightOption = document.getElementById('headlight-option');
      const videoPanel = document.querySelector('.product-video-panel');
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const uploadZone = document.getElementById('upload-zone');
      const fileInput = document.getElementById('video-file-input');
      const preview = document.getElementById('video-preview');
      const filename = document.getElementById('video-filename');
      const nameInput = document.getElementById('video-name');
      const confirmBtn = document.getElementById('confirm-video');

      recentBtn.addEventListener('click', () => {
        history.style.display = 'block';
        document.body.dataset.recentOpened = 'true';
      });

      headlightOption.addEventListener('click', () => {
        categoryInput.value = '头灯总成';
        videoPanel.style.display = 'block';
        document.body.dataset.videoPanelVisible = 'true';
      });

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });

      uploadZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        preview.style.display = 'block';
        filename.textContent = file.name;
        nameInput.value = file.name.replace(/\\.[^.]+$/, '');
        confirmBtn.disabled = false;
        document.body.dataset.videoUploaded = file.name;
      });

      confirmBtn.addEventListener('click', () => {
        document.body.dataset.videoConfirmed = nameInput.value;
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlMediaCenter = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <h2>基本信息</h2>
      <div class="product-video-panel">
        <div>商品视频</div>
        <button id="open-video-modal" type="button">上传视频</button>
      </div>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">
        <div id="upload-zone">点击此处或者将文件拖至此处</div>
        <input id="video-file-input" type="file" accept="video/*" style="display:none;" />
      </div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="video-card" data-name="奔驰w221改装大灯总成.mp4">
          <input class="video-card-check" type="checkbox" />
          <div>奔驰w221改装大灯总成.mp4</div>
        </div>
        <div class="video-card" data-name="21-24款海拉克斯HILUX REV.mp4">
          <input class="video-card-check" type="checkbox" />
          <div>21-24款海拉克斯HILUX REV.mp4</div>
        </div>
      </div>
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const confirmBtn = document.getElementById('confirm-video');

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });

      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });

      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });

      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });

      document.querySelectorAll('.video-card').forEach((card) => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.video-card-check').forEach((checkbox) => {
            checkbox.checked = false;
          });
          card.querySelector('.video-card-check').checked = true;
          document.body.dataset.videoSelected = card.dataset.name;
          confirmBtn.disabled = false;
        });
      });

      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlMediaCenterNoMatch = htmlMediaCenter.replace(/奔驰w221改装大灯总成\.mp4/g, '别的文件.mp4');

const htmlMediaCenterEmpty = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div>商品视频</div>
      <button id="open-video-modal" type="button">上传视频</button>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div class="empty-state">暂无视频，请在媒体中心上传视频</div>
      </div>
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
    </script>
  </body>
</html>
`;

const htmlMediaCenterSearchTruncated = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div>商品视频</div>
      <button id="open-video-modal" type="button">上传视频</button>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="toolbar">
          <input id="folder-search" placeholder="在此文件夹下搜索" />
          <button id="folder-search-btn" type="button">搜索</button>
        </div>
        <div id="selected-count">已选择: 0</div>
        <div id="cards">
          <div class="video-card" data-full-name="奔驰w221改装大灯总成.mp4">
            <input class="video-card-check" type="checkbox" />
            <div class="video-title">奔驰w221改装大...</div>
          </div>
          <div class="video-card" data-full-name="21-24款海拉克斯HILUX REV.mp4">
            <input class="video-card-check" type="checkbox" />
            <div class="video-title">21-24款海拉克斯...</div>
          </div>
        </div>
      </div>
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const searchInput = document.getElementById('folder-search');
      const searchBtn = document.getElementById('folder-search-btn');
      const selectedCount = document.getElementById('selected-count');
      const confirmBtn = document.getElementById('confirm-video');

      function renderCards() {
        const query = (searchInput.value || '').trim();
        document.querySelectorAll('.video-card').forEach((card) => {
          const fullName = card.dataset.fullName || '';
          const visible = !query || fullName.includes(query);
          card.style.display = visible ? 'inline-block' : 'none';
        });
        document.body.dataset.videoSearchQuery = query;
      }

      function selectCard(card) {
        document.querySelectorAll('.video-card-check').forEach((checkbox) => {
          checkbox.checked = false;
        });
        document.querySelectorAll('.video-card').forEach((item) => {
          item.dataset.selected = 'false';
        });
        card.dataset.selected = 'true';
        card.querySelector('.video-card-check').checked = true;
        document.body.dataset.videoSelected = card.dataset.fullName || '';
        selectedCount.textContent = '已选择: 1';
        confirmBtn.disabled = false;
      }

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });
      searchBtn.addEventListener('click', renderCards);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderCards();
      });
      document.querySelectorAll('.video-card').forEach((card) => {
        card.addEventListener('click', () => selectCard(card));
      });
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlMediaCenterSearchTileOnly = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div>商品视频</div>
      <button id="open-video-modal" type="button">上传视频</button>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="toolbar">
          <input id="folder-search" placeholder="在此文件夹下搜索" />
          <button id="folder-search-btn" type="button">搜索</button>
        </div>
        <div id="selected-count">已选择: 0</div>
        <div id="cards">
          <div class="video-card" data-full-name="奔驰w221改装大灯总成.mp4" style="display:inline-block;width:180px;height:280px;cursor:pointer;">
            <div class="thumb" style="width:160px;height:200px;background:#ddd;"></div>
            <div class="video-title">奔驰w221改装大灯总成</div>
            <div class="video-duration">00:37</div>
          </div>
          <div class="video-card" data-full-name="21-24款海拉克斯HILUX REV.mp4" style="display:inline-block;width:180px;height:280px;cursor:pointer;">
            <div class="thumb" style="width:160px;height:200px;background:#ddd;"></div>
            <div class="video-title">21-24款海拉克斯HILUX REV</div>
            <div class="video-duration">00:28</div>
          </div>
        </div>
      </div>
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const searchInput = document.getElementById('folder-search');
      const searchBtn = document.getElementById('folder-search-btn');
      const selectedCount = document.getElementById('selected-count');
      const confirmBtn = document.getElementById('confirm-video');

      function renderCards() {
        const query = (searchInput.value || '').trim();
        document.querySelectorAll('.video-card').forEach((card) => {
          const fullName = card.dataset.fullName || '';
          const visible = !query || fullName.includes(query);
          card.style.display = visible ? 'inline-block' : 'none';
        });
        document.body.dataset.videoSearchQuery = query;
      }

      function selectCard(card) {
        document.querySelectorAll('.video-card').forEach((item) => {
          item.dataset.selected = 'false';
        });
        card.dataset.selected = 'true';
        document.body.dataset.videoSelected = card.dataset.fullName || '';
        selectedCount.textContent = '已选择: 1';
        confirmBtn.disabled = false;
      }

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });
      searchBtn.addEventListener('click', renderCards);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderCards();
      });
      document.querySelectorAll('.video-card').forEach((card) => {
        card.addEventListener('click', () => selectCard(card));
      });
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlMediaCenterSearchPreviewAreaOnly = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div>商品视频</div>
      <button id="open-video-modal" type="button">上传视频</button>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="toolbar">
          <input id="folder-search" placeholder="在此文件夹下搜索" />
          <button id="folder-search-btn" type="button">搜索</button>
        </div>
        <div id="selected-count">已选择: 0</div>
        <div id="cards">
          <div class="video-card" data-full-name="奔驰w221改装大灯总成.mp4" style="display:inline-block;width:220px;height:320px;">
            <div class="preview-area" style="width:180px;height:220px;background:#ddd;cursor:pointer;"></div>
            <div class="video-title">奔驰w221改装大灯总成</div>
            <div class="video-duration">00:37</div>
          </div>
          <div class="video-card" data-full-name="21-24款海拉克斯HILUX REV.mp4" style="display:inline-block;width:220px;height:320px;">
            <div class="preview-area" style="width:180px;height:220px;background:#ddd;cursor:pointer;"></div>
            <div class="video-title">21-24款海拉克斯HILUX REV</div>
            <div class="video-duration">00:28</div>
          </div>
        </div>
      </div>
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const searchInput = document.getElementById('folder-search');
      const searchBtn = document.getElementById('folder-search-btn');
      const selectedCount = document.getElementById('selected-count');
      const confirmBtn = document.getElementById('confirm-video');

      function renderCards() {
        const query = (searchInput.value || '').trim();
        document.querySelectorAll('.video-card').forEach((card) => {
          const fullName = card.dataset.fullName || '';
          const visible = !query || fullName.includes(query);
          card.style.display = visible ? 'inline-block' : 'none';
        });
        document.body.dataset.videoSearchQuery = query;
      }

      function selectCard(card) {
        document.querySelectorAll('.video-card').forEach((item) => {
          item.dataset.selected = 'false';
        });
        card.dataset.selected = 'true';
        document.body.dataset.videoSelected = card.dataset.fullName || '';
        selectedCount.textContent = '已选择: 1';
        confirmBtn.disabled = false;
      }

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });
      searchBtn.addEventListener('click', renderCards);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderCards();
      });
      document.querySelectorAll('.video-card .preview-area').forEach((preview) => {
        preview.addEventListener('click', () => selectCard(preview.parentElement));
      });
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlMediaCenterSearchCheckboxHotspotOnly = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div>商品视频</div>
      <button id="open-video-modal" type="button">上传视频</button>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="toolbar">
          <input id="folder-search" placeholder="在此文件夹下搜索" />
          <button id="folder-search-btn" type="button">搜索</button>
        </div>
        <div id="selected-count">已选择: 0</div>
        <div id="cards" style="display:flex;gap:16px;flex-wrap:wrap;">
          <div class="video-card" data-full-name="奔驰w221改装大灯总成.mp4" style="display:inline-block;width:220px;height:320px;position:relative;">
            <div class="preview-area" style="width:180px;height:220px;background:#111;margin:12px auto 0;position:relative;"></div>
            <div class="select-hotspot" style="position:absolute;left:20px;top:20px;width:28px;height:28px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer;"></div>
            <div class="play-button" style="position:absolute;left:96px;top:120px;width:36px;height:36px;border-radius:50%;background:#eee;"></div>
            <div class="copy-link" style="position:absolute;left:20px;top:210px;width:180px;height:44px;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;">复制链接</div>
            <div class="video-title">奔驰w221改装大...</div>
            <div class="video-duration">00:37</div>
          </div>
          <div class="video-card" data-full-name="21-24款海拉克斯HILUX REV.mp4" style="display:inline-block;width:220px;height:320px;position:relative;">
            <div class="preview-area" style="width:180px;height:220px;background:#111;margin:12px auto 0;position:relative;"></div>
            <div class="select-hotspot" style="position:absolute;left:20px;top:20px;width:28px;height:28px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer;"></div>
            <div class="play-button" style="position:absolute;left:96px;top:120px;width:36px;height:36px;border-radius:50%;background:#eee;"></div>
            <div class="copy-link" style="position:absolute;left:20px;top:210px;width:180px;height:44px;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;">复制链接</div>
            <div class="video-title">21-24款海拉克斯...</div>
            <div class="video-duration">00:28</div>
          </div>
        </div>
      </div>
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const searchInput = document.getElementById('folder-search');
      const searchBtn = document.getElementById('folder-search-btn');
      const selectedCount = document.getElementById('selected-count');
      const confirmBtn = document.getElementById('confirm-video');

      function renderCards() {
        const query = (searchInput.value || '').trim();
        document.querySelectorAll('.video-card').forEach((card) => {
          const fullName = card.dataset.fullName || '';
          const visible = !query || fullName.includes(query);
          card.style.display = visible ? 'inline-block' : 'none';
        });
        document.body.dataset.videoSearchQuery = query;
      }

      function selectCard(card) {
        document.querySelectorAll('.video-card').forEach((item) => {
          item.dataset.selected = 'false';
        });
        card.dataset.selected = 'true';
        document.body.dataset.videoSelected = card.dataset.fullName || '';
        selectedCount.textContent = '已选择: 1';
        confirmBtn.disabled = false;
      }

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });
      searchBtn.addEventListener('click', renderCards);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderCards();
      });
      document.querySelectorAll('.video-card').forEach((card) => {
        const hotspot = card.querySelector('.select-hotspot');
        hotspot?.addEventListener('click', (event) => {
          event.stopPropagation();
          selectCard(card);
        });
      });
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;


const htmlMediaCenterDelayedConfirm = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div>商品视频</div>
      <button id="open-video-modal" type="button">上传视频</button>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="toolbar">
          <input id="folder-search" placeholder="在此文件夹下搜索" />
          <button id="folder-search-btn" type="button">搜索</button>
        </div>
        <div id="selected-count">已选择: 0</div>
        <div id="cards">
          <div class="video-card" data-full-name="奔驰w221改装大灯总成.mp4">
            <input class="video-card-check" type="checkbox" />
            <div class="video-title">奔驰w221改装大...</div>
          </div>
        </div>
      </div>
    </div>

    <div id="footer" style="display:none;">
      <div id="confirm-video" role="button" aria-disabled="true">确定</div>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const searchInput = document.getElementById('folder-search');
      const searchBtn = document.getElementById('folder-search-btn');
      const selectedCount = document.getElementById('selected-count');
      const confirmBtn = document.getElementById('confirm-video');
      const footer = document.getElementById('footer');

      function renderCards() {
        const query = (searchInput.value || '').trim();
        document.querySelectorAll('.video-card').forEach((card) => {
          const fullName = card.dataset.fullName || '';
          const visible = !query || fullName.includes(query);
          card.style.display = visible ? 'inline-block' : 'none';
        });
        document.body.dataset.videoSearchQuery = query;
      }

      function selectCard(card) {
        document.querySelectorAll('.video-card-check').forEach((checkbox) => {
          checkbox.checked = false;
        });
        card.querySelector('.video-card-check').checked = true;
        document.body.dataset.videoSelected = card.dataset.fullName || '';
        selectedCount.textContent = '已选择: 1';
        setTimeout(() => {
          footer.style.display = 'block';
          confirmBtn.dataset.enabled = 'true';
          confirmBtn.setAttribute('aria-disabled', 'false');
        }, 600);
      }

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });
      searchBtn.addEventListener('click', renderCards);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderCards();
      });
      document.querySelectorAll('.video-card').forEach((card) => {
        card.addEventListener('click', () => selectCard(card));
      });
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.dataset.enabled !== 'true') return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
        footer.style.display = 'none';
      });
    </script>
  </body>
</html>
`;


const htmlMediaCenterConfirmByGeometryOnly = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div>商品视频</div>
      <button id="open-video-modal" type="button">上传视频</button>
    </section>

    <div id="video-modal" style="display:none; width: 640px; height: 420px; border: 1px solid #ccc; padding: 12px; position: relative;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="toolbar">
          <input id="folder-search" placeholder="在此文件夹下搜索" />
          <button id="folder-search-btn" type="button">搜索</button>
        </div>
        <div id="selected-count">已选择: 0</div>
        <div id="cards">
          <div class="video-card" data-full-name="奔驰w221改装大灯总成.mp4" style="width: 120px; height: 180px; background: #eee;">
            <input class="video-card-check" type="checkbox" />
            <div class="video-title">奔驰w221改装大...</div>
          </div>
        </div>
      </div>
    </div>

    <div id="ghost-confirm" style="position:absolute; left:900px; top:620px; width:88px; height:40px; background:#3b82f6; border-radius:8px;"></div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const searchInput = document.getElementById('folder-search');
      const searchBtn = document.getElementById('folder-search-btn');
      const selectedCount = document.getElementById('selected-count');
      const ghostConfirm = document.getElementById('ghost-confirm');

      function renderCards() {
        const query = (searchInput.value || '').trim();
        document.querySelectorAll('.video-card').forEach((card) => {
          const fullName = card.dataset.fullName || '';
          const visible = !query || fullName.includes(query);
          card.style.display = visible ? 'inline-block' : 'none';
        });
        document.body.dataset.videoSearchQuery = query;
      }

      function selectCard(card) {
        document.querySelectorAll('.video-card-check').forEach((checkbox) => {
          checkbox.checked = false;
        });
        card.querySelector('.video-card-check').checked = true;
        document.body.dataset.videoSelected = card.dataset.fullName || '';
        selectedCount.textContent = '已选择: 1';
      }

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });
      searchBtn.addEventListener('click', renderCards);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderCards();
      });
      document.querySelectorAll('.video-card').forEach((card) => {
        card.addEventListener('click', () => selectCard(card));
      });
      ghostConfirm.addEventListener('click', () => {
        if (document.body.dataset.videoSelected !== '奔驰w221改装大灯总成.mp4') return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlMediaCenterConfirmOutsideModal = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div>商品视频</div>
      <button id="open-video-modal" type="button">上传视频</button>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="toolbar">
          <input id="folder-search" placeholder="在此文件夹下搜索" />
          <button id="folder-search-btn" type="button">搜索</button>
        </div>
        <div id="selected-count">已选择: 0</div>
        <div class="video-card" data-full-name="奔驰w221改装大灯总成.mp4" style="display:inline-block;width:220px;height:320px;position:relative;">
          <div class="preview-area" style="width:180px;height:220px;background:#111;margin:12px auto 0;position:relative;"></div>
          <div class="select-hotspot" style="position:absolute;left:20px;top:20px;width:28px;height:28px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer;"></div>
          <div class="video-title">奔驰w221改装大灯总成</div>
          <div class="video-duration">00:37</div>
        </div>
      </div>
    </div>

    <div id="modal-footer" style="display:none;">
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const footer = document.getElementById('modal-footer');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const searchInput = document.getElementById('folder-search');
      const searchBtn = document.getElementById('folder-search-btn');
      const selectedCount = document.getElementById('selected-count');
      const confirmBtn = document.getElementById('confirm-video');

      function renderCards() {
        const query = (searchInput.value || '').trim();
        document.body.dataset.videoSearchQuery = query;
      }

      function selectCard(card) {
        document.body.dataset.videoSelected = card.dataset.fullName || '';
        selectedCount.textContent = '已选择: 1';
        confirmBtn.disabled = false;
      }

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        footer.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });
      searchBtn.addEventListener('click', renderCards);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderCards();
      });
      document.querySelector('.select-hotspot')?.addEventListener('click', (event) => {
        event.stopPropagation();
        selectCard(document.querySelector('.video-card'));
      });
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
        footer.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

const htmlMediaCenterFalsePositiveClose = `
<!doctype html>
<html>
  <body>
    <section id="base-info">
      <div class="product-video-panel">
        <div>商品视频</div>
        <div id="video-empty-state">上传视频</div>
        <div id="video-bound-state" style="display:none;">已绑定视频</div>
        <button id="open-video-modal" type="button">上传视频</button>
      </div>
    </section>

    <div id="video-modal" style="display:none; border: 1px solid #ccc; padding: 12px;">
      <h3>选择视频</h3>
      <button id="tab-local" type="button">本地上传</button>
      <button id="tab-library" type="button">媒体中心</button>
      <div id="local-pane" style="display:block;">本地上传区域</div>
      <div id="library-pane" style="display:none;">
        <div id="all-videos">全部视频</div>
        <div class="toolbar">
          <input id="folder-search" placeholder="在此文件夹下搜索" />
          <button id="folder-search-btn" type="button">搜索</button>
        </div>
        <div id="selected-count">已选择: 0</div>
        <div class="video-card" data-full-name="奔驰w221改装大灯总成.mp4" style="display:inline-block;width:220px;height:320px;position:relative;">
          <div class="preview-area" style="width:180px;height:220px;background:#111;margin:12px auto 0;position:relative;"></div>
          <div class="select-hotspot" style="position:absolute;left:20px;top:20px;width:28px;height:28px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer;"></div>
          <div class="video-title">奔驰w221改装大灯总成</div>
          <div class="video-duration">00:37</div>
        </div>
      </div>
    </div>

    <div id="modal-footer" style="display:none;">
      <button id="confirm-video" type="button" disabled>确定</button>
    </div>

    <script>
      const openBtn = document.getElementById('open-video-modal');
      const modal = document.getElementById('video-modal');
      const footer = document.getElementById('modal-footer');
      const localTab = document.getElementById('tab-local');
      const libraryTab = document.getElementById('tab-library');
      const localPane = document.getElementById('local-pane');
      const libraryPane = document.getElementById('library-pane');
      const allVideos = document.getElementById('all-videos');
      const searchInput = document.getElementById('folder-search');
      const searchBtn = document.getElementById('folder-search-btn');
      const selectedCount = document.getElementById('selected-count');
      const confirmBtn = document.getElementById('confirm-video');

      function renderCards() {
        const query = (searchInput.value || '').trim();
        document.body.dataset.videoSearchQuery = query;
      }

      function selectCard(card) {
        document.body.dataset.videoSelected = card.dataset.fullName || '';
        selectedCount.textContent = '已选择: 1';
        confirmBtn.disabled = false;
      }

      openBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        footer.style.display = 'block';
        document.body.dataset.videoModalOpen = 'true';
      });
      localTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'local';
        localPane.style.display = 'block';
        libraryPane.style.display = 'none';
      });
      libraryTab.addEventListener('click', () => {
        document.body.dataset.videoTab = 'library';
        localPane.style.display = 'none';
        libraryPane.style.display = 'block';
      });
      allVideos.addEventListener('click', () => {
        document.body.dataset.videoFolder = 'all';
      });
      searchBtn.addEventListener('click', renderCards);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderCards();
      });
      document.querySelector('.select-hotspot')?.addEventListener('click', (event) => {
        event.stopPropagation();
        selectCard(document.querySelector('.video-card'));
      });
      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        document.body.dataset.videoConfirmed = document.body.dataset.videoSelected || '';
        modal.style.display = 'none';
        footer.style.display = 'none';
      });
    </script>
  </body>
</html>
`;

let browser: Browser;
let tempVideoPath: string;

async function withPage(
  content: string,
  run: (page: Page) => Promise<void>,
): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.setContent(content);
    await run(page);
  } finally {
    await page.close();
  }
}

test.before(async () => {
  browser = await chromium.launch({ headless: true });
  tempVideoPath = path.join(os.tmpdir(), `codex-module1e-video-${Date.now()}.mp4`);
  fs.writeFileSync(tempVideoPath, Buffer.from('fake mp4 content'));
});

test.after(async () => {
  if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
  await browser.close();
});

test('resolveLocalVideoUploadSpec returns absolute path, filename, and stem', () => {
  const resolved = resolveLocalVideoUploadSpec(tempVideoPath);

  assert.ok(resolved);
  assert.equal(resolved?.absolutePath, tempVideoPath);
  assert.equal(resolved?.fileName, path.basename(tempVideoPath));
  assert.equal(resolved?.stem, path.basename(tempVideoPath, '.mp4'));
});

test('fillVideo skips cleanly when video_file is empty', async () => {
  await withPage(html, async (page) => {
    await fillVideo(page, makeProductData());

    const modalOpen = await page.evaluate(() => document.body.dataset.videoModalOpen || '');
    assert.equal(modalOpen, '');
  });
});

test('fillVideo uploads a local mp4 through the modal and confirms it', async () => {
  await withPage(html, async (page) => {
    const data = makeProductData();
    data.video_file = tempVideoPath;

    await fillVideo(page, data);

    const uploaded = await page.evaluate(() => document.body.dataset.videoUploaded || '');
    const confirmed = await page.evaluate(() => document.body.dataset.videoConfirmed || '');
    const modalDisplay = await page.locator('#video-modal').evaluate((el) => getComputedStyle(el).display);

    assert.equal(uploaded, path.basename(tempVideoPath));
    assert.equal(confirmed, path.basename(tempVideoPath, '.mp4'));
    assert.equal(modalDisplay, 'none');
  });
});

test('fillVideo can open the modal from a div-style upload card used by the real page', async () => {
  await withPage(htmlDivTrigger, async (page) => {
    const data = makeProductData();
    data.video_file = tempVideoPath;

    await fillVideo(page, data);

    const uploaded = await page.evaluate(() => document.body.dataset.videoUploaded || '');
    const confirmed = await page.evaluate(() => document.body.dataset.videoConfirmed || '');
    const modalDisplay = await page.locator('#video-modal').evaluate((el) => getComputedStyle(el).display);

    assert.equal(uploaded, path.basename(tempVideoPath));
    assert.equal(confirmed, path.basename(tempVideoPath, '.mp4'));
    assert.equal(modalDisplay, 'none');
  });
});

test('bootstrapVideoCategoryFromRecent reveals the video panel before local upload', async () => {
  await withPage(htmlVideoBootstrap, async (page) => {
    const data = makeProductData();
    data.category = '汽车及零配件 > 车灯 > 头灯总成';
    data.video_file = tempVideoPath;

    const bootstrapped = await bootstrapVideoCategoryFromRecent(page, data);
    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      recentOpened: document.body.dataset.recentOpened || '',
      videoPanelVisible: document.body.dataset.videoPanelVisible || '',
      uploaded: document.body.dataset.videoUploaded || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      category: (document.getElementById('category-input') as HTMLInputElement).value,
    }));

    assert.equal(bootstrapped, true);
    assert.equal(values.recentOpened, 'true');
    assert.equal(values.videoPanelVisible, 'true');
    assert.equal(values.category, '头灯总成');
    assert.equal(values.uploaded, path.basename(tempVideoPath));
    assert.equal(values.confirmed, path.basename(tempVideoPath, '.mp4'));
  });
});

test('fillVideo can select an uploaded video from media center', async () => {
  await withPage(htmlMediaCenter, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      folder: document.body.dataset.videoFolder || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      modalOpen: document.body.dataset.videoModalOpen || '',
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.folder, 'all');
    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.modalOpen, 'true');
  });
});

test('fillVideo in media_center mode does not fall back to local upload when library item is missing', async () => {
  await withPage(htmlMediaCenterNoMatch, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      modalDisplay: getComputedStyle(document.getElementById('video-modal')!).display,
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.selected, '');
    assert.equal(values.confirmed, '');
    assert.equal(values.modalDisplay, 'block');
  });
});

test('fillVideo in media_center mode stops cleanly when media library is empty', async () => {
  await withPage(htmlMediaCenterEmpty, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      modalDisplay: getComputedStyle(document.getElementById('video-modal')!).display,
      emptyText: (document.querySelector('.empty-state')?.textContent || '').trim(),
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.confirmed, '');
    assert.equal(values.modalDisplay, 'block');
    assert.match(values.emptyText, /暂无视频/);
  });
});

test('fillVideo searches media center and selects the target even when card title is truncated', async () => {
  await withPage(htmlMediaCenterSearchTruncated, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      folder: document.body.dataset.videoFolder || '',
      query: document.body.dataset.videoSearchQuery || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      selectedCount: (document.getElementById('selected-count')?.textContent || '').trim(),
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.folder, 'all');
    assert.equal(values.query, '奔驰w221改装大灯总成');
    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.match(values.selectedCount, /1/);
  });
});

test('fillVideo searches media center and selects the target by clicking tile root when no checkbox exists', async () => {
  await withPage(htmlMediaCenterSearchTileOnly, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      folder: document.body.dataset.videoFolder || '',
      query: document.body.dataset.videoSearchQuery || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      selectedCount: (document.getElementById('selected-count')?.textContent || '').trim(),
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.folder, 'all');
    assert.equal(values.query, '奔驰w221改装大灯总成');
    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.match(values.selectedCount, /1/);
  });
});

test('fillVideo searches media center and selects the target by clicking preview area when tile root itself is not selectable', async () => {
  await withPage(htmlMediaCenterSearchPreviewAreaOnly, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      folder: document.body.dataset.videoFolder || '',
      query: document.body.dataset.videoSearchQuery || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      selectedCount: (document.getElementById('selected-count')?.textContent || '').trim(),
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.folder, 'all');
    assert.equal(values.query, '奔驰w221改装大灯总成');
    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.match(values.selectedCount, /1/);
  });
});

test('fillVideo searches media center and selects the target by clicking checkbox hotspot when only top-left hotspot is selectable', async () => {
  await withPage(htmlMediaCenterSearchCheckboxHotspotOnly, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      folder: document.body.dataset.videoFolder || '',
      query: document.body.dataset.videoSearchQuery || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      selectedCount: (document.getElementById('selected-count')?.textContent || '').trim(),
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.folder, 'all');
    assert.equal(values.query, '奔驰w221改装大灯总成');
    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.match(values.selectedCount, /1/);
  });
});



test('fillVideo can confirm media center selection via modal bottom-right geometry fallback', async () => {
  await withPage(htmlMediaCenterConfirmByGeometryOnly, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      folder: document.body.dataset.videoFolder || '',
      query: document.body.dataset.videoSearchQuery || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      selectedCount: (document.getElementById('selected-count')?.textContent || '').trim(),
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.folder, 'all');
    assert.equal(values.query, '奔驰w221改装大灯总成');
    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.match(values.selectedCount, /1/);
  });
});

test('fillVideo waits for delayed confirm button after media center selection', async () => {
  await withPage(htmlMediaCenterDelayedConfirm, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      folder: document.body.dataset.videoFolder || '',
      query: document.body.dataset.videoSearchQuery || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      selectedCount: (document.getElementById('selected-count')?.textContent || '').trim(),
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.folder, 'all');
    assert.equal(values.query, '奔驰w221改装大灯总成');
    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.match(values.selectedCount, /1/);
  });
});

test('fillVideo can confirm media center selection when confirm button is rendered outside modal container', async () => {
  await withPage(htmlMediaCenterConfirmOutsideModal, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';

    await fillVideo(page, data);

    const values = await page.evaluate(() => ({
      tab: document.body.dataset.videoTab || '',
      folder: document.body.dataset.videoFolder || '',
      query: document.body.dataset.videoSearchQuery || '',
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      selectedCount: (document.getElementById('selected-count')?.textContent || '').trim(),
    }));

    assert.equal(values.tab, 'library');
    assert.equal(values.folder, 'all');
    assert.equal(values.query, '奔驰w221改装大灯总成');
    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.match(values.selectedCount, /1/);
  });
});

test('fillVideo does not treat modal close as success when product video area is still blank', async () => {
  await withPage(htmlMediaCenterFalsePositiveClose, async (page) => {
    const data = makeProductData();
    data.video_file = '/Users/aiden/Downloads/奔驰w221改装大灯总成.mp4';
    data.video_selection_mode = 'media_center';
    const logs: string[] = [];
    const originalLog = console.log;
    let result:
      | { status: string; evidence: string[]; screenshotPaths?: string[] }
      | undefined;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((part) => String(part)).join(' '));
    };
    try {
      result = await fillVideo(page, data) as { status: string; evidence: string[]; screenshotPaths?: string[] };
    } finally {
      console.log = originalLog;
    }

    const values = await page.evaluate(() => ({
      selected: document.body.dataset.videoSelected || '',
      confirmed: document.body.dataset.videoConfirmed || '',
      emptyVisible: window.getComputedStyle(document.getElementById('video-empty-state')).display !== 'none',
      boundVisible: window.getComputedStyle(document.getElementById('video-bound-state')).display !== 'none',
      modalOpen: window.getComputedStyle(document.getElementById('video-modal')).display !== 'none',
    }));

    assert.equal(values.selected, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.confirmed, '奔驰w221改装大灯总成.mp4');
    assert.equal(values.emptyVisible, true);
    assert.equal(values.boundVisible, false);
    assert.equal(values.modalOpen, false);
    assert.equal(result?.status, 'manual_gate');
    assert.ok((result?.evidence.length || 0) >= 1);
    assert.ok((result?.screenshotPaths?.length || 0) >= 1);
    assert.equal(logs.some((line) => line.includes('✅ 视频上传完成')), false);
  });
});
