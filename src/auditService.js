import { doc, collection, addDoc, setDoc, getDocs, query, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

/**
 * Canonical Audit Log Schema:
 * {
 *   id: string,
 *   timestamp: string (ISO 8601),
 *   timestampMs: number,
 *   user: {
 *     uid: string,
 *     email: string,
 *     displayName: string
 *   },
 *   entityType: "Invoice" | "Packing List",
 *   entityId: string, // Document / Invoice / Ref Number
 *   status: "Created" | "Modified" | "Deleted",
 *   summary: string,
 *   details: {
 *     customerName?: string,
 *     totalAmount?: number | string,
 *     currency?: string,
 *     itemsCount?: number,
 *     totalWeight?: number | string,
 *     source?: string,
 *     [key: string]: any
 *   }
 * }
 */

const AUDIT_STORAGE_KEY = "easyinvoice_audit_logs";

function getAuditKey(uid) {
  return (uid || "anon") + "_" + AUDIT_STORAGE_KEY;
}

/**
 * Load cached audit logs from localStorage for instant sub-millisecond retrieval.
 */
export function loadLocalAuditLogs(uid) {
  try {
    const raw = localStorage.getItem(getAuditKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to load local audit logs:", err);
    return [];
  }
}

/**
 * Save audit logs to localStorage.
 */
export function saveLocalAuditLogs(uid, logs) {
  try {
    const capped = (Array.isArray(logs) ? logs : []).slice(0, 500); // retain up to 500 latest entries locally
    localStorage.setItem(getAuditKey(uid), JSON.stringify(capped));
    return capped;
  } catch (err) {
    console.warn("Failed to save local audit logs:", err);
    return logs;
  }
}

/**
 * Record an audit lifecycle event.
 * Non-blocking and failsafe — never disrupts user workflows.
 */
export async function recordAuditLog({
  entityType,
  entityId,
  status,
  summary,
  details = {},
  user = null,
}) {
  try {
    const currentUser = user || auth.currentUser;
    const actorUid = currentUser?.uid || "system";
    const actorEmail = currentUser?.email || "anonymous@easyinvoice.local";
    const actorName = currentUser?.displayName || actorEmail.split("@")[0] || "User";

    const cleanEntityId = String(entityId || "UNKNOWN").trim();
    const now = new Date();
    const isoTimestamp = now.toISOString();
    const timestampMs = now.getTime();
    const logId = `log_${timestampMs}_${Math.random().toString(36).substring(2, 9)}`;

    // Build human-friendly summary if not explicitly provided
    const computedSummary =
      summary ||
      `${status} ${entityType} "${cleanEntityId}"${
        details.customerName ? ` for ${details.customerName}` : ""
      }${details.totalAmount !== undefined && details.totalAmount !== "" ? ` (${details.currency || ""} ${details.totalAmount})` : ""}`;

    const logEntry = {
      id: logId,
      timestamp: isoTimestamp,
      timestampMs,
      user: {
        uid: actorUid,
        email: actorEmail,
        displayName: actorName,
      },
      entityType: entityType === "Packing List" ? "Packing List" : "Invoice",
      entityId: cleanEntityId,
      status: ["Created", "Modified", "Deleted"].includes(status) ? status : "Modified",
      summary: computedSummary,
      details: {
        ...details,
        source: details.source || "Web Application",
      },
    };

    // 1. Immediately store in local cache for instant UI availability
    const currentLogs = loadLocalAuditLogs(actorUid);
    const updatedLogs = [logEntry, ...currentLogs.filter((l) => l.id !== logId)];
    saveLocalAuditLogs(actorUid, updatedLogs);

    // 2. Persist to Firestore asynchronously
    if (actorUid && actorUid !== "system") {
      try {
        // Dual-write: write to user-scoped audit collection and audit document
        const userLogDocRef = doc(db, "user_data", actorUid, "audit_logs", logId);
        setDoc(userLogDocRef, {
          ...logEntry,
          serverCreatedAt: serverTimestamp(),
        }).catch((err) => {
          console.warn("Firestore audit subcollection write warning:", err);
        });

        // Also update the aggregate audit array on user_data for real-time synchronization
        const userDocRef = doc(db, "user_data", actorUid);
        setDoc(
          userDocRef,
          {
            [AUDIT_STORAGE_KEY]: updatedLogs.slice(0, 100),
          },
          { merge: true }
        ).catch((err) => {
          console.warn("Firestore audit aggregate write warning:", err);
        });
      } catch (firestoreErr) {
        console.warn("Firestore audit logging non-fatal error:", firestoreErr);
      }
    }

    return logEntry;
  } catch (err) {
    console.error("Critical error in recordAuditLog:", err);
    return null;
  }
}

/**
 * Export audit logs to CSV formatted file.
 */
export function exportAuditLogsToCSV(logs) {
  if (!logs || !logs.length) return "";

  const headers = [
    "Log ID",
    "Timestamp (ISO)",
    "Date & Time (Local)",
    "User Email",
    "User UID",
    "Entity Type",
    "Entity ID / Doc Number",
    "Action / Status",
    "Summary",
    "Customer / Buyer",
    "Amount",
    "Currency",
    "Items Count",
    "Source",
  ];

  const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = logs.map((log) => {
    const dt = new Date(log.timestamp);
    const localDate = isNaN(dt.getTime()) ? log.timestamp : dt.toLocaleString();
    return [
      escapeCSV(log.id),
      escapeCSV(log.timestamp),
      escapeCSV(localDate),
      escapeCSV(log.user?.email || ""),
      escapeCSV(log.user?.uid || ""),
      escapeCSV(log.entityType),
      escapeCSV(log.entityId),
      escapeCSV(log.status),
      escapeCSV(log.summary),
      escapeCSV(log.details?.customerName || ""),
      escapeCSV(log.details?.totalAmount || ""),
      escapeCSV(log.details?.currency || ""),
      escapeCSV(log.details?.itemsCount ?? ""),
      escapeCSV(log.details?.source || ""),
    ].join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `easyinvoice_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export audit logs to JSON file.
 */
export function exportAuditLogsToJSON(logs) {
  if (!logs || !logs.length) return;
  const jsonContent = JSON.stringify(logs, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `easyinvoice_audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
