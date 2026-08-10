# Tradie Profile Improvements - Testing Checklist

> **Historical manual QA checklist — not current automated-test or launch approval status.**
>
> This document is preserved as a manual testing guide from an earlier profile-improvements pass. Current automated tests and Taskio tracker acceptance criteria take precedence over any implication that these boxes are currently complete.
>
> Product wording today is **Client / Expert**. This checklist retains legacy **tradie / homeowner** labels where they match historical routes, roles, and field names (including real bnLocked coverage).
>
> Three identical copies of the checklist previously existed in this file; only one canonical copy is retained.
## ✅ Manual Testing Checklist

### A) Photo Upload Tests

#### 1. Valid Image Upload (JPEG)
- [ ] Navigate to `/profile` as a tradie
- [ ] Click "Change photo" button
- [ ] Select a valid JPEG image < 3MB
- [ ] Verify instant preview appears
- [ ] Verify progress percentage updates (0% → 100%)
- [ ] Verify button shows "Uploading X%..." during upload
- [ ] Verify success toast: "Photo updated successfully!"
- [ ] Verify avatar updates immediately after upload
- [ ] Refresh page - verify photo persists

#### 2. Valid Image Upload (PNG)
- [ ] Click "Change photo" again
- [ ] Select a valid PNG image < 3MB
- [ ] Verify upload completes successfully
- [ ] Verify PNG replaces previous JPEG
- [ ] Check Firebase Storage: verify file is at `profile-images/{uid}.png`

#### 3. File Size Rejection (> 3MB)
- [ ] Click "Change photo"
- [ ] Select an image > 3MB
- [ ] Verify error message: "Image must be less than 3MB."
- [ ] Verify button returns to "Change photo" (not stuck on "Uploading...")
- [ ] Verify no file uploaded to Storage

#### 4. File Type Rejection (Non-Image)
- [ ] Click "Change photo"
- [ ] Try to select a PDF or other non-image file
- [ ] Verify error message: "Only JPEG and PNG images are supported."
- [ ] Verify no upload initiated

#### 5. No "Uploading..." Stuck State
- [ ] Simulate network failure (disable WiFi mid-upload)
- [ ] Verify error message appears
- [ ] Verify button returns to "Change photo" state
- [ ] Re-enable network and try again - should work

---

### B) Bio / Tagline Tests

#### 1. Valid Bio Entry
- [ ] Navigate to "Public Profile" section
- [ ] Enter bio text (e.g., "Reliable handyman with 10+ years experience")
- [ ] Verify character counter shows: "45/250"
- [ ] Click "Save changes"
- [ ] Verify success toast: "Profile updated successfully!"
- [ ] Refresh page - verify bio persists

#### 2. Bio Character Limit
- [ ] Enter exactly 250 characters in bio
- [ ] Verify counter shows "250/250"
- [ ] Verify "Save changes" button is enabled
- [ ] Try to type more characters
- [ ] Verify input stops at 250 chars (maxLength enforcement)

#### 3. Bio Over Limit Validation
- [ ] Manually paste 300 characters into bio
- [ ] Verify counter shows "300/250" in red color
- [ ] Verify "Save changes" button is disabled
- [ ] Reduce to 250 characters
- [ ] Verify button re-enables

#### 4. Bio HTML Sanitization
- [ ] Enter bio with HTML: `<script>alert('test')</script> Reliable handyman`
- [ ] Click "Save changes"
- [ ] Refresh page and check bio value
- [ ] Verify HTML tags are stripped: "Reliable handyman"
- [ ] Check Firestore document - verify no HTML in bio field

---

### C) ABN Locking Tests

#### 1. Unlocked ABN (Default State)
- [ ] Navigate to "Private Details" section
- [ ] Verify ABN field is editable
- [ ] Verify no "🔒 Locked" label
- [ ] Verify hint: "Not shown publicly. Used for verification and tax purposes."
- [ ] Enter/update ABN value
- [ ] Click "Save changes"
- [ ] Verify ABN saves successfully

#### 2. Locked ABN (Admin-Set)
- [ ] Using Firebase Console or Admin SDK:
  - Set `abnLocked: true` on a tradie user document
