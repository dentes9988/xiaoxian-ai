export function extractJsonPayload(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // Some smaller models emit adjacent JSON objects even when JSON mode is enabled.
  }

  const objects: Array<Record<string, unknown>> = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"' && depth > 0) {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character !== "}" || depth === 0) continue;

    depth -= 1;
    if (depth !== 0 || start < 0) continue;

    try {
      const parsed = JSON.parse(content.slice(start, index + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        objects.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Continue scanning in case a later complete object is valid.
    }
    start = -1;
  }

  if (objects.length === 0) return null;
  return Object.assign({}, ...objects);
}
