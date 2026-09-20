import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAX, selectCandidates, buildContext } from '../scripts/loop.mjs';

const PAINT_AX = [
  'Window: "未命名 - 小畫家", App: mspaint.exe.',
  '0 視窗 未命名 - 小畫家 Secondary Actions: Raise',
  '\t5 功能表項目 檔案',
  '\t8 應用程式列按鈕 儲存',
  '\t10 應用程式列按鈕 (disabled) 復原',
  '\t18 可選取的分割按鈕 (selectable, settable, string) 選取 Value: 矩形',
  '\t54 清單項目 橢圓形',
  '\t\t55 按鈕 橢圓形',
  '\t123 選項按鈕 (selectable) 色彩 2: 黑色',
  '\t162 文字 1152 × 648像素 ID: CanvasSizeTextBlock',
  '\t164 下拉式方塊 (settable, string) 縮放 ID: ZoomValuesComboBox',
  '\t\t165 編輯 (settable, string) 縮放 Value: 100% ID: EditableText',
].join('\n');

test('Traditional Chinese Paint controls retain source indexes and labels', () => {
  const elements = parseAX(PAINT_AX);
  const ellipse = elements.find(el => el.index === 55);
  assert.equal(ellipse.role, 'button');
  assert.equal(ellipse.label, '橢圓形');
  assert.equal(ellipse.raw, '\t\t55 按鈕 橢圓形');
  assert.equal(ellipse.depth, 8);
  assert.equal(elements.find(el => el.index === 8).role, 'button');
  assert.equal(elements.find(el => el.index === 18).role, 'pop up button');
  assert.equal(elements.find(el => el.index === 123).role, 'radio button');
  assert.equal(elements.find(el => el.index === 164).role, 'combo box');
  assert.equal(elements.find(el => el.index === 165).role, 'text field');
  const candidates = selectCandidates(elements, '選擇 橢圓形', { max: 2 });
  assert.ok(candidates.some(el => el.index === 55));
});

test('disabled controls are excluded without matching disabled text in labels', () => {
  const ax = PAINT_AX + '\n200 button (selectable, disabled) Undo\n201 button Explain (disabled) status';
  const candidates = selectCandidates(parseAX(ax), 'Undo 復原');
  assert.ok(!candidates.some(el => [10, 200].includes(el.index)));
  assert.ok(candidates.some(el => el.index === 201));
});

test('localized feedback is retained in bounded Jev context', () => {
  assert.ok(buildContext(PAINT_AX).includes('162 文字 1152 × 648像素'));
  assert.ok(!buildContext(PAINT_AX, { maxTextLines: 0 }).includes('648'));
  assert.ok(buildContext(PAINT_AX).length <= 1500);
});

test('mixed-language trees preserve English behavior and unknown roles', () => {
  const elements = parseAX(PAINT_AX + '\n220 button Save\n221 unknown-widget Label\n222 menu bar main-menu-bar File');
  assert.equal(elements.find(el => el.index === 220).role, 'button');
  assert.equal(elements.find(el => el.index === 222).role, 'menu bar main-menu-bar');
  assert.ok(!selectCandidates(elements).some(el => el.index === 221));
});