- [ ] Refresh `/profile` page
- [ ] Verify ABN field shows "🔒 Locked" label
- [ ] Verify ABN field is read-only (grayed out, disabled)
- [ ] Verify hint: "To change your ABN, please contact support."
- [ ] Try to edit ABN field - should not allow input
- [ ] Change other fields (name, bio, phone)
- [ ] Click "Save changes"
- [ ] Verify other fields save but ABN remains unchanged

#### 3. Client-Side ABN Lock Prevention
- [ ] Open browser DevTools Console
- [ ] Try to manipulate form: `document.querySelector('[placeholder="ABN"]').disabled = false`
- [ ] Try to edit ABN value
- [ ] Click "Save changes"
- [ ] Verify error: "ABN is locked. Please contact support to change it."
- [ ] Check Firestore - verify ABN value did NOT change

---

### D) Public vs Private Profile Sections

#### 1. Tradie Profile Sections
- [ ] Log in as a tradie
- [ ] Navigate to `/profile`
- [ ] Verify "🌐 Public Profile" section exists with label "Homeowners see this"
- [ ] Verify fields in Public Profile:
  - Profile photo
  - Display name
  - Business name (optional)
  - Bio/tagline (optional) with character counter
  - Verification badge
- [ ] Verify "🔒 Private Details" section exists with label "Only you see this"
- [ ] Verify fields in Private Details:
  - Display name
  - Email (read-only)
  - Phone (optional, private)
  - ABN (optional, private)
  - Member since (read-only)

#### 2. Homeowner Profile (No Public Section)
- [ ] Log in as a homeowner
- [ ] Navigate to `/profile`
- [ ] Verify NO "Public Profile" section
- [ ] Verify only "Your Details" section
- [ ] Verify no bio field for homeowners

---

### E) Firestore Security Rules Tests

#### 1. Allowed Field Updates
- [ ] Log in as a tradie
- [ ] Update: displayName, phone, businessName, bio, profilePhotoURL
- [ ] Click "Save changes"
- [ ] Verify all changes save successfully
- [ ] Check Firestore - verify fields updated

#### 2. Blocked Field Updates (Privilege Escalation)
- [ ] Open browser DevTools Console
- [ ] Try to set `verified: true` via client SDK:
  ```js
  firebase.firestore().doc('users/{yourUid}').update({ verified: true })
  ```
- [ ] Verify Firestore rejects with permission error
- [ ] Check Firestore document - verify `verified` field unchanged

#### 3. ABN Lock Enforcement (Server-Side)
- [ ] With `abnLocked: true` set in Firestore
- [ ] Try to update ABN via DevTools Console:
  ```js
  firebase.firestore().doc('users/{yourUid}').update({ abn: '12345' })
  ```
- [ ] Verify Firestore rejects with permission error
- [ ] Check Firestore - verify ABN unchanged

#### 4. Field Length Validation
- [ ] Try to save displayName > 80 characters via client
- [ ] Verify error from Firestore rules (or client validation)
- [ ] Try to save bio > 250 characters
- [ ] Verify rejection
- [ ] Try to save ABN > 30 characters
- [ ] Verify rejection

---

### F) Storage Security Rules Tests

#### 1. Own Profile Image Upload
- [ ] Log in as user A (uid: `userA`)
- [ ] Upload a profile image
- [ ] Check Storage: verify file at `profile-images/userA.jpg`
- [ ] Verify upload succeeds

#### 2. Cannot Upload to Other User's Path
- [ ] Still logged in as user A
- [ ] Try to upload to `profile-images/userB.jpg` via DevTools:
  ```js
  const ref = firebase.storage().ref('profile-images/userB.jpg');
  ref.put(file);
  ```
- [ ] Verify Storage rejects with permission error

#### 3. File Size Limit (3MB Max)
- [ ] Try to upload 3.1MB image
- [ ] Verify Storage rejects (or client prevents)
- [ ] Upload 2.9MB image
- [ ] Verify succeeds

#### 4. Content Type Restriction (JPEG/PNG Only)
- [ ] Try to upload a GIF via DevTools/API
- [ ] Verify Storage rejects
- [ ] Try to upload SVG
- [ ] Verify Storage rejects

---

### G) UX/Feedback Tests

#### 1. Success Toast Display
- [ ] Make any profile change
- [ ] Click "Save changes"
- [ ] Verify green success toast appears: "Profile updated successfully!"
- [ ] Verify toast disappears after ~3 seconds
- [ ] Make photo change
- [ ] Verify toast: "Photo updated successfully!"

