
import { ColumnType, InferredSchema } from '../types';

const KEYWORDS: Record<ColumnType, string[]> = {
  date: ['ngày', 'date', 'thời gian'],
  time: ['giờ', 'time', 'slot', 'ca', 'slot code', 'slotcode', 'tiết'],
  person: ['họ', 'tên', 'giảng viên', 'thành viên', 'người', 'teacher', 'member', 'name', 'reviewer'],
  task: ['nhiệm vụ', 'vai trò', 'việc', 'task', 'role', 'duty', 'môn'],
  location: ['phòng', 'địa điểm', 'room', 'location', 'online'],
  email: ['email', 'thư điện tử'],
  unknown: []
};

const PATTERNS = {
  date: /\d{1,2}\/\d{1,2}\/\d{2,4}/,
  time: /(\d{1,2})h(\d{2})?\s*-\s*(\d{1,2})h(\d{2})?/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

export const inferSchema = (headers: string[], samples: string[][]): InferredSchema => {
  const mapping: any = {};
  let totalConfidence = 0;
  const types: ColumnType[] = ['date', 'time', 'person', 'task', 'location', 'email'];

  headers.forEach((header, index) => {
    const h = header.toLowerCase();

    types.forEach(type => {
      let score = 0;

      // 1. Check Keywords
      if (KEYWORDS[type].some(k => h.includes(k))) score += 0.6;

      // 2. Check Data Patterns (trên 3 dòng mẫu đầu tiên)
      const matchesPattern = samples.every(row => {
        const val = row[index];
        if (!val) return true;
        const pattern = (PATTERNS as any)[type];
        return pattern ? pattern.test(val) : false;
      });

      if (matchesPattern && (PATTERNS as any)[type]) score += 0.4;

      if (score > (mapping[type]?.score || 0)) {
        mapping[type] = { index, score };
      }
    });
  });

  const finalMapping: any = {};
  let count = 0;
  types.forEach(type => {
    if (mapping[type]) {
      finalMapping[type] = mapping[type].index;
      totalConfidence += mapping[type].score;
      count++;
    }
  });

  const avgConfidence = count > 0 ? totalConfidence / count : 0;
  const isReliable = avgConfidence > 0.75 && !!finalMapping.date && !!finalMapping.time && !!finalMapping.person;

  // ✅ LOG chi tiết kết quả mapping
  console.log('📊 Schema Inference Result:', {
    headers: headers,
    mapping: finalMapping,
    confidence: avgConfidence.toFixed(2),
    isReliable: isReliable,
    status: {
      date: finalMapping.date !== undefined ? `✅ Column ${finalMapping.date}: "${headers[finalMapping.date]}"` : '❌ MISSING',
      time: finalMapping.time !== undefined ? `✅ Column ${finalMapping.time}: "${headers[finalMapping.time]}"` : '❌ MISSING',
      person: finalMapping.person !== undefined ? `✅ Column ${finalMapping.person}: "${headers[finalMapping.person]}"` : '❌ MISSING',
      task: finalMapping.task !== undefined ? `✅ Column ${finalMapping.task}: "${headers[finalMapping.task]}"` : '⚠️ Optional',
      location: finalMapping.location !== undefined ? `✅ Column ${finalMapping.location}: "${headers[finalMapping.location]}"` : '⚠️ Optional'
    }
  });

  if (!isReliable) {
    console.warn(
      '⚠️ Schema không đáng tin cậy!\n',
      `Confidence: ${(avgConfidence * 100).toFixed(0)}% (cần >75%)\n`,
      `Missing required columns: ${!finalMapping.date ? 'date ' : ''}${!finalMapping.time ? 'time ' : ''}${!finalMapping.person ? 'person' : ''}`
    );
  }

  return {
    mapping: finalMapping,
    confidence: avgConfidence,
    isReliable: isReliable
  };
};
