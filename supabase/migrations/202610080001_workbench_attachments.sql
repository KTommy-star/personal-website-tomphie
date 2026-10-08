-- Keep uploads private and preserve the existing sole-owner object policy.
-- Per-format and aggregate limits are checked again by the publication handler.
begin;
update storage.buckets set public = false, file_size_limit = 26214400,
  allowed_mime_types = array[
    'image/webp', 'image/png', 'image/jpeg', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
    'text/csv', 'video/mp4', 'video/webm', 'video/quicktime'
  ]
where id = 'workbench-private';
commit;