#### 2. Error State Display
- [ ] Enter invalid phone (e.g., "abc123")
- [ ] Click "Save changes"
- [ ] Verify error banner appears with helpful message
- [ ] Fix phone number
- [ ] Verify error clears on successful save

#### 3. Busy/Loading States
- [ ] Click "Save changes"
- [ ] Verify button shows "Saving..." (disabled)
- [ ] Wait for completion
- [ ] Verify button returns to "Save changes" (enabled)
- [ ] Click "Change photo"
- [ ] During upload, verify button shows "Uploading X%..." (disabled)
- [ ] Verify button returns to "Change photo" after completion

#### 4. Instant Preview (Photo)
- [ ] Click "Change photo"
- [ ] Select image
- [ ] Verify preview appears immediately in avatar circle
- [ ] Wait for upload to complete
- [ ] Verify no visual flicker or duplicate network call

---

### H) Public Profile Helper Tests

#### 1. getPublicUserProfile() Function
- [ ] In browser console, import helper:
  ```js
  import { getPublicUserProfile } from './utils/publicProfile.js';
  ```
- [ ] Mock a full user document:
  ```js
  const fullUser = {
    uid: 'test123',
    displayName: 'John Smith',
    email: 'john@example.com',
    phone: '0412345678',
    abn: '12345678901',
    profilePhotoURL: 'https://...',
    bio: 'Reliable handyman',
    businessName: 'Smith Home Services',
    role: 'tradie',
    verified: true
  };
  const publicProfile = getPublicUserProfile(fullUser);
  console.log(publicProfile);
  ```
- [ ] Verify output includes ONLY:
  - uid, displayName, profilePhotoURL, bio, businessName, role, isVerified
- [ ] Verify output does NOT include:
  - email, phone, abn, abnLocked

---

### I) Danger Zone Tests

#### 1. Updated Copy
- [ ] Scroll to "Danger zone" section
- [ ] Verify copy: "Account deletion permanently removes your profile and disables payouts. Please contact support to proceed."
- [ ] Verify "Delete account" button is disabled
- [ ] Hover over button - verify tooltip: "Contact support to delete your account"

---

## ✅ Automated Test Scenarios (Future)

### Unit Tests (Jest)
- [ ] `sanitizeBio()` strips HTML tags correctly
- [ ] `validatePhone()` accepts valid AU formats
- [ ] `getPublicUserProfile()` excludes private fields
- [ ] Character counters calculate correctly

### Integration Tests (Cypress/Playwright)
- [ ] Profile photo upload flow end-to-end
- [ ] Bio character limit enforcement
- [ ] ABN lock prevents editing
- [ ] Success toasts appear and disappear

### Security Tests
- [ ] Firestore rules prevent privilege escalation
- [ ] Storage rules prevent cross-user uploads
- [ ] ABN lock cannot be bypassed client-side

---

## 📋 Test Summary

**Priority 1 (Must Pass)**
- Photo upload completes without "stuck" state
- File type/size validation works
- ABN lock prevents editing when locked
- No privilege escalation (verified, role, admin)

**Priority 2 (Should Pass)**
- Bio character counter accurate
- Public vs private sections correct
- Success/error feedback clear
- Profile persists after refresh

**Priority 3 (Nice to Have)**
- Progress % updates smoothly
- Preview loads instantly
- Toast timing feels right
- Hover states work

---

## 🐛 Known Issues to Watch For

1. **"Uploading..." stuck state**: If upload fails, button must return to "Change photo"
2. **ABN lock bypass**: Ensure server-side rules block ANY client ABN update when locked
3. **HTML in bio**: Ensure `sanitizeBio()` is called server-side (or stored as plain text)
4. **Large file hang**: 3MB limit should reject quickly, not timeout
5. **Privilege escalation**: DevTools cannot set `verified`, `role`, `abnLocked` fields

---

## 🎯 Success Criteria

✅ **All Priority 1 tests pass**  
✅ **No infinite loading states**  
✅ **No permission errors for valid operations**  
✅ **No security bypasses via DevTools**  
✅ **Photo upload reliable (<5 seconds for 2MB image)**  
✅ **Bio/ABN validation works client + server**

---

**Test Date**: _____________  
**Tested By**: _____________  
**Environment**: Dev / Staging / Production  
**Result**: Pass / Fail / Blocked
