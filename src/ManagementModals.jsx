import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";

const LS = {
  company: "easyinvoice_company",
  customers: "easyinvoice_customers",
  currencies: "easyinvoice_currencies",
  loadingLocs: "easyinvoice_loadingLocs",
  finalDests: "easyinvoice_finalDests",
  origins: "easyinvoice_origins",
  paymentTerms: "easyinvoice_paymentTerms",
  itemNames: "easyinvoice_itemNames",
  qtyUnits: "easyinvoice_qtyUnits",
  banks: "easyinvoice_banks",
};

function load(key) {
  try { return JSON.parse(localStorage.getItem(pfx(key))) || []; } catch { return []; }
}
function save(key, data) {
  localStorage.setItem(pfx(key), JSON.stringify(data));
}

const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const modalBox = {
  background: "#fff", borderRadius: 12, padding: 24, maxWidth: 520,
  width: "90%", maxHeight: "80vh", overflow: "auto",
};
const inputStyle = {
  display: "block", width: "100%", marginTop: 3, padding: "6px 8px",
  fontSize: 13, border: "1px solid #d4d4d4", borderRadius: 5,
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  marginBottom: 8,
};
const btn = (bg, extra) => ({
  padding: "7px 16px", fontSize: 12, fontWeight: 600, border: "none",
  borderRadius: 5, background: bg, color: "#fff", ...extra,
});

