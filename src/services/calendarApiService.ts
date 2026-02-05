import { CalendarEvent, SyncResponse } from './appsScriptService';
import { logInfo, logError } from '../utils/logger';

/**
 * Service để gọi trực tiếp Google Calendar API từ Frontend
 * Dùng làm giải pháp thay thế khi Apps Script Backend gặp vấn đề về phân quyền/đích đến
 */
export const syncToGoogleCalendarAPI = async (
  events: CalendarEvent[],
  accessToken: string,
  calendarId: string = 'primary'
): Promise<SyncResponse> => {
  logInfo(`🚀 Bắt đầu đồng bộ trực tiếp qua Google API (${events.length} sự kiện)...`);

  const results = {
    success: 0,
    failed: 0,
    total: events.length
  };

  const startTime = Date.now();

  // ✅ Log which calendar we're syncing to
  console.log(`📅 Syncing to calendar: ${calendarId}`);
  logInfo(`Target calendar: ${calendarId}`);

  // Đồng bộ tuần tự để tránh Rate Limit và dễ kiểm soát lỗi
  for (const event of events) {
    try {
      // 1. Kiểm tra lặp trước khi tạo (Tùy chọn, nâng cao sau)
      // Hiện tại: Tạo trực tiếp để người dùng thấy kết quả ngay

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: event.title,
            location: event.location,
            description: event.description || '',
            start: {
              dateTime: event.start,
              timeZone: 'Asia/Ho_Chi_Minh' // ✅ Explicit timezone for Vietnam
            },
            end: {
              dateTime: event.end,
              timeZone: 'Asia/Ho_Chi_Minh' // ✅ Explicit timezone for Vietnam
            },
            reminders: {
              useDefault: true
            }
          })
        }
      );

      if (response.ok) {
        const eventData = await response.json();
        console.log(`✅ Event created successfully:`, {
          id: eventData.id,
          title: event.title,
          start: event.start,
          htmlLink: eventData.htmlLink
        });
        logInfo(`✅ Created: ${event.title} (ID: ${eventData.id})`);
        results.success++;
      } else {
        const errorText = await response.text();

        // ✅ Handle 401 Unauthorized (expired/invalid token)
        if (response.status === 401) {
          logError('❌ Token hết hạn hoặc không hợp lệ. Vui lòng đăng xuất và đăng nhập lại.');
          throw new Error('Token đã hết hạn. Vui lòng đăng xuất và đăng nhập lại để làm mới quyền truy cập.');
        }

        console.error(`❌ Failed to create event:`, {
          title: event.title,
          status: response.status,
          error: errorText
        });
        logError('Google API Event Creation Failed:', errorText);
        results.failed++;
      }
    } catch (e) {
      logError('Network error calling Google API:', e);
      results.failed++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  return {
    status: results.success > 0 ? 'success' : 'error',
    message: results.success > 0
      ? `Đã đồng bộ thành công ${results.success} sự kiện vào lịch cá nhân.`
      : 'Không có sự kiện nào được tạo thành công.',
    data: {
      total: results.total,
      success: results.success,
      failed: results.failed,
      skipped: 0 // API direct tạo trực tiếp nên không có skipped (trừ khi ta code thêm logic check)
    },
    timestamp: new Date().toISOString(),
    executionTime: `${duration}s`
  };
};
