/**
 * Frontend logic for capacity signup + admin + check registration
 * (Firebase + Super Admin + Reports).
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// === Firebase config ===
const firebaseConfig = {
  apiKey: "AIzaSyD4tJ5XN_0rxE0kgi5Tgc-KnWht-RCIPlA",
  authDomain: "hodorahmedeisa.firebaseapp.com",
  projectId: "hodorahmedeisa",
  storageBucket: "hodorahmedeisa.firebasestorage.app",
  messagingSenderId: "989623284330",
  appId: "1:989623284330:web:527a4fa10023625bc41013",
  measurementId: "G-0G9RENK5HX",
};

const app = initializeApp(firebaseConfig);
try {
  getAnalytics(app);
} catch (e) {
  // ممكن يرمي Error من file:// – مش مشكلة
}
const db = getFirestore(app);

// ========== DOM helpers ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const form = $("#pref-form");
const choiceSelect = $("#choice");
const statusEl = $("#status");
const submitBtn = $("#submitBtn");
const statsEl = $("#stats");

const adminOpen = $("#adminOpen");
const dlg = $("#adminDialog");
const adminLoginForm = $("#adminLoginForm");
const adminPanel = $("#adminPanel");
const adminLoginBtn = $("#adminLoginBtn");
const adminLoginMsg = $("#adminLoginMsg");
const adminMsg = $("#adminMsg");
const refreshSubs = $("#refreshSubs");
const subsTable = $("#subsTable");
const searchInput = $("#searchInput");
const attDate = $("#attDate");
const saveAttendance = $("#saveAttendance");

// سوبر أدمن: إدارة الأيام
const superAdminConfig = $("#superAdminConfig");
const choiceNameInput = $("#choiceNameInput");
const choiceCapacityInput = $("#choiceCapacityInput");
const addChoiceBtn = $("#addChoiceBtn");
const choicesList = $("#choicesList");

// سوبر أدمن: التقارير
const superAdminReports = $("#superAdminReports");
const reportChoiceFilter = $("#reportChoiceFilter");
const loadReportsBtn = $("#loadReportsBtn");
const reportAttendedTable = $("#reportAttendedTable");
const reportAbsentTable = $("#reportAbsentTable");

// اختبار التسجيل
const checkOpen = $("#checkOpen");
const checkDialog = $("#checkDialog");
const checkForm = $("#checkForm");
const checkBtn = $("#checkBtn");
const checkSeat = $("#checkSeat");
const checkResult = $("#checkResult");

let adminCreds = null;
let isSuperAdmin = false;
let allSubs = [];

// ========== Toast ==========
function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="icon">${type === "ok" ? "✅" : "⚠️"}</span><span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ========== Status inline ==========
function showStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = "status " + cls;
}

// ========== Validators ==========
const arabicNameRE = /^[\u0600-\u06FF\s]+$/;
const seatRE = /^[0-9]{1,10}$/;

// ========== تحميل الرغبات + الإحصائيات ==========
async function loadCapacities(silent = false) {
  try {
    if (!silent) showStatus("جارِ تحميل الرغبات المتاحة...");

    const snap = await getDocs(collection(db, "choices"));
    const choices = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      choices.push({
        id: docSnap.id,
        choice: d.choice || docSnap.id,
        capacity: Number(d.capacity || 0),
        taken: Number(d.taken || 0),
      });
    });

    // ترتيب أبجدي
    choices.sort((a, b) =>
      String(a.choice || "").localeCompare(String(b.choice || ""), "ar")
    );

    // select بتاع الطالب
    choiceSelect.innerHTML =
      '<option value="" disabled selected>اختر رغبتك</option>';
    choices.forEach((c) => {
      const remaining = Math.max(0, c.capacity - c.taken);
      const opt = document.createElement("option");
      opt.value = c.choice;
      opt.disabled = remaining <= 0;
      opt.textContent =
        remaining > 0
          ? `${c.choice} — متبقي ${remaining}`
          : `${c.choice} — مكتملة`;
      choiceSelect.appendChild(opt);
    });

    // إحصائيات
    renderStats(choices);

    // تحديث فلتر التقارير لو السوبر أدمن فاتح
    updateReportChoiceFilter(choices);

    submitBtn.disabled = false;
    if (!silent) showStatus("✔️ جاهز للتسجيل", "ok");
  } catch (err) {
    console.error(err);
    if (!silent)
      showStatus(
        "حدث خطأ أثناء تحميل البيانات. حاول التحديث.",
        "err"
      );
    submitBtn.disabled = true;
  }
}

function renderStats(choices) {
  const total = choices.reduce((s, c) => s + Number(c.taken || 0), 0);
  const blocks = [
    `<div class="stat"><div class="label">إجمالي المسجلين</div><div class="value">${total}</div></div>`,
  ];
  choices.forEach((c) => {
    const remaining = Math.max(0, Number(c.capacity) - Number(c.taken));
    blocks.push(
      `<div class="stat">
        <div class="label">${c.choice}</div>
        <div class="value">${c.taken || 0} / ${c.capacity}</div>
        <div class="hint">${remaining > 0 ? `متبقي ${remaining}` : "مكتملة"}</div>
      </div>`
    );
  });
  statsEl.innerHTML = blocks.join("");
}

// تحديث select الخاص بالتقارير
function updateReportChoiceFilter(choices) {
  if (!reportChoiceFilter) return;
  const current = reportChoiceFilter.value || "";
  reportChoiceFilter.innerHTML = `<option value="">كل الأيام</option>`;
  choices.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.choice;
    opt.textContent = c.choice;
    reportChoiceFilter.appendChild(opt);
  });
  if (current) {
    reportChoiceFilter.value = current;
  }
}

// ========== إرسال تسجيل جديد ==========
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("#name").value.trim();
  const seat = $("#seat").value.trim();
  const choice = $("#choice").value;

  if (!arabicNameRE.test(name)) {
    toast("⚠️ الاسم بالعربية فقط.", "err");
    showStatus("الاسم بالعربية فقط.", "warn");
    return;
  }
  if (!seatRE.test(seat)) {
    toast("⚠️ رقم الجلوس أرقام إنجليزية فقط.", "err");
    showStatus("رقم الجلوس أرقام إنجليزية فقط.", "warn");
    return;
  }
  if (!choice) {
    toast("اختر الرغبة.", "err");
    return;
  }

  submitBtn.disabled = true;
  showStatus("جارٍ الإرسال...");

  try {
    // 1) منع تكرار رقم الجلوس
    const dupQ = query(
      collection(db, "submissions"),
      where("seat", "==", seat),
      limit(1)
    );
    const dupSnap = await getDocs(dupQ);
    if (!dupSnap.empty) {
      toast("رقم الجلوس مسجل من قبل.", "err");
      submitBtn.disabled = false;
      return;
    }

    // 2) التأكد من السعة
    const choiceRef = doc(db, "choices", choice);
    const choiceSnap = await getDoc(choiceRef);
    if (!choiceSnap.exists()) {
      toast("هذه الرغبة غير معرّفة في قاعدة البيانات.", "err");
      submitBtn.disabled = false;
      return;
    }
    const cd = choiceSnap.data();
    const capacity = Number(cd.capacity || 0);
    const taken = Number(cd.taken || 0);
    if (taken >= capacity) {
      toast("الرغبة مكتملة.", "err");
      await loadCapacities(true);
      submitBtn.disabled = false;
      return;
    }

    // 3) تخزين التسجيل
    await addDoc(collection(db, "submissions"), {
      ts: serverTimestamp(),
      name,
      seat,
      choice,
    });

    // 4) زيادة taken
    await updateDoc(choiceRef, { taken: increment(1) });

    toast("تم التسجيل بنجاح ✅", "ok");
    showStatus("🎉 تم تسجيل رغبتك بنجاح.", "ok");
    form.reset();
    await loadCapacities(true);
  } catch (err) {
    console.error(err);
    toast("حدث خطأ: " + (err.message || "غير معروف"), "err");
  } finally {
    submitBtn.disabled = false;
  }
});

// ========== الأدمن: فتح الديالوج ==========
adminOpen.addEventListener("click", () => dlg.showModal());

// ========== الأدمن: تسجيل الدخول ==========
adminLoginBtn.addEventListener("click", async (ev) => {
  ev.preventDefault();
  const user = $("#adminUser").value.trim();
  const pass = $("#adminPass").value.trim();
  adminLoginMsg.textContent = "جار التحقق...";
  adminLoginMsg.className = "status";

  // سوبر أدمن ثابت من الكود
  if (user === "eisa" && pass === "2008") {
    isSuperAdmin = true;
    adminCreds = { user };
    adminLoginForm.hidden = true;
    adminPanel.hidden = false;
    adminLoginMsg.textContent = "";
    adminMsg.textContent = "تم تسجيل الدخول كسوبر أدمن.";
    adminMsg.className = "status ok";

    if (superAdminConfig) superAdminConfig.hidden = false;
    if (superAdminReports) superAdminReports.hidden = false;

    await loadChoicesConfig();
    await loadSubmissions();
    await loadReports();
    return;
  }

  // باقي الأدمن (اختياري من Collection admins)
  try {
    const ref = doc(db, "admins", user);
    const snap = await getDoc(ref);
    if (!snap.exists() || String(snap.data().pass || "") !== pass) {
      adminLoginMsg.textContent = "بيانات الدخول غير صحيحة.";
      adminLoginMsg.className = "status err";
      return;
    }

    isSuperAdmin = !!snap.data().super; // لو حطيت super:true في Firestore
    adminCreds = { user };
    adminLoginForm.hidden = true;
    adminPanel.hidden = false;
    adminLoginMsg.textContent = "";
    adminMsg.textContent = "تم تسجيل الدخول كأدمن.";
    adminMsg.className = "status ok";

    if (isSuperAdmin) {
      if (superAdminConfig) superAdminConfig.hidden = false;
      if (superAdminReports) superAdminReports.hidden = false;
      await loadChoicesConfig();
      await loadReports();
    }
    await loadSubmissions();
  } catch (err) {
    console.error(err);
    adminLoginMsg.textContent = "تعذر الاتصال بقاعدة البيانات.";
    adminLoginMsg.className = "status err";
  }
});

// ========== إدارة الأيام والسعات (سوبر أدمن) ==========
async function loadChoicesConfig() {
  if (!isSuperAdmin || !choicesList) return;
  try {
    const snap = await getDocs(collection(db, "choices"));
    const choices = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      choices.push({
        id: docSnap.id,
        choice: d.choice || docSnap.id,
        capacity: Number(d.capacity || 0),
        taken: Number(d.taken || 0),
      });
    });
    choices.sort((a, b) =>
      String(a.choice || "").localeCompare(String(b.choice || ""), "ar")
    );
    renderChoicesConfigTable(choices);
    updateReportChoiceFilter(choices);
  } catch (err) {
    console.error(err);
    choicesList.innerHTML =
      "<div class='cell'>تعذر تحميل الأيام. حاول التحديث.</div>";
  }
}

function renderChoicesConfigTable(choices) {
  if (!choicesList) return;
  if (!choices.length) {
    choicesList.innerHTML =
      "<div class='cell' style='padding:8px;'>لا توجد أيام مسجلة بعد.</div>";
    return;
  }
  const head = `
    <div class="row head">
      <div class="cell">الرغبة</div>
      <div class="cell">السعة</div>
      <div class="cell">المسجلين</div>
      <div class="cell">تحكم</div>
    </div>`;
  const body = choices
    .map(
      (c) => `
    <div class="row" data-id="${c.id}">
      <div class="cell">${c.choice}</div>
      <div class="cell">
        <input type="number" class="choice-cap-input" min="0" value="${c.capacity}" style="width:80px;">
      </div>
      <div class="cell">${c.taken}</div>
      <div class="cell">
        <button type="button" class="btn-ghost btnChoiceSave">حفظ</button>
        <button type="button" class="btn-ghost btnChoiceDelete" style="color:#b00;">حذف</button>
      </div>
    </div>`
    )
    .join("");
  choicesList.innerHTML = head + body;

  choicesList.querySelectorAll(".btnChoiceSave").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const row = e.target.closest(".row");
      if (!row) return;
      const id = row.dataset.id;
      const capInput = row.querySelector(".choice-cap-input");
      const newCap = Number(capInput.value || "0");
      if (isNaN(newCap) || newCap < 0) {
        toast("السعة يجب أن تكون رقمًا 0 أو أكبر.", "err");
        return;
      }
      try {
        const ref = doc(db, "choices", id);
        await updateDoc(ref, { capacity: newCap });
        toast("تم تحديث السعة.", "ok");
        await loadCapacities(true);
        await loadChoicesConfig();
      } catch (err) {
        console.error(err);
        toast("تعذر حفظ التعديل.", "err");
      }
    });
  });

  choicesList.querySelectorAll(".btnChoiceDelete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const row = e.target.closest(".row");
      if (!row) return;
      const id = row.dataset.id;
      const takenCell = row.querySelectorAll(".cell")[2];
      const taken = Number((takenCell?.textContent || "0").trim()) || 0;

      if (taken > 0) {
        alert("لا يمكن حذف رغبة عليها مسجلين. يمكنك فقط جعل السعة 0.");
        return;
      }

      if (!confirm("هل تريد حذف هذه الرغبة نهائيًا؟")) return;

      try {
        await deleteDoc(doc(db, "choices", id));
        toast("تم حذف الرغبة.", "ok");
        await loadCapacities(true);
        await loadChoicesConfig();
      } catch (err) {
        console.error(err);
        toast("تعذر حذف الرغبة.", "err");
      }
    });
  });

}

// إضافة / تحديث رغبة جديدة
if (addChoiceBtn && choiceNameInput && choiceCapacityInput) {
  addChoiceBtn.addEventListener("click", async () => {
    if (!isSuperAdmin) return;
    const name = choiceNameInput.value.trim();
    const cap = Number(choiceCapacityInput.value || "0");
    if (!name) {
      toast("اكتب اسم اليوم / الرغبة.", "err");
      return;
    }
    if (isNaN(cap) || cap < 0) {
      toast("السعة يجب أن تكون رقمًا 0 أو أكبر.", "err");
      return;
    }
    const id = name; // نخلي ID = اسم الرغبة (حتى لو عربي)
    try {
      const ref = doc(db, "choices", id);
      await setDoc(
        ref,
        {
          choice: name,
          capacity: cap,
        },
        { merge: true }
      );
      toast("تم حفظ الرغبة.", "ok");
      choiceNameInput.value = "";
      choiceCapacityInput.value = "";
      await loadCapacities(true);
      await loadChoicesConfig();
    } catch (err) {
      console.error(err);
      toast("تعذر حفظ الرغبة.", "err");
    }
  });
}

// ========== تحميل المسجلين للأدمن ==========
async function loadSubmissions() {
  subsTable.innerHTML = "<div class='cell'>جارِ التحميل...</div>";
  try {
    const qSub = query(
      collection(db, "submissions"),
      orderBy("ts", "desc")
    );
    const snap = await getDocs(qSub);
    allSubs = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      allSubs.push({
        name: String(d.name || ""),
        seat: String(d.seat || ""),
        choice: String(d.choice || ""),
        ts: d.ts && d.ts.toDate ? d.ts.toDate() : null,
      });
    });

    if (allSubs.length === 0) {
      subsTable.innerHTML = `
        <div class="row head">
          <div class="cell"><input type="checkbox" id="checkAll"></div>
          <div class="cell">الاسم</div>
          <div class="cell">رقم الجلوس</div>
          <div class="cell">الرغبة</div>
        </div>
        <div class="cell" style="padding:14px;">لا يوجد مسجلين لعرضهم.</div>
      `;
      return;
    }

    renderSubsTable(filterSubs(allSubs, searchInput.value));
  } catch (err) {
    console.error(err);
    subsTable.innerHTML =
      "<div class='cell'>تعذر تحميل البيانات.</div>";
  }
}

function renderSubsTable(rows) {
  const head = `
    <div class="row head">
      <div class="cell"><input type="checkbox" id="checkAll"></div>
      <div class="cell">الاسم</div>
      <div class="cell">رقم الجلوس</div>
      <div class="cell">الرغبة</div>
    </div>`;
  const body = rows
    .map(
      (r) => `
    <div class="row">
      <div class="cell"><input type="checkbox" class="att" data-seat="${r.seat}"></div>
      <div class="cell">${r.name}</div>
      <div class="cell">${r.seat}</div>
      <div class="cell">${r.choice}</div>
    </div>`
    )
    .join("");
  subsTable.innerHTML = head + body;

  const checkAll = $("#checkAll");
  if (checkAll) {
    checkAll.addEventListener("change", () => {
      $$(".att").forEach((cb) => (cb.checked = checkAll.checked));
    });
  }
}

// بحث في جدول المسجلين
searchInput.addEventListener("input", () => {
  renderSubsTable(filterSubs(allSubs, searchInput.value));
});

function filterSubs(list, q) {
  q = (q || "").trim();
  if (!q) return list;
  return list.filter(
    (s) =>
      String(s.name || "").includes(q) ||
      String(s.seat || "").includes(q)
  );
}

// زر تحديث القائمة
refreshSubs.addEventListener("click", () => loadSubmissions());

// ========== تسجيل الحضور ==========
saveAttendance.addEventListener("click", async () => {
  if (!adminCreds) return;
  const date = attDate.value;
  const seats = $$(".att:checked").map((cb) => cb.dataset.seat);
  if (!date || seats.length === 0) {
    adminMsg.textContent = "اختر تاريخ وحدد طلاب.";
    adminMsg.className = "status warn";
    return;
  }
  adminMsg.textContent = "جارِ الحفظ...";
  adminMsg.className = "status";

  try {
    const promises = [];
    seats.forEach((seat) => {
      const sub = allSubs.find((s) => s.seat === seat);
      if (!sub) return;
      promises.push(
        addDoc(collection(db, "attendance"), {
          ts: serverTimestamp(),
          date,
          seat,
          name: sub.name,
          choice: sub.choice,
          admin: adminCreds.user,
        })
      );
    });
    await Promise.all(promises);
    adminMsg.textContent = `تم تسجيل حضور ${seats.length} طالب.`;
    adminMsg.className = "status ok";
    toast(`تم تسجيل حضور ${seats.length} طالب.`, "ok");
  } catch (err) {
    console.error(err);
    adminMsg.textContent = "تعذر الحفظ.";
    adminMsg.className = "status err";
  }
});

// ========== تقارير السوبر أدمن ==========
async function loadReports() {
  if (!isSuperAdmin || !reportAttendedTable || !reportAbsentTable) return;

  const filterChoice = (reportChoiceFilter && reportChoiceFilter.value) || "";

  reportAttendedTable.innerHTML = "<div class='cell'>جارِ تحميل الحضور...</div>";
  reportAbsentTable.innerHTML = "<div class='cell'>جارِ تحميل المسجلين...</div>";

  try {
    // submissions (الرغبات)
    let subsQ = collection(db, "submissions");
    if (filterChoice) {
      subsQ = query(subsQ, where("choice", "==", filterChoice));
    }
    const subsSnap = await getDocs(subsQ);
    const subs = [];
    subsSnap.forEach((docSnap) => {
      const d = docSnap.data();
      subs.push({
        seat: String(d.seat || ""),
        name: String(d.name || ""),
        choice: String(d.choice || ""),
      });
    });

    // attendance (الحضور)
    let attQ = collection(db, "attendance");
    if (filterChoice) {
      attQ = query(attQ, where("choice", "==", filterChoice));
    }
    const attSnap = await getDocs(attQ);
    const attended = [];
    const attendedKey = new Set();
    attSnap.forEach((docSnap) => {
      const d = docSnap.data();
      const seat = String(d.seat || "");
      const choice = String(d.choice || "");
      const key = seat + "||" + choice;
      attendedKey.add(key);
      attended.push({
        seat,
        name: String(d.name || ""),
        choice,
        date: String(d.date || ""),
        admin: String(d.admin || ""),
      });
    });

    // absents = مسجل رغبة ومافيش حضور لنفس اليوم
    const absents = subs.filter(
      (s) => !attendedKey.has(s.seat + "||" + s.choice)
    );

    renderReportTable(reportAttendedTable, attended, true);
    renderReportTable(reportAbsentTable, absents, false);
  } catch (err) {
    console.error(err);
    reportAttendedTable.innerHTML =
      "<div class='cell'>تعذر تحميل بيانات الحضور.</div>";
    reportAbsentTable.innerHTML =
      "<div class='cell'>تعذر تحميل بيانات المسجلين.</div>";
  }
}

function renderReportTable(container, rows, withDate) {
  if (!rows.length) {
    container.innerHTML =
      "<div class='cell' style='padding:8px;'>لا توجد بيانات.</div>";
    return;
  }

  let head = `
    <div class="row head">
      <div class="cell">الاسم</div>
      <div class="cell">رقم الجلوس</div>
      <div class="cell">الرغبة</div>`;
  if (withDate) {
    head += `<div class="cell">التاريخ</div><div class="cell">المسؤول</div>`;
  }
  head += `</div>`;

  const body = rows
    .map((r) => {
      let rowHtml = `
        <div class="row">
          <div class="cell">${r.name}</div>
          <div class="cell">${r.seat}</div>
          <div class="cell">${r.choice}</div>`;
      if (withDate) {
        rowHtml += `<div class="cell">${r.date || "-"}</div>
                    <div class="cell">${r.admin || "-"}</div>`;
      }
      rowHtml += `</div>`;
      return rowHtml;
    })
    .join("");

  container.innerHTML = head + body;
}

// أزرار التقارير
if (loadReportsBtn) {
  loadReportsBtn.addEventListener("click", () => loadReports());
}
if (reportChoiceFilter) {
  reportChoiceFilter.addEventListener("change", () => loadReports());
}

// ========== قيود الإدخال ==========
$("#seat").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, "");
});
$("#name").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^\u0600-\u06FF\s]/g, "");
});

// ========== نافذة اختبار التسجيل ==========
if (checkOpen && checkDialog && checkBtn) {
  // فتح نافذة الاختبار
  checkOpen.addEventListener("click", () => {
    checkDialog.showModal();
    checkResult.textContent = "";
    checkResult.className = "status";
    checkSeat.value = "";
    setTimeout(() => checkSeat.focus(), 50);
  });

  // تنفيذ الاختبار
  checkBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const seat = (checkSeat.value || "").trim();

    if (!seat) {
      checkResult.textContent = "اكتب رقم الجلوس.";
      checkResult.className = "status warn";
      return;
    }
    if (!seatRE.test(seat)) {
      checkResult.textContent =
        "رقم الجلوس يجب أن يكون أرقام إنجليزية فقط.";
      checkResult.className = "status warn";
      return;
    }

    checkResult.textContent = "جارِ البحث في التسجيل والحضور...";
    checkResult.className = "status";

    try {
      // 1) جلب الرغبات من submissions
      const subsQ = query(
        collection(db, "submissions"),
        where("seat", "==", seat)
      );

      // 2) جلب الحضور من attendance
      const attQ = query(
        collection(db, "attendance"),
        where("seat", "==", seat)
      );

      const [subsSnap, attSnap] = await Promise.all([
        getDocs(subsQ),
        getDocs(attQ),
      ]);

      const subs = [];
      subsSnap.forEach((docSnap) => {
        const d = docSnap.data();
        subs.push({
          choice: String(d.choice || ""),
          name: String(d.name || ""),
          ts: d.ts && d.ts.toDate ? d.ts.toDate() : null,
        });
      });

      const att = [];
      attSnap.forEach((docSnap) => {
        const d = docSnap.data();
        att.push({
          choice: String(d.choice || ""),
          name: String(d.name || ""),
          date: String(d.date || ""),
          admin: String(d.admin || ""),
          ts: d.ts && d.ts.toDate ? d.ts.toDate() : null,
        });
      });

      if (!subs.length && !att.length) {
        checkResult.textContent =
          "❌لا يوجد أي بيانات مسجلة لرقم الجلوس";
        checkResult.className = "status err";
        return;
      }

      // ترتيب حسب الأحدث لو فيه ts
      subs.sort(
        (a, b) => (b.ts?.getTime() || 0) - (a.ts?.getTime() || 0)
      );
      att.sort(
        (a, b) => (b.ts?.getTime() || 0) - (a.ts?.getTime() || 0)
      );

      let html = "";

      if (subs.length) {
        html += "<p>📌 الرغبات المسجلة:</p><ul>";
        html += subs
          .map(
            (s) =>
              `<li>${s.choice}${
                s.name ? " — " + s.name : ""
              }</li>`
          )
          .join("");
        html += "</ul>";
      }

      if (att.length) {
        html += "<p>✅ أيام الحضور المكتملة:</p><ul>";
        html += att
          .map((a) => {
            const adminPart = a.admin
              ? ` (المسؤول: ${a.admin})`
              : "";
            return `<li>${a.date || "-"} — ${a.choice}${adminPart}</li>`;
          })
          .join("");
        html += "</ul>";
      }

      checkResult.innerHTML = html;
      checkResult.className = "status ok";
    } catch (err) {
      console.error(err);
      checkResult.textContent =
        "تعذر الاتصال بقاعدة البيانات. تأكد من اتصال الإنترنت وصلاحيات القراءة في Firestore.";
      checkResult.className = "status err";
    }
  });
}

// ========== تحميل أولي ==========
loadCapacities();
