import { loadYaml  } from './serializer';

// フロントマター（YAML/JSON互換）+本文を抽出する軽量パーサ（ブラウザで Buffer を使わない）
export const parseFrontMatter = (markdown: string): { data: Record<string, unknown>; body: string } | null => {
  const lines = markdown.split(/\r?\n/);
  if (!lines[0] || !/^---\s*$/.test(lines[0])) {
    return null;
  }
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---\s*$/.test(lines[i])) { closeIndex = i; break; }
  }
  if (closeIndex === -1) {
    return null;
  }
  const fmBody = lines.slice(1, closeIndex).join('\n').trim();
  const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
  try {
    const data = loadYaml(fmBody) as Record<string, unknown>;
    return { data, body };
  } catch {
    return null;
  }
};