/* ============ Manage Company Details ============ */
function CompanyModal({ onClose, onApply }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(pfx(LS.company))) || {}; } catch { return {}; } })();
  const [form, setForm] = useState({ name: saved.name || "", addr1: saved.addr1 || "", addr2: saved.addr2 || "", contact: saved.contact || "", email: saved.email || "", trn: saved.trn || "" });

  const [banksList, setBanksList] = useState(() => {
    try { return JSON.parse(localStorage.getItem(pfx(LS.banks))) || []; } catch { return []; }
  });
  const [bankForm, setBankForm] = useState({ accName: "", bankName: "", accNo: "", iban: "", swift: "", address: "" });
  const [editingBankIdx, setEditingBankIdx] = useState(null);

  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const setBankField = (k) => (v) => setBankForm({ ...bankForm, [k]: v });

  const addBank = () => {
    if (!bankForm.accName.trim() || !bankForm.bankName.trim() || !bankForm.accNo.trim()) {
      alert("Account Name, Bank Name, and Account No are required.");
      return;
    }
    let next;
    if (editingBankIdx !== null) {
      next = [...banksList];
      next[editingBankIdx] = bankForm;
      setEditingBankIdx(null);
    } else {
      next = [...banksList, bankForm];
    }
    setBanksList(next);
    setBankForm({ accName: "", bankName: "", accNo: "", iban: "", swift: "", address: "" });
  };

  const deleteBank = (idx) => {
    const pw = prompt("Enter password 'abcd' to delete this bank account:");
    if (pw !== "abcd") {
      if (pw !== null) alert("Wrong password!");
      return;
    }
    const next = banksList.filter((_, i) => i !== idx);
    setBanksList(next);
    if (editingBankIdx === idx) {
      setBankForm({ accName: "", bankName: "", accNo: "", iban: "", swift: "", address: "" });
      setEditingBankIdx(null);
    }
  };

  const handleSave = () => {
    let finalBanks = [...banksList];
    if (bankForm.accName.trim() && bankForm.bankName.trim() && bankForm.accNo.trim()) {
      if (editingBankIdx !== null) {
        finalBanks[editingBankIdx] = bankForm;
      } else {
        finalBanks.push(bankForm);
      }
    }
    localStorage.setItem(pfx(LS.company), JSON.stringify(form));
    localStorage.setItem(pfx(LS.banks), JSON.stringify(finalBanks));
    onApply(form);
    onClose();
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, maxWidth: 540 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800 }}>Manage Company Details</h3>
        <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Name</label>
        <input style={inputStyle} value={form.name} onChange={(e) => set("name")(e.target.value)} />
        <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Address Line 1</label>
        <input style={inputStyle} value={form.addr1} onChange={(e) => set("addr1")(e.target.value)} />
        <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Address Line 2</label>
        <input style={inputStyle} value={form.addr2} onChange={(e) => set("addr2")(e.target.value)} />
        <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Contact</label>
        <input style={inputStyle} value={form.contact} onChange={(e) => set("contact")(e.target.value)} />
        <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Email</label>
        <input style={inputStyle} value={form.email} onChange={(e) => set("email")(e.target.value)} />
        <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>TRN VAT</label>
        <input style={inputStyle} value={form.trn} onChange={(e) => set("trn")(e.target.value)} />

        <hr style={{ margin: "20px 0", border: "0", borderTop: "1px solid #e8e8e8" }} />
        
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#1c1c1c" }}>Manage Bank Accounts</h4>
        
        <div style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 12, marginBottom: 12, background: "#fafafa" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{editingBankIdx !== null ? "Edit Bank Account" : "Add Bank Account"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: "#6b6b6b", fontWeight: 600 }}>Account Name</label>
              <input style={inputStyle} value={bankForm.accName} onChange={(e) => setBankField("accName")(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#6b6b6b", fontWeight: 600 }}>Bank Name</label>
              <input style={inputStyle} value={bankForm.bankName} onChange={(e) => setBankField("bankName")(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#6b6b6b", fontWeight: 600 }}>Account No</label>
              <input style={inputStyle} value={bankForm.accNo} onChange={(e) => setBankField("accNo")(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#6b6b6b", fontWeight: 600 }}>IBAN No</label>
              <input style={inputStyle} value={bankForm.iban} onChange={(e) => setBankField("iban")(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#6b6b6b", fontWeight: 600 }}>Swift No</label>
              <input style={inputStyle} value={bankForm.swift} onChange={(e) => setBankField("swift")(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#6b6b6b", fontWeight: 600 }}>Address</label>
              <input style={inputStyle} value={bankForm.address} onChange={(e) => setBankField("address")(e.target.value)} />
            </div>
          </div>
          <button style={btn("#1c1c1c", { marginTop: 4, width: "100%" })} onClick={addBank}>
            {editingBankIdx !== null ? "Update Bank" : "+ Add Bank"}
          </button>
        </div>

        {banksList.map((bk, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "1px solid #eee", borderRadius: 6, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{bk.bankName}</div>
              <div style={{ fontSize: 11, color: "#666" }}>Acc: {bk.accNo} · Name: {bk.accName}</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={{ padding: "4px 8px", fontSize: 10, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff" }} onClick={() => { setBankForm(bk); setEditingBankIdx(i); }}>Edit</button>
              <button style={{ padding: "4px 6px", fontSize: 10, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff", color: "#b3261e" }} onClick={() => deleteBank(i)}>Del</button>
            </div>
          </div>
        ))}
        {banksList.length === 0 && <p style={{ color: "#888", fontSize: 11, margin: "5px 0" }}>No saved bank accounts yet.</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button style={btn("#1c1c1c")} onClick={handleSave}>Save All</button>
          <button style={{ ...btn("#888"), background: "#fff", color: "#333", border: "1px solid #d4d4d4" }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ============ Manage Customers ============ */
function CustomersModal({ onClose, onSelect }) {
  const [list, setList] = useState(() => load(LS.customers));
  const [editing, setEditing] = useState(null);

  const empty = { name: "", addr1: "", addr2: "", taxType: "GST", taxNumber: "", gst: "", trn: "", pan: "", contact: "", email: "" };
  const [form, setForm] = useState(empty);
  const set = (k) => (v) => setForm({ ...form, [k]: v });

  const addCustomer = () => {
    const isTrn = (form.taxType || (form.trn ? "TRN" : "GST")) === "TRN";
    const taxVal = (form.taxNumber !== undefined ? form.taxNumber : (isTrn ? form.trn : form.gst)) || "";
    const customerToSave = {
      ...form,
      taxType: isTrn ? "TRN" : "GST",
      trn: isTrn ? taxVal : "",
      gst: isTrn ? "" : taxVal,
      taxNumber: taxVal,
    };
    if (editing !== null) {
      const next = [...list];
      next[editing] = customerToSave;
      setList(next);
      save(LS.customers, next);
    } else {
      const next = [...list, customerToSave];
      setList(next);
      save(LS.customers, next);
    }
    setForm(empty);
    setEditing(null);
  };

  const editCustomer = (i) => {
    const c = list[i];
    const isTrn = c.taxType === "TRN" || (!!c.trn && !c.gst);
    const taxVal = isTrn ? (c.trn || c.gst || c.taxNumber || "") : (c.gst || c.trn || c.taxNumber || "");
    setForm({
      ...c,
      taxType: isTrn ? "TRN" : "GST",
      taxNumber: taxVal,
      trn: isTrn ? taxVal : "",
      gst: isTrn ? "" : taxVal,
    });
    setEditing(i);
  };
  const deleteCustomer = (i) => {
    const pw = prompt("Enter password 'abcd' to delete this customer:");
    if (pw !== "abcd") {
      if (pw !== null) alert("Wrong password!");
      return;
    }
    const next = list.filter((_, idx) => idx !== i);
    setList(next);
    save(LS.customers, next);
    if (editing === i) { setForm(empty); setEditing(null); }
  };
  const selectCustomer = (c) => { onSelect(c); onClose(); };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, maxWidth: 560 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800 }}>Manage Customers</h3>

        {/* Form */}
        <div style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Name</label><input style={inputStyle} value={form.name} onChange={(e) => set("name")(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Address Line 1</label><input style={inputStyle} value={form.addr1} onChange={(e) => set("addr1")(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Address Line 2</label><input style={inputStyle} value={form.addr2} onChange={(e) => set("addr2")(e.target.value)} /></div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>
                  {form.taxType === "TRN" ? "TRN" : "GST"}
                </label>
                <div style={{ display: "inline-flex", background: "#f0f0f0", borderRadius: 4, padding: 1 }}>
                  <button
                    type="button"
                    onClick={() => {
                      const val = form.taxNumber !== undefined ? form.taxNumber : (form.taxType === "TRN" ? form.trn : form.gst);
                      setForm({ ...form, taxType: "GST", gst: val, trn: "", taxNumber: val });
                    }}
                    style={{
                      border: "none",
                      padding: "1px 6px",
                      fontSize: 9,
                      fontWeight: 700,
                      borderRadius: 3,
                      cursor: "pointer",
                      background: form.taxType !== "TRN" ? "#1c1c1c" : "transparent",
                      color: form.taxType !== "TRN" ? "#fff" : "#666",
                    }}
                  >
                    GST
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const val = form.taxNumber !== undefined ? form.taxNumber : (form.taxType === "TRN" ? form.trn : form.gst);
                      setForm({ ...form, taxType: "TRN", trn: val, gst: "", taxNumber: val });
                    }}
                    style={{
                      border: "none",
                      padding: "1px 6px",
                      fontSize: 9,
                      fontWeight: 700,
                      borderRadius: 3,
                      cursor: "pointer",
                      background: form.taxType === "TRN" ? "#1c1c1c" : "transparent",
                      color: form.taxType === "TRN" ? "#fff" : "#666",
                    }}
                  >
                    TRN
                  </button>
                </div>
              </div>
              <input
                style={inputStyle}
                placeholder={`Enter ${form.taxType === "TRN" ? "TRN" : "GST"} number`}
                value={form.taxNumber !== undefined ? form.taxNumber : (form.taxType === "TRN" ? form.trn : form.gst) || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (form.taxType === "TRN") {
                    setForm({ ...form, taxNumber: v, trn: v, gst: "" });
                  } else {
                    setForm({ ...form, taxNumber: v, gst: v, trn: "" });
                  }
                }}
              />
            </div>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>PAN</label><input style={inputStyle} value={form.pan} onChange={(e) => set("pan")(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Contact</label><input style={inputStyle} value={form.contact} onChange={(e) => set("contact")(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Email</label><input style={inputStyle} value={form.email} onChange={(e) => set("email")(e.target.value)} /></div>
          </div>
          <button style={btn("#1c1c1c")} onClick={addCustomer}>{editing !== null ? "Update" : "+ Add"} Customer</button>
        </div>

        {/* Customer list */}
        {list.map((c, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name || "Unnamed"}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{c.addr1}{c.addr1 && ", "}{c.addr2}</div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                {[
                  (c.taxType === "TRN" || (c.trn && !c.gst)) ? (c.trn || c.gst ? `TRN: ${c.trn || c.gst}` : "") : (c.gst || c.trn ? `GST: ${c.gst || c.trn}` : ""),
                  c.pan ? `PAN: ${c.pan}` : "",
                  c.contact || "",
                ].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff" }} onClick={() => selectCustomer(c)}>Use</button>
              <button style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff" }} onClick={() => editCustomer(i)}>Edit</button>
              <button style={{ padding: "4px 8px", fontSize: 11, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff", color: "#b3261e" }} onClick={() => deleteCustomer(i)}>Del</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p style={{ color: "#888", fontSize: 12 }}>No customers saved yet.</p>}
      </div>
    </div>
  );
}

/* ============ Manage Other Details (Tabs) ============ */
const TABS = [
  { key: "currencies", label: "Currencies", storageKey: LS.currencies, defaultItem: "USD" },
  { key: "loadingLocs", label: "Loading Locations", storageKey: LS.loadingLocs, defaultItem: "SAJJA INDUSTRIAL AREA" },
  { key: "finalDests", label: "Final Destinations", storageKey: LS.finalDests, defaultItem: "MUNDRA" },
  { key: "origins", label: "Country of Origins", storageKey: LS.origins, defaultItem: "U.A.E" },
  { key: "paymentTerms", label: "Payment Terms", storageKey: LS.paymentTerms, defaultItem: "30% ADVANCE" },
  { key: "itemNames", label: "Material Descriptions", storageKey: LS.itemNames, defaultItem: "PC BOTTLE REGRIND" },
  { key: "qtyUnits", label: "Qty Units", storageKey: LS.qtyUnits, defaultItem: "MTS" },
];

function OtherDetailsModal({ onClose }) {
  const [tab, setTab] = useState(TABS[0].key);
  const active = TABS.find((t) => t.key === tab);
  const [items, setItems] = useState(() => load(active.storageKey));
  const [newItem, setNewItem] = useState("");
  const [newCurrCode, setNewCurrCode] = useState("");
  const [newCurrSubunit, setNewCurrSubunit] = useState("");
  const [editingIdx, setEditingIdx] = useState(null);

  useEffect(() => { 
    setItems(load(active.storageKey)); 
    setNewItem(""); 
    setNewCurrCode(""); 
    setNewCurrSubunit(""); 
    setEditingIdx(null); 
  }, [tab]);

  const addItem = () => {
    if (!newItem.trim()) return;
    let next;
    if (editingIdx !== null) {
      next = [...items];
      next[editingIdx] = newItem.trim();
      setEditingIdx(null);
    } else {
      next = [...items, newItem.trim()];
    }
    setItems(next);
    save(active.storageKey, next);
    setNewItem("");
  };

  const addCurrencyItem = () => {
    if (!newCurrCode.trim()) return;
    const cleanCode = newCurrCode.trim().toUpperCase();
    const cleanSub = newCurrSubunit.trim() || "CENTS";
    let next;
    if (editingIdx !== null) {
      next = [...items];
      next[editingIdx] = { code: cleanCode, subunit: cleanSub };
      setEditingIdx(null);
    } else {
      next = [...items, { code: cleanCode, subunit: cleanSub }];
    }
    setItems(next);
    save(active.storageKey, next);
    setNewCurrCode("");
    setNewCurrSubunit("");
  };

  const removeItem = (i) => {
    const pw = prompt(`Enter password 'abcd' to delete this ${active.label.toLowerCase()} item:`);
    if (pw !== "abcd") {
      if (pw !== null) alert("Wrong password!");
      return;
    }
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    save(active.storageKey, next);
    if (editingIdx === i) {
      setNewItem("");
      setNewCurrCode("");
      setNewCurrSubunit("");
      setEditingIdx(null);
    }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, maxWidth: 600 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Manage Other Details</h3>

        {/* Tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "2px solid #1c1c1c", paddingBottom: 8, marginBottom: 12 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
              border: "none", borderRadius: 5, background: tab === t.key ? "#1c1c1c" : "#f0f0f0",
              color: tab === t.key ? "#fff" : "#333", cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {/* Add new */}
        {tab === "currencies" ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Currency Code</label>
              <input style={{ ...inputStyle, marginBottom: 0 }} placeholder="e.g. USD, AED"
                value={newCurrCode} onChange={(e) => setNewCurrCode(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Subunit (After Decimal)</label>
              <input style={{ ...inputStyle, marginBottom: 0 }} placeholder="e.g. Cents, Fils"
                value={newCurrSubunit} onChange={(e) => setNewCurrSubunit(e.target.value)} />
            </div>
            <button style={btn("#1c1c1c")} onClick={addCurrencyItem}>
              {editingIdx !== null ? "Update" : "+ Add"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder={`Add new ${active.label.toLowerCase()}...`}
              value={newItem} onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()} />
            <button style={btn("#1c1c1c")} onClick={addItem}>
              {editingIdx !== null ? "Update" : "+ Add"}
            </button>
          </div>
        )}

        {/* List */}
        {items.length === 0 && <p style={{ color: "#888", fontSize: 12 }}>No items yet.</p>}
        {items.map((item, i) => {
          const displayVal = typeof item === "string" ? item : `${item.code} (Subunit: ${item.subunit})`;
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee" }}>
              <span style={{ fontSize: 13 }}>{displayVal}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button 
                  style={{ padding: "2px 8px", fontSize: 11, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff", cursor: "pointer" }} 
                  onClick={() => {
                    setEditingIdx(i);
                    if (tab === "currencies") {
                      setNewCurrCode(typeof item === "string" ? item : item.code);
                      setNewCurrSubunit(typeof item === "string" ? "CENTS" : item.subunit);
                    } else {
                      setNewItem(item);
                    }
                  }}
                  title="Edit"
                >
                  ✏️
                </button>
                <button style={{ padding: "2px 8px", fontSize: 11, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff", color: "#b3261e", cursor: "pointer" }} onClick={() => removeItem(i)}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ Settings Modal (Logos / Signatures / Stamps) ============ */
const IMG_KEYS = { logos: "easyinvoice_logos", signatures: "easyinvoice_signatures", stamps: "easyinvoice_stamps" };
const _imgKey = (k) => pfx(k);
const PASSWORD = "abcd";

function SettingsModal({ onClose }) {
  const [tab, setTab] = useState("logos");
  const [images, setImages] = useState(() => load(IMG_KEYS[tab]));
  const [pw, setPw] = useState("");

  useEffect(() => { setImages(load(IMG_KEYS[tab])); setPw(""); }, [tab]);

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length >= 3) { alert("Max 3 images allowed"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const next = [...images, { id: Date.now(), name: file.name, dataUrl: ev.target.result }];
      setImages(next);
      save(IMG_KEYS[tab], next);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (id) => {
    if (pw !== PASSWORD) { alert("Enter password 'abcd' to remove"); return; }
    const next = images.filter((img) => img.id !== id);
    setImages(next);
    save(IMG_KEYS[tab], next);
    setPw("");
  };

  const tabLabels = { logos: "Logos / Headers", signatures: "Signatures", stamps: "Stamps" };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, maxWidth: 600 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Settings — Images</h3>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #1c1c1c", paddingBottom: 8, marginBottom: 12 }}>
          {Object.entries(tabLabels).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: tab === key ? 700 : 500,
              border: "none", borderRadius: 5, background: tab === key ? "#1c1c1c" : "#f0f0f0",
              color: tab === key ? "#fff" : "#333", cursor: "pointer",
            }}>{label} ({images.length}/3)</button>
          ))}
        </div>

        {/* Upload */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "inline-block", padding: "8px 16px", fontSize: 12, fontWeight: 600,
            border: "1px dashed #999", borderRadius: 6, background: "#fafafa", cursor: "pointer" }}>
            + Upload {tabLabels[tab]}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
          </label>
        </div>

        {/* Password + Image grid */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Password to remove / manage</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 3, padding: "6px 8px", fontSize: 13,
              border: "1px solid #d4d4d4", borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            placeholder="Enter password" />
        </div>

        {/* Image grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {images.map((img) => (
            <div key={img.id} style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 8, textAlign: "center" }}>
              <img src={img.dataUrl} alt={img.name} style={{ maxWidth: "100%", maxHeight: 80, objectFit: "contain", marginBottom: 4 }} />
              <div style={{ fontSize: 10, color: "#888", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</div>
              <button onClick={() => removeImage(img.id)} style={{ padding: "3px 10px", fontSize: 10, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff", color: "#b3261e" }}>Remove</button>
            </div>
          ))}
          {images.length === 0 && <p style={{ color: "#888", fontSize: 12, gridColumn: "1/4" }}>No images saved yet. Upload above.</p>}
        </div>
      </div>
    </div>
  );
}

/* ============ Profile Modal ============ */
function ProfileModal({ onClose }) {
  const user = auth.currentUser;
  const company = (() => { try { return JSON.parse(localStorage.getItem(pfx("easyinvoice_company"))); } catch { return null; } })();
  const team = (() => { try { return JSON.parse(localStorage.getItem(pfx("easyinvoice_team"))) || []; } catch { return []; } })();

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, maxWidth: 460 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800 }}>Profile</h3>

        <div style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 8 }}>ACCOUNT</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}><b>Email:</b> {user?.email || "—"}</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}><b>UID:</b> <span style={{ fontSize: 11, color: "#888" }}>{user?.uid || "—"}</span></div>
        </div>

        <div style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 8 }}>COMPANY</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}><b>Name:</b> {company?.name || "Not set"}</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}><b>Email:</b> {company?.email || "—"}</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}><b>Contact:</b> {company?.contact || "—"}</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Set your company details in Menu → Manage Our Company Details</div>
        </div>

        <div style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 8 }}>TEAM</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}><b>Members under you:</b> {team.length}</div>
          {team.length > 0 && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              {team.map((m, i) => <span key={i}>{m.name}{i < team.length - 1 ? ", " : ""}</span>)}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>This user is the primary account holder.</div>
        </div>
      </div>
    </div>
  );
}

/* ============ Team Members Modal ============ */
const TEAM_KEY = "easyinvoice_team";

function TeamMembersModal({ onClose }) {
  const [list, setList] = useState(() => load(TEAM_KEY));
  const [pw, setPw] = useState("");
  const [form, setForm] = useState({ name: "", email: "", mobile: "" });
  const [editing, setEditing] = useState(null);

  const set = (k) => (v) => setForm({ ...form, [k]: v });

  const saveMember = () => {
    if (pw !== "abcd") { alert("Enter password 'abcd'"); return; }
    if (!form.name.trim() || !form.email.trim()) { alert("Name and Email required"); return; }
    if (editing !== null) {
      const next = [...list];
      next[editing] = form;
      setList(next);
      save(TEAM_KEY, next);
    } else {
      const next = [...list, form];
      setList(next);
      save(TEAM_KEY, next);
    }
    setForm({ name: "", email: "", mobile: "" });
    setEditing(null);
    setPw("");
  };

  const editMember = (i) => { setForm(list[i]); setEditing(i); };
  const deleteMember = (i) => {
    if (pw !== "abcd") { alert("Enter password 'abcd'"); return; }
    const next = list.filter((_, idx) => idx !== i);
    setList(next);
    save(TEAM_KEY, next);
    if (editing === i) { setForm({ name: "", email: "", mobile: "" }); setEditing(null); }
    setPw("");
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalBox, maxWidth: 560 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800 }}>Team Members</h3>

        {/* Section 1: Add / Edit */}
        <div style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editing !== null ? "Edit Member" : "Add New Member"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Name</label><input style={inputStyle} value={form.name} onChange={(e) => set("name")(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Email</label><input style={inputStyle} value={form.email} onChange={(e) => set("email")(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Mobile</label><input style={inputStyle} value={form.mobile} onChange={(e) => set("mobile")(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, color: "#6b6b6b", fontWeight: 600 }}>Password</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={inputStyle} placeholder="Enter 'abcd'" /></div>
          </div>
          <button style={btn("#1c1c1c", { marginTop: 6 })} onClick={saveMember}>
            {editing !== null ? "Update Member" : "Save Member"}
          </button>
        </div>

        {/* Section 2: List */}
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Members List</div>
        {list.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{m.email}{m.mobile ? " · " + m.mobile : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => editMember(i)} style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff", cursor: "pointer" }}>✏️</button>
              <button onClick={() => deleteMember(i)} style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #d4d4d4", borderRadius: 4, background: "#fff", cursor: "pointer" }}>🗑️</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p style={{ color: "#888", fontSize: 12 }}>No team members yet.</p>}
      </div>
    </div>
  );
}

function pfx(key) { return (_mgmtUid ? _mgmtUid + "_" : "") + key; }
let _mgmtUid = "";

export default function ManagementMenu({ uid, onCompany, onCustomer, sellers, setSellers, setBuyer, onPackingListClick, onInvoiceListClick, onDataChange }) {
  _mgmtUid = uid || "";
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null); // 'company' | 'customers' | 'other' | 'settings' | 'team'

  const handleCompanyApply = (data) => {
    setSellers({
      name: data.name || sellers.name,
      addr1: data.addr1 || sellers.addr1,
      addr2: data.addr2 || sellers.addr2,
      contactPerson: data.contact || sellers.contactPerson,
      contact: data.contact || sellers.contact,
      email: data.email || sellers.email,
      trn: data.trn || sellers.trn,
    });
  };

  const handleCustomerSelect = (data) => {
    if (setBuyer) {
      const isTrn = data.taxType === "TRN" || (!!data.trn && !data.gst);
      const taxVal = isTrn ? (data.trn || data.gst || data.taxNumber || "") : (data.gst || data.trn || data.taxNumber || "");
      setBuyer({
        name: data.name || "",
        addr1: data.addr1 || "",
        addr2: data.addr2 || "",
        taxType: isTrn ? "TRN" : "GST",
        trn: isTrn ? taxVal : "",
        gst: isTrn ? "" : taxVal,
        pan: data.pan || "",
        contact: data.contact || "",
        email: data.email || "",
      });
    }
  };

  return (
    <>
      {/* Hamburger button */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen(!open)} style={{
          padding: "6px 10px", fontSize: 16, fontWeight: 600, lineHeight: 1,
          border: "1px solid #1c1c1c", borderRadius: 5, background: "#fff", cursor: "pointer",
        }} title="Menu">☰</button>

        {open && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 1999 }} onClick={() => setOpen(false)} />
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 4,
              background: "#fff", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              minWidth: 220, zIndex: 2000, overflow: "hidden",
            }}>
              <button onClick={() => { setOpen(false); setModal("company"); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                🏢 Manage Our Company Details
              </button>
              <button onClick={() => { setOpen(false); setModal("customers"); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                👥 Manage Customers
              </button>
              <button onClick={() => { setOpen(false); onPackingListClick && onPackingListClick(); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                📦 Packing List
              </button>
              <button onClick={() => { setOpen(false); onInvoiceListClick && onInvoiceListClick(); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                📄 Invoices List
              </button>
              <button onClick={() => { setOpen(false); setModal("other"); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                📋 Manage Other Details
              </button>
              <button onClick={() => { setOpen(false); setModal("settings"); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                ⚙️ Settings
              </button>
              <button onClick={() => { setOpen(false); setModal("team"); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                👥 Team Members
              </button>
              <button onClick={() => { setOpen(false); setModal("profile"); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                👤 Profile
              </button>
              <button onClick={() => { setOpen(false); signOut(auth); }} style={{
                display: "block", width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 500,
                border: "none", background: "#fff", textAlign: "left", cursor: "pointer",
                color: "#b3261e",
              }} onMouseEnter={(e) => e.target.style.background = "#f5f5f5"}
                 onMouseLeave={(e) => e.target.style.background = "#fff"}>
                🚪 Logout
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {modal === "company" && <CompanyModal onClose={() => { setModal(null); onDataChange && onDataChange(); }} onApply={handleCompanyApply} />}
      {modal === "customers" && <CustomersModal onClose={() => { setModal(null); onDataChange && onDataChange(); }} onSelect={handleCustomerSelect} />}
      {modal === "other" && <OtherDetailsModal onClose={() => { setModal(null); onDataChange && onDataChange(); }} />}
      {modal === "settings" && <SettingsModal onClose={() => { setModal(null); onDataChange && onDataChange(); }} />}
      {modal === "team" && <TeamMembersModal onClose={() => { setModal(null); onDataChange && onDataChange(); }} />}
      {modal === "profile" && <ProfileModal onClose={() => setModal(null)} />}
    </>
  );
}
