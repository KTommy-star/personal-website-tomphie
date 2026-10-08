# Mobile optics and writing attachments

## Scope

Preserve the refracted-landscape design, desktop rendering and clear mobile glass face. Keep the native Markdown editor and private Supabase workbench; no new server or external document conversion service.

## Accepted behavior

- Mobile rim sampling never visibly carries stale scenery through a delayed scroll frame; subtly broader optics, stable native scrolling and reduced-motion fallbacks.
- A shared formatting catalog powers a compact toolbar and searchable `/` menu. Chinese IME, touch, keyboard selection, caret placement and autosave continue to work.
- Word, spreadsheets, slides, PDF and video can be attached to drafts. Signed private preview URLs are temporary and never written into Markdown. Publishing explicitly makes referenced files public.
- DOCX, XLSX/XLS/CSV, PPTX, PDF and supported browser video codecs have in-site previews. Legacy DOC/PPT and unsupported codecs retain original-file opening/downloading. Complex Office layouts are best read in the original file.
- Documents are capped at10MiB, videos25MiB, published files20 /40MiB total. Validate content signatures, Office ZIP contents, ownership and MIME before upload/publication.
- Document engines load only when a file is opened, not on the homepage or during ordinary typing. Close cancels fetching and releases rendering resources. Spreadsheet/page/slide views are bounded rather than mounting entire large documents.

## Verification and release

Focused command parsing, preview sanitization, storage and publication tests; TypeScript/build checks; browser smoke flows for command menus, file viewers and delayed mobile frames. Preserve existing published content. Deploy the Edge Function and apply the storage migration where existing credentials permit, otherwise provide the exact single remaining setup step without claiming it is live.
