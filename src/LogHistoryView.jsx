import React, { useState, useMemo, useEffect } from "react";
import {
  loadLocalAuditLogs,
  exportAuditLogsToCSV,
  exportAuditLogsToJSON,
} from "./auditService";
import ManagementMenu from "./ManagementModals";

export default function LogHistoryView({
  user,
  seller,
  setSeller,
  setBuyer,
  onBackToInvoices,
  onBackToPacking,
  onBackToEditor,
  onDataChange,
}) {
  const uid = user?.uid || "";
  const [logs, setLogs] = useState(() => loadLocalAuditLogs(uid));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntityType, setSelectedEntityType] = useState("ALL"); // ALL | Invoice | Packing List
  const [selectedStatus, setSelectedStatus] = useState("ALL"); // ALL | Created | Modified | Deleted
  const [datePreset, setDatePreset] = useState("ALL"); // ALL | TODAY | YESTERDAY | LAST_7 | LAST_30 | CUSTOM
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState("NEWEST"); // NEWEST | OLDEST | ENTITY_ASC | ENTITY_DESC
  const [selectedLogForInspection, setSelectedLogForInspection] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Reload logs whenever uid or localStorage changes
  const reloadLogs = () => {
    const updated = loadLocalAuditLogs(uid);
    setLogs(updated);
    showToast("Audit logs refreshed");
  };

  useEffect(() => {
    const loaded = loadLocalAuditLogs(uid);
    setLogs(loaded);
  }, [uid]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Date filtering logic
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfLast7Days = startOfToday - 7 * 86400000;
  const startOfLast30Days = startOfToday - 30 * 86400000;

  // Filtered and sorted audit logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Text Search Filter (Actor, Entity ID, Summary, Customer)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesActor =
          log.user?.email?.toLowerCase().includes(q) ||
          log.user?.displayName?.toLowerCase().includes(q) ||
          log.user?.uid?.toLowerCase().includes(q);
        const matchesEntityId = log.entityId?.toLowerCase().includes(q);
        const matchesSummary = log.summary?.toLowerCase().includes(q);
        const matchesCustomer = log.details?.customerName?.toLowerCase().includes(q);
        if (!matchesActor && !matchesEntityId && !matchesSummary && !matchesCustomer) {
          return false;
        }
      }

      // 2. Entity Type Filter
      if (selectedEntityType !== "ALL" && log.entityType !== selectedEntityType) {
        return false;
      }

      // 3. Status Filter
      if (selectedStatus !== "ALL" && log.status !== selectedStatus) {
        return false;
      }

      // 4. Date Range Filter
      const logTime = log.timestampMs || new Date(log.timestamp).getTime();
      if (datePreset === "TODAY") {
        if (logTime < startOfToday) return false;
      } else if (datePreset === "YESTERDAY") {
        if (logTime < startOfYesterday || logTime >= startOfToday) return false;
      } else if (datePreset === "LAST_7") {
        if (logTime < startOfLast7Days) return false;
      } else if (datePreset === "LAST_30") {
        if (logTime < startOfLast30Days) return false;
      } else if (datePreset === "CUSTOM") {
        if (customDateFrom) {
          const fromTime = new Date(customDateFrom + "T00:00:00").getTime();
          if (logTime < fromTime) return false;
        }
        if (customDateTo) {
          const toTime = new Date(customDateTo + "T23:59:59.999").getTime();
          if (logTime > toTime) return false;
        }
      }

      return true;
    });
  }, [
    logs,
    searchQuery,
    selectedEntityType,
    selectedStatus,
    datePreset,
    customDateFrom,
    customDateTo,
    startOfToday,
    startOfYesterday,
    startOfLast7Days,
    startOfLast30Days,
  ]);

  const sortedLogs = useMemo(() => {
    const list = [...filteredLogs];
    list.sort((a, b) => {
      const timeA = a.timestampMs || new Date(a.timestamp).getTime();
      const timeB = b.timestampMs || new Date(b.timestamp).getTime();
      if (sortOrder === "NEWEST") return timeB - timeA;
      if (sortOrder === "OLDEST") return timeA - timeB;
      if (sortOrder === "ENTITY_ASC") return (a.entityId || "").localeCompare(b.entityId || "");
      if (sortOrder === "ENTITY_DESC") return (b.entityId || "").localeCompare(a.entityId || "");
      return 0;
    });
    return list;
  }, [filteredLogs, sortOrder]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(sortedLogs.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedLogs.slice(start, start + pageSize);
  }, [sortedLogs, currentPage, pageSize]);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedEntityType("ALL");
    setSelectedStatus("ALL");
    setDatePreset("ALL");
    setCustomDateFrom("");
    setCustomDateTo("");
    setSortOrder("NEWEST");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchQuery ||
    selectedEntityType !== "ALL" ||
    selectedStatus !== "ALL" ||
    datePreset !== "ALL" ||
    customDateFrom ||
    customDateTo ||
    sortOrder !== "NEWEST";

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let created = 0;
    let modified = 0;
    let deleted = 0;
    let invoices = 0;
    let packingLists = 0;

    logs.forEach((l) => {
      if (l.status === "Created") created++;
      else if (l.status === "Modified") modified++;
      else if (l.status === "Deleted") deleted++;

      if (l.entityType === "Packing List") packingLists++;
      else invoices++;
    });

    return {
      total: logs.length,
      created,
      modified,
      deleted,
      invoices,
      packingLists,
    };
  }, [logs]);

  // Formatting helpers
  const formatTimestamp = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    return { dateStr, timeStr };
  };

  const getRelativeTime = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Created":
        return {
          bg: "#e6f9f0",
          color: "#0e7041",
          border: "#b2ebd1",
          icon: "✨",
          label: "Created",
        };
      case "Modified":
        return {
          bg: "#eef4ff",
          color: "#1a4fa0",
          border: "#c8daf8",
          icon: "✏️",
          label: "Modified",
        };
      case "Deleted":
        return {
          bg: "#fff1f1",
          color: "#b3261e",
          border: "#f8c4c1",
          icon: "🗑️",
          label: "Deleted",
        };
      default:
        return {
          bg: "#f5f5f5",
          color: "#555",
          border: "#ddd",
          icon: "ℹ️",
          label: status,
        };
    }
  };

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        boxSizing: "border-box",
        background: "#f8f9fa",
        color: "#1c1c1c",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#1c1c1c",
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 9999,
            boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
            animation: "slideUp 0.25s ease-out",
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* Top Header Bar */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 32px",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "linear-gradient(135deg, #1c1c1c 0%, #3a3a3a 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
              }}
            >
              📜
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "-0.5px",
                    color: "#111827",
                  }}
                >
                  Log History & Audit Trail
                </h1>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: "#e6f9f0",
                    color: "#0e7041",
                    fontSize: 11,
                    fontWeight: 700,
                    border: "1px solid #b2ebd1",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#10b981",
                      display: "inline-block",
                    }}
                  />
                  Live Auditing
                </span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>
                Immutable enterprise audit records tracking Invoices and Packing Lists lifecycle events
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Quick Export Actions */}
            <button
              onClick={() => exportAuditLogsToCSV(sortedLogs)}
              disabled={!sortedLogs.length}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #d1d5db",
                borderRadius: 7,
                background: "#fff",
                color: sortedLogs.length ? "#374151" : "#9ca3af",
                cursor: sortedLogs.length ? "pointer" : "not-allowed",
              }}
              title="Export filtered records to CSV file"
            >
              📊 Export CSV
            </button>

            <button
              onClick={() => exportAuditLogsToJSON(sortedLogs)}
              disabled={!sortedLogs.length}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #d1d5db",
                borderRadius: 7,
                background: "#fff",
                color: sortedLogs.length ? "#374151" : "#9ca3af",
                cursor: sortedLogs.length ? "pointer" : "not-allowed",
              }}
              title="Export filtered records to JSON format"
            >
              📦 Export JSON
            </button>

            <button
              onClick={reloadLogs}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                border: "1px solid #d1d5db",
                borderRadius: 7,
                background: "#fff",
                color: "#1c1c1c",
                cursor: "pointer",
              }}
              title="Refresh audit logs from local cache & cloud"
            >
              🔄 Refresh
            </button>

            {/* Navigation Switchers */}
            <div style={{ height: 24, width: 1, background: "#e5e7eb", margin: "0 4px" }} />

            <button
              onClick={onBackToInvoices}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #1c1c1c",
                borderRadius: 7,
                background: "#1c1c1c",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              📄 Invoices List
            </button>

            <button
              onClick={onBackToPacking}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #d1d5db",
                borderRadius: 7,
                background: "#fff",
                color: "#1c1c1c",
                cursor: "pointer",
              }}
            >
              📦 Packing Lists
            </button>

            <button
              onClick={onBackToEditor}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #1a4fa0",
                borderRadius: 7,
                background: "#eef4ff",
                color: "#1a4fa0",
                cursor: "pointer",
              }}
            >
              ✏️ New / Editor
            </button>

            {/* Hamburger Management Menu */}
            <ManagementMenu
              uid={uid}
              sellers={seller}
              setSellers={setSeller}
              setBuyer={setBuyer}
              onPackingListClick={onBackToPacking}
              onInvoiceListClick={onBackToInvoices}
              onLogHistoryClick={() => {}}
              onDataChange={onDataChange}
            />
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ padding: "24px 32px 60px", maxWidth: 1600, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {/* KPI Metrics Dashboard Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* Card 1: Total Events */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 0.5 }}>
              Total Audited Events
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", marginTop: 4 }}>
              {metrics.total}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
              {metrics.invoices} Invoices · {metrics.packingLists} Packing Lists
            </div>
          </div>

          {/* Card 2: Created Events */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#0e7041", letterSpacing: 0.5 }}>
              Created Events
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0e7041", marginTop: 4 }}>
              {metrics.created}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              New documents generated
            </div>
          </div>

          {/* Card 3: Modified Events */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#1a4fa0", letterSpacing: 0.5 }}>
              Modified Events
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#1a4fa0", marginTop: 4 }}>
              {metrics.modified}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Revisions and content updates
            </div>
          </div>

          {/* Card 4: Deleted Events */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#b3261e", letterSpacing: 0.5 }}>
              Deleted Events
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#b3261e", marginTop: 4 }}>
              {metrics.deleted}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Purged / Deleted records
            </div>
          </div>
        </div>

        {/* High-Performance Search & Filter Toolbar */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 20,
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          {/* Top Row: Text Search + Entity Type + Status Filters */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
              alignItems: "end",
            }}
          >
            {/* Search Input */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#4b5563", marginBottom: 5 }}>
                SEARCH LOGS
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search by User, Doc #, Customer, or Summary..."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 34px 9px 12px",
                    fontSize: 13,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setCurrentPage(1);
                    }}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      border: "none",
                      background: "transparent",
                      color: "#9ca3af",
                      fontSize: 14,
                      cursor: "pointer",
                      padding: 4,
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Entity Type Filter */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#4b5563", marginBottom: 5 }}>
                ENTITY TYPE
              </label>
              <select
                value={selectedEntityType}
                onChange={(e) => {
                  setSelectedEntityType(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 12px",
                  fontSize: 13,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  outline: "none",
                  background: "#fff",
                  fontFamily: "inherit",
                }}
              >
                <option value="ALL">All Entity Types</option>
                <option value="Invoice">📄 Invoices</option>
                <option value="Packing List">📦 Packing Lists</option>
              </select>
            </div>

            {/* Status / Action Filter */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#4b5563", marginBottom: 5 }}>
                STATUS / ACTION
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 12px",
                  fontSize: 13,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  outline: "none",
                  background: "#fff",
                  fontFamily: "inherit",
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="Created">✨ Created</option>
                <option value="Modified">✏️ Modified</option>
                <option value="Deleted">🗑️ Deleted</option>
              </select>
            </div>

            {/* Date Range Presets */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#4b5563", marginBottom: 5 }}>
                DATE RANGE
              </label>
              <select
                value={datePreset}
                onChange={(e) => {
                  setDatePreset(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 12px",
                  fontSize: 13,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  outline: "none",
                  background: "#fff",
                  fontFamily: "inherit",
                }}
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today</option>
                <option value="YESTERDAY">Yesterday</option>
                <option value="LAST_7">Last 7 Days</option>
                <option value="LAST_30">Last 30 Days</option>
                <option value="CUSTOM">Custom Date Range...</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#4b5563", marginBottom: 5 }}>
                SORT BY
              </label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 12px",
                  fontSize: 13,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  outline: "none",
                  background: "#fff",
                  fontFamily: "inherit",
                }}
              >
                <option value="NEWEST">Timestamp: Newest First</option>
                <option value="OLDEST">Timestamp: Oldest First</option>
                <option value="ENTITY_ASC">Document ID: A → Z</option>
                <option value="ENTITY_DESC">Document ID: Z → A</option>
              </select>
            </div>
          </div>

          {/* Custom Date Range Pickers (shown when CUSTOM selected) */}
          {datePreset === "CUSTOM" && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px dashed #e5e7eb",
                display: "flex",
                gap: 16,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>From:</span>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => {
                    setCustomDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: "7px 10px",
                    fontSize: 13,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>To:</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => {
                    setCustomDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: "7px 10px",
                    fontSize: 13,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    outline: "none",
                  }}
                />
              </div>
            </div>
          )}

          {/* Active Filter Badges & Reset */}
          {hasActiveFilters && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid #f3f4f6",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Active Filters:</span>
                {searchQuery && (
                  <span
                    style={{
                      background: "#eef2ff",
                      color: "#4338ca",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Query: "{searchQuery}"
                  </span>
                )}
                {selectedEntityType !== "ALL" && (
                  <span
                    style={{
                      background: "#f3e8ff",
                      color: "#7e22ce",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Type: {selectedEntityType}
                  </span>
                )}
                {selectedStatus !== "ALL" && (
                  <span
                    style={{
                      background: "#fef3c7",
                      color: "#92400e",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Status: {selectedStatus}
                  </span>
                )}
                {datePreset !== "ALL" && (
                  <span
                    style={{
                      background: "#ecfdf5",
                      color: "#065f46",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Date: {datePreset === "CUSTOM" ? `${customDateFrom || "Start"} to ${customDateTo || "Now"}` : datePreset}
                  </span>
                )}
              </div>

              <button
                onClick={resetFilters}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#b3261e",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                Clear All Filters ✕
              </button>
            </div>
          )}
        </div>

        {/* Audit Log Table Container */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          {/* Table Header Info */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#fafafa",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              Showing {sortedLogs.length} audit {sortedLogs.length === 1 ? "record" : "records"}
              {sortedLogs.length !== logs.length && ` (filtered from ${logs.length} total)`}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  outline: "none",
                  background: "#fff",
                }}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Table View */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#4b5563",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  <th style={{ padding: "12px 16px", width: 170 }}>Timestamp</th>
                  <th style={{ padding: "12px 16px", width: 190 }}>User (Actor)</th>
                  <th style={{ padding: "12px 16px", width: 130 }}>Entity</th>
                  <th style={{ padding: "12px 16px", width: 160 }}>Document ID</th>
                  <th style={{ padding: "12px 16px", width: 120 }}>Status</th>
                  <th style={{ padding: "12px 16px" }}>Summary & Details</th>
                  <th style={{ padding: "12px 16px", width: 100, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: "60px 20px",
                        textAlign: "center",
                        color: "#9ca3af",
                      }}
                    >
                      <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#374151" }}>
                        No audit records found
                      </div>
                      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                        {hasActiveFilters
                          ? "Try adjusting your search criteria or date filters."
                          : "Audit records will automatically populate here as Invoices and Packing Lists are created, updated, or deleted."}
                      </div>
                      {hasActiveFilters && (
                        <button
                          onClick={resetFilters}
                          style={{
                            marginTop: 14,
                            padding: "7px 16px",
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: 6,
                            background: "#1c1c1c",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Clear Filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => {
                    const badge = getStatusBadge(log.status);
                    const { dateStr, timeStr } = formatTimestamp(log.timestamp);
                    const relTime = getRelativeTime(log.timestamp);
                    const isInvoice = log.entityType === "Invoice";

                    return (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                      >
                        {/* Timestamp Column */}
                        <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                          <div style={{ fontWeight: 600, color: "#111827" }}>{dateStr}</div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>
                            {timeStr} <span style={{ color: "#9ca3af" }}>({relTime})</span>
                          </div>
                        </td>

                        {/* User / Actor Column */}
                        <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "#e0e7ff",
                                color: "#3730a3",
                                fontSize: 11,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                textTransform: "uppercase",
                              }}
                            >
                              {(log.user?.email || "U")[0]}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: "#1f2937",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  maxWidth: 140,
                                }}
                                title={log.user?.email}
                              >
                                {log.user?.email?.split("@")[0] || log.user?.displayName || "User"}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#6b7280",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  maxWidth: 140,
                                }}
                                title={log.user?.email}
                              >
                                {log.user?.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Entity Type Column */}
                        <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: isInvoice ? "#f5f3ff" : "#fffbeb",
                              color: isInvoice ? "#6d28d9" : "#b45309",
                              border: `1px solid ${isInvoice ? "#ddd6fe" : "#fde68a"}`,
                            }}
                          >
                            {isInvoice ? "📄 Invoice" : "📦 Packing List"}
                          </span>
                        </td>

                        {/* Document ID Column */}
                        <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontWeight: 700,
                                color: "#111827",
                                fontSize: 13,
                              }}
                            >
                              {log.entityId || "N/A"}
                            </span>
                            {log.entityId && (
                              <button
                                onClick={() => copyToClipboard(log.entityId, log.id)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  color: copiedId === log.id ? "#10b981" : "#9ca3af",
                                  fontSize: 12,
                                  padding: 2,
                                }}
                                title="Copy Document ID"
                              >
                                {copiedId === log.id ? "✓" : "📋"}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Status Column */}
                        <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                            }}
                          >
                            <span>{badge.icon}</span>
                            {badge.label}
                          </span>
                        </td>

                        {/* Summary & Details Column */}
                        <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                          <div style={{ fontWeight: 500, color: "#1f2937", lineHeight: 1.4 }}>
                            {log.summary}
                          </div>
                          {log.details?.customerName && (
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                              👤 Customer: <strong>{log.details.customerName}</strong>
                              {log.details.totalAmount !== undefined && log.details.totalAmount !== "" && (
                                <span style={{ marginLeft: 10 }}>
                                  💰 Total: <strong>{log.details.currency || ""} {log.details.totalAmount}</strong>
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Actions Column */}
                        <td style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "right" }}>
                          <button
                            onClick={() => setSelectedLogForInspection(log)}
                            style={{
                              padding: "5px 10px",
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 5,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              color: "#374151",
                              cursor: "pointer",
                            }}
                            title="Inspect full audit record details"
                          >
                            Inspect 🔍
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({sortedLogs.length} items)
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 5,
                    border: "1px solid #d1d5db",
                    background: currentPage === 1 ? "#f3f4f6" : "#fff",
                    color: currentPage === 1 ? "#9ca3af" : "#374151",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  ← Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => (
                    <React.Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span style={{ padding: "4px 6px", color: "#9ca3af", fontSize: 12 }}>...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(p)}
                        style={{
                          padding: "5px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          borderRadius: 5,
                          border: `1px solid ${currentPage === p ? "#1c1c1c" : "#d1d5db"}`,
                          background: currentPage === p ? "#1c1c1c" : "#fff",
                          color: currentPage === p ? "#fff" : "#374151",
                          cursor: "pointer",
                        }}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 5,
                    border: "1px solid #d1d5db",
                    background: currentPage === totalPages ? "#f3f4f6" : "#fff",
                    color: currentPage === totalPages ? "#9ca3af" : "#374151",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detailed Audit Record Inspector Modal */}
      {selectedLogForInspection && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(2px)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setSelectedLogForInspection(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              width: "100%",
              maxWidth: 680,
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f9fafb",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827" }}>
                  Audit Event Details
                </h3>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  Log ID: <code style={{ color: "#374151" }}>{selectedLogForInspection.id}</code>
                </span>
              </div>
              <button
                onClick={() => setSelectedLogForInspection(null)}
                style={{
                  border: "none",
                  background: "#f3f4f6",
                  borderRadius: "50%",
                  width: 30,
                  height: 30,
                  fontSize: 14,
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: "20px 24px" }}>
              {/* Summary Banner */}
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: getStatusBadge(selectedLogForInspection.status).bg,
                  border: `1px solid ${getStatusBadge(selectedLogForInspection.status).border}`,
                  color: getStatusBadge(selectedLogForInspection.status).color,
                  fontWeight: 700,
                  fontSize: 14,
                  marginBottom: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{getStatusBadge(selectedLogForInspection.status).icon}</span>
                {selectedLogForInspection.summary}
              </div>

              {/* Grid of Key Properties */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                <div style={{ background: "#f9fafb", padding: 12, borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>TIMESTAMP (UTC / ISO)</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginTop: 2 }}>
                    {selectedLogForInspection.timestamp}
                  </div>
                </div>

                <div style={{ background: "#f9fafb", padding: 12, borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>LOCAL DATE & TIME</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginTop: 2 }}>
                    {new Date(selectedLogForInspection.timestamp).toLocaleString()}
                  </div>
                </div>

                <div style={{ background: "#f9fafb", padding: 12, borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>ACTOR USER</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginTop: 2 }}>
                    {selectedLogForInspection.user?.email || "N/A"}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    UID: {selectedLogForInspection.user?.uid || "N/A"}
                  </div>
                </div>

                <div style={{ background: "#f9fafb", padding: 12, borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>DOCUMENT NUMBER / ID</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a4fa0", marginTop: 2, fontFamily: "monospace" }}>
                    {selectedLogForInspection.entityId}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    Type: {selectedLogForInspection.entityType}
                  </div>
                </div>
              </div>

              {/* Extended Details / Metadata */}
              {selectedLogForInspection.details && Object.keys(selectedLogForInspection.details).length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                    Additional Metadata & Payload Context:
                  </div>
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                      padding: 12,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {Object.entries(selectedLogForInspection.details).map(([key, value]) => {
                        if (typeof value === "object" && value !== null) return null;
                        return (
                          <div key={key}>
                            <span style={{ color: "#64748b", fontWeight: 600 }}>{key}: </span>
                            <span style={{ color: "#0f172a", fontWeight: 700 }}>{String(value)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Raw JSON Payload */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Raw Audit Record (JSON):</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedLogForInspection, null, 2));
                      showToast("JSON payload copied!");
                    }}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      border: "none",
                      background: "transparent",
                      color: "#1a4fa0",
                      cursor: "pointer",
                    }}
                  >
                    Copy JSON 📋
                  </button>
                </div>
                <pre
                  style={{
                    background: "#1e293b",
                    color: "#f8fafc",
                    padding: 14,
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontFamily: "monospace",
                    overflowX: "auto",
                    margin: 0,
                  }}
                >
                  {JSON.stringify(selectedLogForInspection, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "flex-end",
                background: "#f9fafb",
              }}
            >
              <button
                onClick={() => setSelectedLogForInspection(null)}
                style={{
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
