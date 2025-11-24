/**
 * Frontend logic for capacity signup + admin + check registration (Firebase version).
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
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// === Firebase config (بتاعتك اللي بعتها) ===
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
let analytics;
try {
  analytics = getAnalytics(app);
} catch (e) {
  // بيعلق أحياناً لو شغّال من file:// – مش مشكلة
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
const searchInput = $("#search");
const attDate = $("#attDate");
const saveAttendance = $("#saveAttendance");

const checkOpen = $("#checkOpen");
const checkDialog = $("#checkDialog");
const checkForm = $("#checkForm");
const checkBtn = $("#checkBtn");
const checkSeat = $("#checkSeat");
const checkResult = $("#checkResult");

let adminCreds = null;
let allSubs = [];

// ========== Toast ==========
function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="icon">${type === "ok" ? "✅" : "⚠️"}</span><span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2800);
}

// ========== Status inline ==========
function showStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = "status " + cls;
}

// ========== Validators ==========
const arabicNameRE = /^[\u0600-\u06FF\s]+$/;
const seatRE = /^[0-9]{1,10}$/;

// ========== تحميل الرغبات + الإحصائيات من Firestore ==========
async function loadCapacities(silent = false) {
  try {
    if (!silent) showStatus("جارِ تحميل الرغبات المتاحة...");

    const snap = await getDocs(collection(db, "choices"));
    const choices = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      choices.push({
        choice: d.choice || docSnap.id,
        capacity: Number(d.capacity || 0),
        taken: Number(d.taken || 0),
      });
    });

    // ترتيب أبجدي عربي
    choices.sort((a, b) =>
      String(a.choice || "").localeCompare(String(b.choice || ""), "ar")
    );

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

    renderStats(choices);
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
adminOpen.addEventListener("click", () => {
  dlg.showModal();
});

// ========== الأدمن: تسجيل الدخول ==========
adminLoginBtn.addEventListener("click", async (ev) => {
  ev.preventDefault();
  const user = $("#adminUser").value.trim();
  const pass = $("#adminPass").value.trim();
  adminLoginMsg.textContent = "جار التحقق...";
  adminLoginMsg.className = "status";

  try {
    const ref = doc(db, "admins", user);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      adminLoginMsg.textContent = "بيانات الدخول غير صحيحة.";
      adminLoginMsg.className = "status err";
      return;
    }
    const data = snap.data();
    if (String(data.pass || "") !== pass) {
      adminLoginMsg.textContent = "بيانات الدخول غير صحيحة.";
      adminLoginMsg.className = "status err";
      return;
    }

    adminCreds = { user };
    adminLoginForm.hidden = true;
    adminPanel.hidden = false;
    adminLoginMsg.textContent = "";
    adminMsg.textContent = "تم تسجيل الدخول كأدمن.";
    adminMsg.className = "status ok";

    await loadSubmissions();
  } catch (err) {
    console.error(err);
    adminLoginMsg.textContent = "تعذر الاتصال بقاعدة البيانات.";
    adminLoginMsg.className = "status err";
  }
});

// ========== بحث في جدول المسجلين ==========
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
    subsTable.innerHTML = "<div class='cell'>تعذر تحميل البيانات.</div>";
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
    </div>
  `
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

// ========== حفظ الحضور في Firestore ==========
saveAttendance.addEventListener("click", async () => {
  if (!adminCreds) {
    return;
  }
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

// ========== قيود الكتابة أثناء الإدخال ==========
$("#seat").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, "");
});
$("#name").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^\u0600-\u06FF\s]/g, "");
});

// ========== نافذة التحقق من رقم الجلوس ==========
if (checkOpen && checkDialog && checkBtn) {
  checkOpen.addEventListener("click", () => {
    checkDialog.showModal();
    checkResult.textContent = "";
    checkResult.className = "status";
    checkSeat.value = "";
    setTimeout(() => checkSeat.focus(), 50);
  });

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
    checkResult.textContent = "جارِ البحث...";
    checkResult.className = "status";

    try {
      const qAtt = query(
        collection(db, "attendance"),
        where("seat", "==", seat),
        orderBy("ts", "desc")
      );
      const snap = await getDocs(qAtt);
      if (snap.empty) {
        checkResult.textContent = "❌ لم يتم العثور على هذا الرقم.";
        checkResult.className = "status err";
        return;
      }
      const days = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        days.push({
          date: String(d.date || ""),
          choice: String(d.choice || ""),
        });
      });
      let html =
        "<p>✅ هذا الرقم مسجل حضورًا في الأيام التالية:</p><ul>";
      html += days
        .map((d) => `<li>${d.date} — ${d.choice}</li>`)
        .join("");
      html += "</ul>";
      checkResult.innerHTML = html;
      checkResult.className = "status ok";
    } catch (err) {
      console.error(err);
      checkResult.textContent = "تعذر الاتصال بقاعدة البيانات.";
      checkResult.className = "status err";
    }
  });
}

// ========== تحميل أولي ==========
loadCapacities();
