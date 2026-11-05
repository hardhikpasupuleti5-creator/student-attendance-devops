let studentsList = [];
let currentAttendance = {}; // { roll_no: { p1: 'P', ..., p7: 'P' } }
let editModeRollNo = null;

const dateInput = document.getElementById('attendance-date');
const monthInput = document.getElementById('report-month');
const statusBanner = document.getElementById('status-message');

const todayStr = new Date().toISOString().split('T')[0];
dateInput.value = todayStr;
monthInput.value = todayStr.slice(0, 7);

function showMessage(text, type = 'success') {
  statusBanner.textContent = text;
  statusBanner.className = `status-banner ${type}`;
  statusBanner.classList.remove('hidden');
}

function updateDailyKPIs() {
  document.getElementById('kpi-total-students').textContent = studentsList.length;
  let totalPresent = 0;
  studentsList.forEach((st) => {
    const periods = currentAttendance[st.roll_no] || {};
    for (let p = 1; p <= 7; p++) {
      if (periods[`p${p}`] === 'P') totalPresent++;
    }
  });
  document.getElementById('kpi-daily-present').textContent = `${totalPresent} / ${studentsList.length * 7}`;
}

async function fetchStudents() {
  const res = await fetch('/api/students');
  studentsList = await res.json();
  await loadAttendanceForDate(dateInput.value);
}

async function loadAttendanceForDate(date) {
  const res = await fetch(`/api/attendance?date=${encodeURIComponent(date)}`);
  const data = await res.json();

  currentAttendance = {};
  studentsList.forEach((st) => {
    currentAttendance[st.roll_no] = {};
    for (let p = 1; p <= 7; p++) {
      currentAttendance[st.roll_no][`p${p}`] =
        (data.records && data.records[st.roll_no] && data.records[st.roll_no][`p${p}`]) || 'P';
    }
  });

  renderAttendanceTable();
  updateDailyKPIs();
}

function renderAttendanceTable() {
  const tbody = document.getElementById('attendance-tbody');
  tbody.innerHTML = '';

  studentsList.forEach((student) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-roll', student.roll_no);

    let presentCount = 0;
    let periodCells = '';
    for (let p = 1; p <= 7; p++) {
      const status = currentAttendance[student.roll_no][`p${p}`] || 'P';
      if (status === 'P') presentCount++;
      periodCells += `
        <td>
          <button
            type="button"
            class="period-btn ${status}"
            id="btn-${student.roll_no}-p${p}"
            onclick="togglePeriod('${student.roll_no}', ${p})"
          >${status}</button>
        </td>
      `;
    }

    tr.innerHTML = `
      <td class="roll-cell"><span class="roll-badge">${student.roll_no}</span></td>
      <td class="name-cell text-left"><strong>${student.name}</strong></td>
      <td class="dept-cell"><span class="dept-pill">${student.department}</span></td>
      ${periodCells}
      <td><span class="daily-pill" id="summary-${student.roll_no}">${presentCount}/7 P</span></td>
      <td>
        <button type="button" class="btn secondary" onclick="startEditStudent('${student.roll_no}')">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.togglePeriod = function (rollNo, periodIndex) {
  const key = `p${periodIndex}`;
  const current = currentAttendance[rollNo][key];
  const next = current === 'P' ? 'A' : 'P';
  currentAttendance[rollNo][key] = next;

  const btn = document.getElementById(`btn-${rollNo}-p${periodIndex}`);
  if (btn) {
    btn.textContent = next;
    btn.className = `period-btn ${next}`;
  }

  let presentCount = 0;
  for (let p = 1; p <= 7; p++) {
    if (currentAttendance[rollNo][`p${p}`] === 'P') presentCount++;
  }
  const summaryEl = document.getElementById(`summary-${rollNo}`);
  if (summaryEl) summaryEl.textContent = `${presentCount}/7 P`;

  updateDailyKPIs();
};

document.getElementById('mark-all-present-btn').addEventListener('click', () => {
  studentsList.forEach((st) => {
    for (let p = 1; p <= 7; p++) currentAttendance[st.roll_no][`p${p}`] = 'P';
  });
  renderAttendanceTable();
  updateDailyKPIs();
});

document.getElementById('mark-all-absent-btn').addEventListener('click', () => {
  studentsList.forEach((st) => {
    for (let p = 1; p <= 7; p++) currentAttendance[st.roll_no][`p${p}`] = 'A';
  });
  renderAttendanceTable();
  updateDailyKPIs();
});

document.getElementById('load-date-btn').addEventListener('click', () => {
  loadAttendanceForDate(dateInput.value);
});

document.getElementById('save-attendance-btn').addEventListener('click', async () => {
  const date = dateInput.value;
  const allowCorrection = document.getElementById('allow-correction-checkbox').checked;

  const records = studentsList.map((st) => ({
    roll_no: st.roll_no,
    periods: currentAttendance[st.roll_no]
  }));

  const res = await fetch('/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, records, allowCorrection })
  });

  const result = await res.json();
  if (res.ok) {
    showMessage(result.message, 'success');
    await generateMonthlyReport();
  } else {
    showMessage(result.error, 'error');
  }
});

window.startEditStudent = function (rollNo) {
  const student = studentsList.find((s) => s.roll_no === rollNo);
  if (!student) return;

  editModeRollNo = rollNo;
  const rollInput = document.getElementById('student-roll');
  rollInput.value = student.roll_no;
  rollInput.disabled = true;
  document.getElementById('student-name').value = student.name;
  document.getElementById('student-dept').value = student.department;
  document.getElementById('save-student-btn').textContent = 'Update Student';
  document.getElementById('cancel-edit-btn').classList.remove('hidden');
  document.getElementById('student-name').focus();
};

document.getElementById('cancel-edit-btn').addEventListener('click', () => {
  editModeRollNo = null;
  document.getElementById('student-roll').disabled = false;
  document.getElementById('student-form').reset();
  document.getElementById('save-student-btn').textContent = '+ Add Student';
  document.getElementById('cancel-edit-btn').classList.add('hidden');
});

document.getElementById('student-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const roll_no = document.getElementById('student-roll').value.trim();
  const name = document.getElementById('student-name').value.trim();
  const department = document.getElementById('student-dept').value.trim();

  let res;
  if (editModeRollNo) {
    res = await fetch(`/api/students/${encodeURIComponent(editModeRollNo)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, department })
    });
  } else {
    res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roll_no, name, department })
    });
  }

  const data = await res.json();
  if (res.ok) {
    showMessage(data.message, 'success');
    document.getElementById('cancel-edit-btn').click();
    await fetchStudents();
    await generateMonthlyReport();
  } else {
    showMessage(data.error, 'error');
  }
});

