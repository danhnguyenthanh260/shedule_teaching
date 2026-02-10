# 🔥 Firebase Architecture Review: Schedule Teaching

This review evaluates the Firebase implementation based on data modeling, security, performance, and scalability.

---

## 🟢 OK / Best Practices Followed

- **Data Isolation**: Using `users/{userId}` as the root for all user-specific data is the gold standard for security and GDPR compliance.
- **Subcollection Strategy**: `mappings` and `syncHistory` are implemented as subcollections. This ensures queries are scoped naturally to the user and scales effectively to millions of users.
- **Denormalization**: `syncHistory` documents store essential context (`sheetId`, `tabName`) to avoid expensive "joins" during history display.
- **Index Optimization**: Composite indexes are in place for complex sorting (`syncedAt DESC`) combined with filters, preventing 403 index errors.
- **Emulator Usage**: Connection logic for emulators is properly gated by environment variables, allowing safe local development.

---

## 🟠 Architecture Improvements (Recommended)

### 1. Unified Database Strategy
- **Current**: Global configuration (semesters) is stored in **Realtime Database** (RTDB), while user data is in **Firestore**.
- **Impact**: Increased complexity in configuration and security rules.
- **Recommendation**: Move `configs/` to Firestore (`global_configs/semesters`). This allows you to use more powerful query capabilities and a single unified rule system.

### 2. Backend Role Reinforcement
- **Current**: Admin checks (in `AdminPage.tsx`) rely on a frontend-defined email list.
- **Impact**: A malicious user could bypass the frontend and write to the database if rules aren't strictly enforced based on roles.
- **Recommendation**: Use **Firebase Custom Claims** to attach an `admin: true` property to the user's JWT. This allows Security Rules to verify roles instantly without database lookups.

### 3. Move Logic to Services
- **Current**: Some Firestore logic is directly in `FirebaseContext.tsx`.
- **Recommendation**: Ensure ALL Firestore calls are encapsulated in service files (like `firestoreService.ts`) to make the UI components cleaner and easier to test.

---

## 🔴 Critical Issues (High Priority)

### 1. Missing Database Security Enforcement
- **Issue**: The `database.rules.json` (for RTDB) is not present in the repository. 
- **Risk**: If the `configs/` path in RTDB is open for writing to all authenticated users, any user could modify the global semester settings.
- **Fix**: Create and deploy rules that restrict `.write` to authorized admin UIDs only.

---

## 🛠️ Suggested Refactor Example

### Migration to Role-Based Rules (Firestore)

**Current Rules:**
```javascript
match /users/{userId}/mappings/{fileId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

**Proposed Refactor (Allowing Admins to Audit):**
```javascript
function isAdmin() {
  return request.auth.token.admin == true;
}

match /users/{userId}/mappings/{fileId} {
  // User can access their own, OR any admin can audit
  allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
}
```

### Unifying Configs in Firestore (Service Sample)
```typescript
// src/services/configService.ts refactor
export const configService = {
  fetchConfigs: async () => {
    const q = query(collection(db, "global_configs/semesters/list"), orderBy("order"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}
```

---

**Summary**: The project architecture is fundamentally sound and follows modern Firebase patterns. Strengthening the backend role enforcement and unifying the database stack are the next logical steps for a production-grade system.
