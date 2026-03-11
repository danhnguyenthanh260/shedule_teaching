
export interface SemesterConfig {
    id: string;
    semester: string;
    sheetUrl: string;
    startRow: string;
    columns: string;
    dateFormat?: import('../types').DateFormat;
    sheetType?: 'review' | 'council';
    tabName?: string;
    mapping?: import('../types').ColumnMapping;
    createdAt?: number;
    notifEnabled?: boolean;
    autoSyncEnabled?: boolean;
}

export const configService = {
    fetchConfigs: async (): Promise<Record<string, SemesterConfig>> => {
        try {
            const response = await fetch('https://scheduleteaching-default-rtdb.asia-southeast1.firebasedatabase.app/configs.json');

            // ✅ TASK 2 & 3: Strict error handling for config fetch
            if (!response.ok) {
                if (response.status === 403 || response.status === 401) {
                    throw new Error('❌ Không có quyền truy cập Firebase Database. Vui lòng kiểm tra cấu hình.');
                }
                if (response.status === 404) {
                    throw new Error('❌ Không tìm thấy cấu hình. Vui lòng liên hệ Admin.');
                }
                throw new Error(`❌ Lỗi khi tải cấu hình: HTTP ${response.status}`);
            }

            const data = await response.json();

            // ✅ TASK 3: Validate config data
            if (!data || typeof data !== 'object') {
                throw new Error('❌ Dữ liệu cấu hình không hợp lệ');
            }

            if (Object.keys(data).length === 0) {
                throw new Error('❌ Chưa có học kỳ nào được cấu hình. Vui lòng liên hệ Admin.');
            }

            // Map the object to include the 'id' (key) inside the object
            const configs: Record<string, SemesterConfig> = {};
            Object.entries(data).forEach(([key, value]: [string, any]) => {
                // ✅ Validate each config entry
                if (!value || typeof value !== 'object') {
                    console.warn(`Invalid config for ${key}, skipping`);
                    return;
                }

                if (!value.sheetUrl || !value.startRow || !value.columns) {
                    console.warn(`Incomplete config for ${key}, skipping`);
                    return;
                }

                configs[key] = {
                    ...value,
                    id: key
                };
            });

            if (Object.keys(configs).length === 0) {
                throw new Error('❌ Không có cấu hình hợp lệ. Vui lòng liên hệ Admin.');
            }

            return configs;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '❌ Không thể tải cấu hình học kỳ';
            console.error('Config fetch error:', errorMessage);
            throw new Error(errorMessage);
        }
    }
};