async function generateMonthlyReport() {
  const month = monthInput.value;
  const threshold = document.getElementById('threshold-input').value || 75;
  const rollFilter = document.getElementById('filter-roll-input').value.trim();

  let url = `/api/reports/monthly?month=${encodeURIComponent(month)}&threshold=${encodeURIComponent(threshold)}`;
  if (rollFilter) url += `&roll_no=${encodeURIComponent(rollFilter)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    showMessage(data.error, 'error');
    return;
  }

  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = '';

  let sumPct = 0;
  data.students.forEach((st) => {
    sumPct += st.percentage;
    const tr = document.createElement('tr');
    if (st.below_threshold) tr.classList.add('low-attendance-row');

    const barClass = st.below_threshold ? 'low' : 'good';
    const pillClass = st.below_threshold ? 'low' : 'ok';

    tr.innerHTML = `
      <td><span class="roll-badge">${st.roll_no}</span></td>
      <td class="text-left"><strong>${st.name}</strong></td>
      <td class="work-periods">${st.working_periods}</td>
      <td class="present-count text-success"><strong>${st.present}</strong></td>
      <td class="absent-count text-danger"><strong>${st.absent}</strong></td>
      <td>
        <div class="pct-wrap">
          <div class="progress-track">
            <div class="progress-fill ${barClass}" style="width: ${Math.min(100, st.percentage)}%"></div>
          </div>
          <span class="att-percentage"><strong>${st.percentage.toFixed(2)}%</strong></span>
        </div>
      </td>
      <td>
        <span class="status-pill ${pillClass} standing-status">${st.below_threshold ? 'Below Threshold' : 'Satisfactory'}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const avg = data.students.length > 0 ? (sumPct / data.students.length).toFixed(2) : '0.00';
  document.getElementById('kpi-monthly-avg').textContent = `${avg}%`;
  document.getElementById('kpi-below-threshold').textContent = data.low_attendance_students.length;
}

document.getElementById('generate-report-btn').addEventListener('click', generateMonthlyReport);

document.getElementById('export-csv-btn').addEventListener('click', () => {
  const month = monthInput.value;
  const threshold = document.getElementById('threshold-input').value || 75;
  const rollFilter = document.getElementById('filter-roll-input').value.trim();

  let url = `/api/reports/monthly/csv?month=${encodeURIComponent(month)}&threshold=${encodeURIComponent(threshold)}`;
  if (rollFilter) url += `&roll_no=${encodeURIComponent(rollFilter)}`;
  window.location.href = url;
});

// 1-Click 22-Day Demo Data Seeder (Matches Page 4 of PDF)
const seedBtn = document.getElementById('seed-demo-btn');
if (seedBtn) {
  seedBtn.addEventListener('click', async () => {
    const month = monthInput.value || '2026-10';
    const res = await fetch('/api/seed-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month })
    });
    const data = await res.json();
    if (res.ok) {
      dateInput.value = `${month}-14`;
      showMessage(data.message, 'success');
      await fetchStudents();
      await generateMonthlyReport();
    } else {
      showMessage(data.error, 'error');
    }
  });
}

fetchStudents().then(generateMonthlyReport);