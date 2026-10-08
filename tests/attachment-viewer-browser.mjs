import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

const runtime = await import(process.env.TOMPHIE_PLAYWRIGHT_PATH ? pathToFileURL(process.env.TOMPHIE_PLAYWRIGHT_PATH).href : 'playwright');
const base = process.env.TOMPHIE_EDITOR_URL ?? 'http://127.0.0.1:4333/';
const types = new Map();
let chrome, safari;
const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>';
async function office(parts) {
  const zip = new JSZip(); zip.file('[Content_Types].xml', contentTypes);
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
function pdf() {
  let text = '%PDF-1.4\n';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (const label of ['FIRST PAGE', 'SECOND PAGE']) { const stream = `BT /F1 18 Tf 20 150 Td (${label}) Tj ET`; objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`); }
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(text.length); text += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const start = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
before(async () => {
  chrome = await runtime.chromium.launch({ channel: 'chrome', headless: true });
  safari = await runtime.webkit.launch({ headless: true });
  types.set('docx', await office({ 'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word preview fixture</w:t></w:r></w:p></w:body></w:document>', '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' }));
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Name', 'Value'], ['青山', 42]]), '第一页'); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Second sheet']]), '第二页');
  types.set('xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  types.set('pdf', pdf());
  const slide = label => `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="8000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="2400"><a:latin typeface="Arial"/></a:rPr><a:t>${label}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  types.set('pptx', await office({ 'ppt/presentation.xml': '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="r1"/><p:sldId id="257" r:id="r2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>', 'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>', 'ppt/slides/slide1.xml': slide('First slide'), 'ppt/slides/slide2.xml': slide('Second slide') }));
});
after(async () => { await Promise.all([chrome?.close(), safari?.close()]); });

async function fixture(browser, width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 600 });
  const requests = []; const errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__attachment-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="files"></main></body></html>' }));
  await page.route('**/uploads/fixture.*', route => {
    const ext = new URL(route.request().url()).pathname.split('.').at(-1);
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: types.get(ext) ?? Buffer.from('a,b\n1,2') });
  });
  await page.goto(new URL('__attachment-test', base).href);
  await page.evaluate(async base => {
    await import(new URL('src/styles/workbench.css', base).href);
    await import(new URL('src/styles/attachments.css', base).href);
    const { initAttachmentLinks } = await import(new URL('src/scripts/attachments.ts', base).href);
    const container = document.getElementById('files');
    for (const ext of ['docx', 'xlsx', 'pdf', 'pptx', 'doc', 'webm']) { const link = document.createElement('a'); link.href = '/uploads/fixture.' + ext; link.textContent = 'fixture.' + ext; container.append(link); }
    initAttachmentLinks(container);
  }, base);
  assert(!requests.some(url => /pdfjs-dist|docx-preview|pptx-browser|\.vite\/deps\/xlsx/.test(url)), 'Document engines loaded before a file was opened');
  return { page, errors };
}

for (const engine of ['chrome', 'safari']) {
  test(`${engine}: real Office and PDF previews, paging, close, lazy loading`, async () => {
    const { page, errors } = await fixture(engine === 'chrome' ? chrome : safari);
    for (const ext of ['docx', 'xlsx', 'pdf', 'pptx']) {
      await page.locator(`a.attachment-card[data-attachment-reference$=".${ext}"]`).click();
      await page.waitForFunction(() => { const progress = document.querySelector('.attachment-progress'); return progress && !progress.textContent.includes('正在'); }, { timeout: 20000 });
      const message = await page.locator('.attachment-progress').textContent();
      assert(!message.includes('未完成'), `${ext}: ${message}`);
      if (ext === 'docx') {
        await page.frameLocator('.attachment-content iframe').getByText('Word preview fixture', { exact: true }).waitFor();
        assert.equal(await page.locator('.attachment-content iframe').getAttribute('sandbox'), '');
      } else if (ext === 'xlsx') {
        assert((await page.locator('.attachment-content table').textContent()).includes('青山'));
        await page.getByRole('combobox', { name: '选择工作表' }).selectOption('第二页');
        assert((await page.locator('.attachment-content table').textContent()).includes('Second sheet'));
      } else {
        await page.waitForFunction(() => document.querySelector('.attachment-content canvas')?.width > 0);
        await page.getByRole('button', { name: ext === 'pdf' ? '下一页' : '下一张', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.attachment-controls span')?.textContent === '2 / 2');
      }
      assert.equal(await page.locator('.attachment-dialog [data-open]').getAttribute('target'), '_blank');
      assert.equal(await page.locator('.attachment-dialog').evaluate(dialog => dialog.getBoundingClientRect().width <= innerWidth), true);
      await page.getByRole('button', { name: '关闭附件预览' }).click();
      assert.equal(await page.locator('.attachment-dialog').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
    }
    assert.deepEqual(errors, []);
    await page.close();
  });
}
test('legacy formats retain an original-file entry and video never autoplays', async () => {
  const { page } = await fixture(chrome, 1280);
  await page.locator('[data-attachment-reference$=".doc"]').click();
  await page.getByText('旧版 Office 文件已保存', { exact: false }).waitFor();
  assert.equal(await page.locator('[data-open]:visible').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('[data-attachment-reference$=".webm"]').click();
  await page.locator('.attachment-content video').waitFor();
  assert.equal(await page.locator('video').evaluate(video => video.controls && video.playsInline && !video.autoplay), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.attachment-dialog').count(), 0);
  await page.close();
});

test('private downloads preserve the signed token and request the original filename', async () => {
  const { page } = await fixture(safari);
  await page.evaluate(async base => {
    const { initAttachmentLinks } = await import(new URL('src/scripts/attachments.ts', base).href);
    const container = document.createElement('section');
    const link = document.createElement('a');
    link.href = 'asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.doc';
    link.textContent = '原文件.doc'; container.append(link); document.body.append(container);
    initAttachmentLinks(container, async () => new URL('storage/v1/object/sign/workbench-private/fixture.doc?token=fixture', base).href);
  }, base);
  await page.locator('[data-attachment-reference^="asset://"]').click();
  await page.getByText('旧版 Office 文件已保存', { exact: false }).waitFor();
  const download = new URL(await page.locator('[data-download]').getAttribute('href'));
  assert.equal(download.searchParams.get('token'), 'fixture');
  assert.equal(download.searchParams.get('download'), '原文件.doc');
  const original = new URL(await page.locator('[data-open]').getAttribute('href'));
  assert.equal(original.searchParams.has('download'), false);
  await page.keyboard.press('Escape'); await page.close();
});
