import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';

import { selectImageFromLibrary } from '../src/modules';

const html = `
<!doctype html>
<html>
  <body>
    <button id="upload-btn" type="button">上传图片</button>

    <div id="image-modal" class="ait-modal-wrap" style="display:none;">
      <div class="ait-modal" style="display:block;">
        <div class="next-tabs-tab" id="select-tab" role="tab">选择图片</div>
        <div>上传图片</div>

        <div class="material-center-select-container">
          <div class="ait-tree">
            <div class="ait-tree-treenode">
              <div class="ait-tree-node-content-wrapper"><span class="folder-name">商品发布</span></div>
            </div>
            <div class="ait-tree-treenode">
              <div class="ait-tree-node-content-wrapper"><span class="folder-name">TailLights</span></div>
            </div>
            <div class="ait-tree-treenode">
              <div class="ait-tree-node-content-wrapper"><span class="folder-name">FAMILY SUV</span></div>
            </div>
            <div class="ait-tree-treenode">
              <div class="ait-tree-node-content-wrapper"><span class="folder-name">TOYOTA SIENNA</span></div>
            </div>
          </div>

          <div class="material-center-image__item" id="image-card">
            <div class="material-center-image__item__title">SKUa.jpg</div>
            <label class="material-center-image__checkbox">checkbox</label>
          </div>

          <div class="material-center-select-container__footer">
            <button id="confirm-btn" class="ait-btn-primary" type="button">确认</button>
          </div>
        </div>
      </div>
    </div>

    <script>
      const uploadBtn = document.getElementById('upload-btn');
      const modal = document.getElementById('image-modal');
      const confirmBtn = document.getElementById('confirm-btn');
      const imageCard = document.getElementById('image-card');

      uploadBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        document.body.dataset.modalOpened = '1';
      });

      imageCard.addEventListener('click', () => {
        document.body.dataset.imageSelected = '1';
      });

      imageCard.querySelector('.material-center-image__checkbox').addEventListener('click', (event) => {
        event.stopPropagation();
        document.body.dataset.imageSelected = '1';
      });

      confirmBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        document.body.dataset.confirmed = '1';
      });
    </script>
  </body>
</html>
`;

let browser: Browser;
let page: Page;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.beforeEach(async () => {
  page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.setContent(html);
});

test.afterEach(async () => {
  await page.close();
});

test.after(async () => {
  await browser.close();
});

test('selectImageFromLibrary does not keep long blind delays when modal and tree nodes are already ready', async () => {
  const selectImageFromLibraryWithOptions = selectImageFromLibrary as (
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    imagePath: { category: string; product: string; filename: string },
    options?: {
      delayFn?: (minMs: number, maxMs: number) => Promise<void>;
    },
  ) => Promise<boolean>;

  const started = Date.now();
  const ok = await selectImageFromLibraryWithOptions(
    page,
    page.locator('#upload-btn'),
    {
      category: 'FAMILY SUV',
      product: 'TOYOTA SIENNA',
      filename: 'SKUa.jpg',
    },
    {
      delayFn: async () => undefined,
    },
  );
  const elapsedMs = Date.now() - started;

  const snapshot = await page.evaluate(() => ({
    modalOpened: document.body.dataset.modalOpened || '',
    imageSelected: document.body.dataset.imageSelected || '',
    confirmed: document.body.dataset.confirmed || '',
  }));

  assert.equal(ok, true);
  assert.equal(snapshot.modalOpened, '1');
  assert.equal(snapshot.imageSelected, '1');
  assert.equal(snapshot.confirmed, '1');
  assert.ok(elapsedMs < 1500, `image library flow stayed slow on immediate-ready DOM: ${elapsedMs}ms`);
});

test('selectImageFromLibrary skips folder traversal when target image is already visible in current view', async () => {
  await page.evaluate(() => {
    document.querySelectorAll('.ait-tree-node-content-wrapper').forEach((node) => {
      node.addEventListener('click', () => {
        document.body.dataset.folderClicks = String(Number(document.body.dataset.folderClicks || '0') + 1);
      });
    });
  });

  const selectImageFromLibraryWithOptions = selectImageFromLibrary as (
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    imagePath: { category: string; product: string; filename: string },
    options?: {
      delayFn?: (minMs: number, maxMs: number) => Promise<void>;
    },
  ) => Promise<boolean>;

  const ok = await selectImageFromLibraryWithOptions(
    page,
    page.locator('#upload-btn'),
    {
      category: 'FAMILY SUV',
      product: 'TOYOTA SIENNA',
      filename: 'SKUa.jpg',
    },
    {
      delayFn: async () => undefined,
    },
  );

  const snapshot = await page.evaluate(() => ({
    folderClicks: document.body.dataset.folderClicks || '0',
    imageSelected: document.body.dataset.imageSelected || '',
  }));

  assert.equal(ok, true);
  assert.equal(snapshot.folderClicks, '0');
  assert.equal(snapshot.imageSelected, '1');
});

