// lib/registry.js — load bundled L1 sources + rules + upstream
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './util.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REGISTRY_DIR = path.join(ROOT, 'registry');

export function loadSources() { return readJson(path.join(REGISTRY_DIR, 'sources.json'), { sources: [] }).sources; }
export function loadRules() { return readJson(path.join(REGISTRY_DIR, 'rules.json'), {}); }
export function loadUpstream() { return readJson(path.join(REGISTRY_DIR, 'upstream.json'), { feeds: [] }); }

export function findSource(id) {
  return loadSources().find((s) => s.id === id) ?? null;
}

/** 门槛参数快捷访问（带默认值） */
export function gateParams(rules) {
  const rq = rules || loadRules();
  return {
    ctxMin: rq.gates?.ctxMin ?? 128000,
    rpmMin: rq.gates?.rpmMin ?? 15,
    rpdMin: rq.gates?.rpdMin ?? 50,
    toolcallRequired: rq.gates?.toolcallRequired ?? true,
  };
}
