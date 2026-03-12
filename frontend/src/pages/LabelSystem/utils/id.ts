export function generateId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
