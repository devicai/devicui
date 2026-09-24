/**
 * Which files the composer accepts, per `AllowedFileTypes` family.
 *
 * A file passes on its MIME type OR its extension. The browser derives
 * `File.type` from the operating system, which often knows nothing about a
 * format: a .docx on a computer without Office, a .json on Windows without the
 * registry entry, an .xlsx on some Linux setups all arrive with an empty type
 * (or a generic one) and were rejected without a word.
 */

export const FILE_TYPE_ACCEPT: Record<string, string[]> = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf',
    'text/rtf',
    'text/plain',
    'text/csv',
    'application/json',
  ],
  spreadsheets: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
  ],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
};

export const FILE_TYPE_ACCEPT_EXT: Record<string, string[]> = {
  images: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  documents: ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.csv', '.json'],
  spreadsheets: ['.xlsx', '.xls', '.xlsm', '.ods', '.csv'],
  audio: ['.mp3', '.wav', '.ogg'],
  video: ['.mp4', '.webm', '.ogv'],
};

export interface AcceptedFileTypes {
  mimeTypes: string[];
  extensions: string[];
  /** Value for the `accept` attribute of the native file dialog. */
  accept: string;
}

const enabledFamilies = (allowed: Record<string, boolean | undefined>) =>
  Object.entries(allowed || {})
    .filter(([, enabled]) => enabled)
    .map(([family]) => family);

const unique = (items: string[]) => Array.from(new Set(items));

export const acceptedFileTypes = (
  allowed: Record<string, boolean | undefined>
): AcceptedFileTypes => {
  const families = enabledFamilies(allowed);
  const mimeTypes = unique(families.flatMap((family) => FILE_TYPE_ACCEPT[family] || []));
  const extensions = unique(families.flatMap((family) => FILE_TYPE_ACCEPT_EXT[family] || []));
  return { mimeTypes, extensions, accept: [...mimeTypes, ...extensions].join(',') };
};

export type FileRejection = 'size' | 'type';

/** Why a file cannot be attached, or null when it can. */
export const fileRejection = (
  file: { name: string; type: string; size: number },
  accepted: AcceptedFileTypes,
  maxFileSize: number
): FileRejection | null => {
  if (file.size > maxFileSize) return 'size';
  if (accepted.mimeTypes.length === 0 && accepted.extensions.length === 0) return null;
  const name = (file.name || '').toLowerCase();
  const allowed =
    (!!file.type && accepted.mimeTypes.includes(file.type)) ||
    accepted.extensions.some((extension) => name.endsWith(extension));
  return allowed ? null : 'type';
};