test('selectImageFromLibrary reports sub-phase progress when tree traversal is required', async () => {
  await page.evaluate(() => {
    const imageCard = document.getElementById('image-card');
    if (imageCard) {
      imageCard.setAttribute('style', 'display:none;');
    }
    document.querySelectorAll('.ait-tree-node-content-wrapper').forEach((node) => {
      node.addEventListener('click', () => {
        const name = node.textContent?.trim();
        if (name === 'TOYOTA SIENNA' && imageCard) {
          imageCard.setAttribute('style', 'display:block;');
        }
      });
    });
  });

  const progressActions: string[] = [];
  const selectImageFromLibraryWithOptions = selectImageFromLibrary as (
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    imagePath: { category: string; product: string; filename: string },
    options?: {
      delayFn?: (minMs: number, maxMs: number) => Promise<void>;
      onProgress?: (event: { action: string; details: string }) => void | Promise<void>;
    },
  ) => Promise<boolean>;

  const ok = await selectImageFromLibraryWithOptions(
    page,
    page.locator('#upload-btn'),
    {
      category: 'FAMILY SUV',
      product: 'TOYOTA SIENNA',
      filename: 'SKUa.jpg',
    },
    {
      delayFn: async () => undefined,
      onProgress(event) {
        progressActions.push(event.action);
      },
    },
  );

  assert.equal(ok, true);
  assert.deepEqual(progressActions, [
    'fill_sku_image_modal_running',
    'fill_sku_image_tree_running',
    'fill_sku_image_tree_level_1_running',
    'fill_sku_image_tree_level_2_running',
    'fill_sku_image_tree_level_3_running',
    'fill_sku_image_tree_level_4_running',
    'fill_sku_image_select_running',
    'fill_sku_image_confirm_running',
  ]);
  assert.match(progressActions.join(','), /fill_sku_image_tree_level_4_running/);
});

test('selectImageFromLibrary does not emit tree progress when target image is already visible', async () => {
  const progressActions: string[] = [];
  const selectImageFromLibraryWithOptions = selectImageFromLibrary as (
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    imagePath: { category: string; product: string; filename: string },
    options?: {
      delayFn?: (minMs: number, maxMs: number) => Promise<void>;
      onProgress?: (event: { action: string; details: string }) => void | Promise<void>;
    },
  ) => Promise<boolean>;

  const ok = await selectImageFromLibraryWithOptions(
    page,
    page.locator('#upload-btn'),
    {
      category: 'FAMILY SUV',
      product: 'TOYOTA SIENNA',
      filename: 'SKUa.jpg',
    },
    {
      delayFn: async () => undefined,
      onProgress(event) {
        progressActions.push(event.action);
      },
    },
  );

  assert.equal(ok, true);
  assert.deepEqual(progressActions, [
    'fill_sku_image_modal_running',
    'fill_sku_image_select_running',
    'fill_sku_image_confirm_running',
  ]);
});

test('selectImageFromLibrary replays the canonical tree path when the target image is hidden behind the product folder', async () => {
  await page.evaluate(() => {
    const imageCard = document.getElementById('image-card');
    if (imageCard) {
      imageCard.setAttribute('style', 'display:none;');
    }
    document.querySelectorAll('.ait-tree-node-content-wrapper').forEach((node) => {
      node.addEventListener('click', () => {
        const name = node.textContent?.trim() || '';
        document.body.dataset.folderClickOrder = `${document.body.dataset.folderClickOrder || ''}|${name}`;
        if (name === 'TOYOTA SIENNA' && imageCard) {
          imageCard.setAttribute('style', 'display:block;');
        }
      });
    });
  });

  const selectImageFromLibraryWithOptions = selectImageFromLibrary as (
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    imagePath: { category: string; product: string; filename: string },
    options?: {
      delayFn?: (minMs: number, maxMs: number) => Promise<void>;
      onProgress?: (event: { action: string; details: string }) => void | Promise<void>;
    },
  ) => Promise<boolean>;

  const ok = await selectImageFromLibraryWithOptions(
    page,
    page.locator('#upload-btn'),
    {
      category: 'FAMILY SUV',
      product: 'TOYOTA SIENNA',
      filename: 'SKUa.jpg',
    },
    {
      delayFn: async () => undefined,
    },
  );

  const folderClickOrder = await page.evaluate(() => (document.body.dataset.folderClickOrder || '').split('|').filter(Boolean));

  assert.equal(ok, true);
  assert.deepEqual(folderClickOrder, ['商品发布', 'TailLights', 'FAMILY SUV', 'TOYOTA SIENNA']);
});

