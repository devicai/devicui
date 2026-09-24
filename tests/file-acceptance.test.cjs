const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs.cjs');
const { acceptedFileTypes, fileRejection } = loadTs(
  path.join(__dirname, '../src/components/ChatDrawer/fileAcceptance.ts')
);

const MB = 1024 * 1024;
const DEFAULTS = acceptedFileTypes({ images: true, documents: true });
const WITH_SHEETS = acceptedFileTypes({ images: true, documents: true, spreadsheets: true });
const file = (name, type = '', size = 1000) => ({ name, type, size });
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('a Word file passes with its MIME type and also when the OS reports none', () => {
  assert.equal(fileRejection(file('memoria.docx', DOCX), DEFAULTS, 10 * MB), null);
  assert.equal(fileRejection(file('Memoria Técnica.DOCX', ''), DEFAULTS, 10 * MB), null);
  assert.equal(fileRejection(file('modelo.doc', ''), DEFAULTS, 10 * MB), null);
  assert.equal(fileRejection(file('modelo.odt', ''), DEFAULTS, 10 * MB), null);
});

test('spreadsheets are refused unless the family is turned on', () => {
  assert.equal(fileRejection(file('registro.xlsx', XLSX), DEFAULTS, 10 * MB), 'type');
  assert.equal(fileRejection(file('registro.xlsx', XLSX), WITH_SHEETS, 10 * MB), null);
  assert.equal(fileRejection(file('registro.xlsx', ''), WITH_SHEETS, 10 * MB), null);
  assert.equal(fileRejection(file('anexo.xls', 'application/vnd.ms-excel'), WITH_SHEETS, 10 * MB), null);
  assert.equal(fileRejection(file('hoja.ods', ''), WITH_SHEETS, 10 * MB), null);
});

test('size is checked before type, and unknown formats stay refused', () => {
  assert.equal(fileRejection(file('memoria.pdf', 'application/pdf', 11 * MB), DEFAULTS, 10 * MB), 'size');
  assert.equal(fileRejection(file('setup.exe', 'application/x-msdownload'), WITH_SHEETS, 10 * MB), 'type');
  assert.equal(fileRejection(file('noextension', ''), WITH_SHEETS, 10 * MB), 'type');
  // An extension only counts at the end of the name.
  assert.equal(fileRejection(file('docx.exe', ''), WITH_SHEETS, 10 * MB), 'type');
});

test('with no family enabled anything goes, as before', () => {
  assert.equal(fileRejection(file('whatever.bin', ''), acceptedFileTypes({}), 10 * MB), null);
});

test('the dialog accept list carries MIME types and extensions without duplicates', () => {
  const parts = WITH_SHEETS.accept.split(',');
  assert.ok(parts.includes(XLSX));
  assert.ok(parts.includes('.xlsx'));
  assert.ok(parts.includes('.docx'));
  assert.equal(parts.length, new Set(parts).size);
  assert.ok(!DEFAULTS.accept.includes('.xlsx'));
});

test('additionalFileTypes adds extensions (with or without dot) and MIME types, wildcards included', () => {
  const accepted = acceptedFileTypes({ documents: true }, ['.dwg', 'DXF', ' application/zip ', 'model/*', '']);
  assert.equal(fileRejection(file('plano.dwg', ''), accepted, 10 * MB), null);
  assert.equal(fileRejection(file('PLANO.DXF', 'application/octet-stream'), accepted, 10 * MB), null);
  assert.equal(fileRejection(file('fotos.bin', 'application/zip'), accepted, 10 * MB), null);
  assert.equal(fileRejection(file('cubierta', 'model/gltf-binary'), accepted, 10 * MB), null);
  // The families still apply, and anything else is still refused.
  assert.equal(fileRejection(file('memoria.docx', ''), accepted, 10 * MB), null);
  assert.equal(fileRejection(file('hoja.xlsx', ''), accepted, 10 * MB), 'type');
  assert.equal(fileRejection(file('modelo.gltf', 'text/plain+model'), accepted, 10 * MB), 'type');
  const parts = accepted.accept.split(',');
  for (const entry of ['.dwg', '.dxf', 'application/zip', 'model/*']) assert.ok(parts.includes(entry), entry);
  assert.ok(!parts.includes(''));
});

test('additionalFileTypes alone restricts to those formats, and never lifts the size limit', () => {
  const accepted = acceptedFileTypes({}, ['.dwg']);
  assert.equal(fileRejection(file('plano.dwg', ''), accepted, 10 * MB), null);
  assert.equal(fileRejection(file('memoria.pdf', 'application/pdf'), accepted, 10 * MB), 'type');
  assert.equal(fileRejection(file('plano.dwg', '', 20 * MB), accepted, 10 * MB), 'size');
});
