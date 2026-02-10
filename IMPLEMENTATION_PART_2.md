# IMPLEMENTATION_PART_2.md – Conflict Checker & Firestore Spec

Dịch vụ này đóng vai trò "người gác cổng" để ngăn chặn việc trùng lịch giảng viên, phòng học hoặc lớp học trước khi dữ liệu được đẩy lên Google Calendar.

---

## I. Firestore Schema Chi tiết

### 1. Collection `/resources`
Lưu trữ trạng thái của từng thực thể tham gia vào lịch trình.
```ts
{
  id: string; // ví dụ: "giangvien_abc", "phong_101"
  type: 'teacher' | 'room' | 'class';
  name: string;
  lastUpdated: Timestamp;
}
```

### 2. Collection `/slots` (Chủ chốt)
Lưu trữ các phiên làm việc đã được xác nhận.
```ts
{
  id: string;           // Khóa chính (thường là SHA-256 hash của content)
  title: string;
  startTime: Timestamp;
  endTime: Timestamp;
  resources: string[];  // ['teacher_A', 'room_101', 'class_SE1501']
  summary: string;
  calendarEventId: string;
  status: 'confirmed' | 'pending' | 'error';
  metadata: {
    sourceSheetId: string;
    tabName: string;
    syncedBy: string;   // UID của admin
  }
}
```

---

## II. Thuật toán Conflict Detection (Node.js/Vercel)

Hàm `checkConflicts` sẽ thực hiện truy vấn Firestore để tìm bất kỳ slot nào giao thoa về thời gian VÀ dùng chung tài nguyên.

```typescript
async function findConflicts(newSlot: SlotCandidate): Promise<Slot[]> {
  const { startTime, endTime, resources } = newSlot;

  // Truy vấn tìm các slot giao thoa thời gian
  // (StartA < EndB) AND (EndA > StartB)
  const overlappingSlotsQuery = db.collection('slots')
    .where('startTime', '<', endTime)
    .where('endTime', '>', startTime);

  const snapshot = await overlappingSlotsQuery.get();
  
  // Lọc thủ công các slot có chung ít nhất 1 resource
  // (Vì Firestore array-contains-any giới hạn 10 items)
  return snapshot.docs
    .map(doc => doc.data() as Slot)
    .filter(existingSlot => 
      existingSlot.resources.some(r => resources.includes(r))
    );
}
```

---

## III. Quy trình Giao dịch (Atomic Transaction)

Để tránh **Race Condition** (2 admin cùng nhấn đồng bộ một lúc cho cùng 1 phòng), mọi thao tác phải nằm trong một Firestore Transaction.

1. **Bắt đầu Transaction**.
2. **Đọc**: Tìm kiếm xung đột trong Firestore.
3. **Phân tích**: Nếu tìm thấy xung đột -> Hủy Transaction, trả về lỗi chi tiết cho UI.
4. **Ghi**: Lưu Slot mới vào Firestore với trạng thái `pending`.
5. **Thực thi bên ngoài**: Gọi Apps Script để tạo Calendar Event.
6. **Cập nhật**: Nếu GAS thành công -> Update status sang `confirmed` và lưu `calendarEventId`. Nếu thất bại -> Rollback/Mark error.

---

## IV. API Contract (Vercel Proxy)

**Endpoint**: `POST /api/sync-secure`
**Xác thực**: Firebase ID Token (Bearer)

**Request Payload**:
```json
{
  "events": [
    {
      "title": "[LAB] PRJ311",
      "start": "2026-02-10T08:00:00+07:00",
      "end": "2026-02-10T10:00:00+07:00",
      "resources": ["gv_dat", "room_302"]
    }
  ]
}
```

---

## V. Cải tiến UI (Frontend)

- **Conflict Preview**: Trước khi nhấn đồng bộ, frontend gọi một API "Dry Run" để check xung đột.
- **Visual Warning**: Những dòng bị xung đột sẽ hiện màu đỏ trong `ScheduleTable` kèm thông tin: "Giảng viên X đang bận ở phòng Y".

---
*Bản đặc tả này cung cấp cơ sở kỹ thuật để bắt đầu coding các service xử lý ở backend.*