test('selectImageFromLibrary skips the current folder click when the next canonical level is already visible', async () => {
  await page.evaluate(() => {
    const imageCard = document.getElementById('image-card');
    const folderByName = new Map<string, HTMLElement>();
    if (imageCard) {
      imageCard.setAttribute('style', 'display:none;');
    }

    document.querySelectorAll('.ait-tree-node-content-wrapper').forEach((node) => {
      const name = node.textContent?.trim() || '';
      const element = node as HTMLElement;
      folderByName.set(name, element);
      if (name === 'FAMILY SUV' || name === 'TOYOTA SIENNA') {
        element.style.display = 'none';
      }

      node.addEventListener('click', () => {
        document.body.dataset.folderClickOrder = `${document.body.dataset.folderClickOrder || ''}|${name}`;
        if (name === 'TailLights') {
          const target = folderByName.get('FAMILY SUV');
          if (target) {
            target.style.display = 'block';
          }
        }
        if (name === 'FAMILY SUV') {
          const target = folderByName.get('TOYOTA SIENNA');
          if (target) {
            target.style.display = 'block';
          }
        }
        if (name === 'TOYOTA SIENNA' && imageCard) {
          imageCard.setAttribute('style', 'display:block;');
        }
      });
    });
  });

  const selectImageFromLibraryWithOptions = selectImageFromLibrary as (
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    imagePath: { category: string; product: string; filename: string },
    options?: {
      delayFn?: (minMs: number, maxMs: number) => Promise<void>;
    },
  ) => Promise<boolean>;

  const ok = await selectImageFromLibraryWithOptions(
    page,
    page.locator('#upload-btn'),
    {
      category: 'FAMILY SUV',
      product: 'TOYOTA SIENNA',
      filename: 'SKUa.jpg',
    },
    {
      delayFn: async () => undefined,
    },
  );

  const folderClickOrder = await page.evaluate(() => (document.body.dataset.folderClickOrder || '').split('|').filter(Boolean));

  assert.equal(ok, true);
  assert.deepEqual(folderClickOrder, ['TailLights', 'FAMILY SUV', 'TOYOTA SIENNA']);
});

test('selectImageFromLibrary does not pay long polling delays when next folders appear shortly after each click', async () => {
  await page.evaluate(() => {
    const treeWrappers = Array.from(document.querySelectorAll('.ait-tree-node-content-wrapper'));
    const imageCard = document.getElementById('image-card');
    const folderByName = new Map<string, HTMLElement>();

    treeWrappers.forEach((node) => {
      const name = node.textContent?.trim() || '';
      const wrapper = node as HTMLElement;
      folderByName.set(name, wrapper);
      if (name !== '商品发布') {
        wrapper.style.display = 'none';
      }
    });

    if (imageCard) {
      imageCard.setAttribute('style', 'display:none;');
    }

    folderByName.get('商品发布')?.addEventListener('click', () => {
      window.setTimeout(() => {
        const target = folderByName.get('TailLights');
        if (target) {
          target.style.display = 'block';
        }
      }, 50);
    });
    folderByName.get('TailLights')?.addEventListener('click', () => {
      window.setTimeout(() => {
        const target = folderByName.get('FAMILY SUV');
        if (target) {
          target.style.display = 'block';
        }
      }, 50);
    });
    folderByName.get('FAMILY SUV')?.addEventListener('click', () => {
      window.setTimeout(() => {
        const target = folderByName.get('TOYOTA SIENNA');
        if (target) {
          target.style.display = 'block';
        }
      }, 50);
    });
    folderByName.get('TOYOTA SIENNA')?.addEventListener('click', () => {
      imageCard?.setAttribute('style', 'display:block;');
    });
  });

  const selectImageFromLibraryWithOptions = selectImageFromLibrary as (
    page: Page,
    uploadBtn: ReturnType<Page['locator']>,
    imagePath: { category: string; product: string; filename: string },
    options?: {
      delayFn?: (minMs: number, maxMs: number) => Promise<void>;
    },
  ) => Promise<boolean>;

  const started = Date.now();
  const ok = await selectImageFromLibraryWithOptions(
    page,
    page.locator('#upload-btn'),
    {
      category: 'FAMILY SUV',
      product: 'TOYOTA SIENNA',
      filename: 'SKUa.jpg',
    },
    {
      delayFn: async () => undefined,
    },
  );
  const elapsedMs = Date.now() - started;

  assert.equal(ok, true);
  assert.ok(elapsedMs < 800, `folder polling stayed too slow on short delayed reveals: ${elapsedMs}ms`);
});
