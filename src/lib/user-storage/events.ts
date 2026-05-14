"use client";

export const USER_STORAGE_EVENT = "stockker:user-storage-updated";

export function notifyUserStorageUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(USER_STORAGE_EVENT));
}
