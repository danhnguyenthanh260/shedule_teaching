# 🏗️ Firebase Architecture Review

As requested by `@firebase-architecture-reviewer`, here is a deep dive into the Firebase implementation for the **Schedule Teaching** project, focusing on data modeling, security, and scalability.

## 📊 1. Data Modeling: Hybrid Stack

The project uses a hybrid approach with both **Cloud Firestore** and **Realtime Database (RTDB)**.

### Class: Cloud Firestore (User-Centric Data)
- **Pattern**: `users/{userId}/{sub-collection}/{documentId}`
- **Sub-collections**: `mappings`, `syncHistory`.
- **Review**: This is an excellent pattern for security and scalability. Sub-collections under a user document naturally isolate data and make Security Rules simple and efficient.
- **Scalability**: High. Firestore excels at this hierarchical data structure.

### Class: Realtime Database (App Configuration)
- **Path**: `configs/`
- **Usage**: Storing semester configurations (Sheet URLs, column mappings).
- **Review**: RTDB is used for global configuration that might need real-time synchronization. 
- **Recommendation**: Unless real-time "push" to all active users is critical for config changes, consider unifying this into Firestore to reduce complexity and have a single source of truth for security rules.

## 🔐 2. Security Rules Analysis

### Firestore Rules
- **Current Status**: Secure but basic. 
- **Feedback**: Protected user data well (`request.auth.uid == userId`). 
- **Gap**: There are no rules allowing "Admin" users to view or audit user data if needed for support.
- **Recommendation**: Implement role-based rules using a `roles` collection or Custom Claims.

### Realtime Database Rules
- **Current Status**: **Missing from source control**.
- **Risk**: High. If rules are default "Allow all with auth", any logged-in lecturer could theoretically delete semester configurations in the Admin Dashboard.
- **Action**: Create `database.rules.json` and restrict `.write` to authorized admin UIDs only.

## 🔑 3. Authentication & Role Management

- **Implementation**: Google SSO via `FirebaseContext.tsx`.
- **Role Detection**: Hardcoded in `src/config/admin.ts` (`ADMIN_EMAILS`).
- **Architectural Critique**: Hardcoding admin emails is fine for MVP, but brittle. 
- **Better Approach**: 
  1. Use **Firebase Custom Claims** for the `admin` flag. This allows you to check `request.auth.token.admin == true` directly in Security Rules.
  2. Implement a `roles` collection in Firestore and use a `get()` call in Rules to verify admin status.

## 📈 4. Performance & Scalability

- **Indexes**: `firestore.indexes.json` is correctly configured for `syncHistory` queries used in the app.
- **Cold Starts**: Not an issue for client-side Firebase SDK.
- **Bundling**: Firebase is initialized once in `config/firebase.ts`, ensuring a single connection instance across the app.

---

## 🚀 Summary of Recommendations

| Priority | Item | Description |
| :--- | :--- | :--- |
| 🔴 **Critical** | **Database Rules** | Add `database.rules.json` to source control and restrict `configs/` to Admins. |
| 🟠 **High** | **Role Logic** | Transition from hardcoded email lists to Custom Claims or a Firestore-based Role system. |
| 🟡 **Medium** | **Unify Docs** | Move "Semester Configs" from RTDB to Firestore to simplify the tech stack. |
| 🟢 **Low** | **Audit Log** | Use RTDB for a real-time sync log only, keeping persisting records in Firestore. |

**Reviewer Conclusion**: The architecture is solid and follows modern "User-centric" patterns. The biggest risk is the lack of backend-enforced admin roles and missing RTDB rules.
