const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'attendance.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log(`Connected to SQLite database at ${DB_PATH}`);
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS students (
        roll_no TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roll_no TEXT NOT NULL,
        date TEXT NOT NULL,
        period INTEGER NOT NULL CHECK(period BETWEEN 1 AND 7),
        status TEXT NOT NULL CHECK(status IN ('P', 'A')),
        UNIQUE(roll_no, date, period),
        FOREIGN KEY (roll_no) REFERENCES students(roll_no)
      )
    `);

    db.get('SELECT COUNT(*) AS count FROM students', (err, row) => {
      if (!err && row && row.count === 0) {
        const stmt = db.prepare('INSERT INTO students (roll_no, name, department) VALUES (?, ?, ?)');
        for (let i = 1; i <= 5; i++) {
          stmt.run(`10${i}`, `Student ${i}`, 'CSE (AI & ML)');
        }
        stmt.finalize();
      }
    });
  });
}

// Get all students
app.get('/api/students', (req, res) => {
  const { department } = req.query;
  let query = 'SELECT * FROM students ORDER BY roll_no ASC';
  const params = [];

  if (department) {
    query = 'SELECT * FROM students WHERE department = ? ORDER BY roll_no ASC';
    params.push(department);
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add new student
app.post('/api/students', (req, res) => {
  const { roll_no, name, department } = req.body;
  if (!roll_no || !name || !department || !roll_no.trim() || !name.trim() || !department.trim()) {
    return res.status(400).json({ error: 'Roll number, student name, and department are required.' });
  }

  const sql = 'INSERT INTO students (roll_no, name, department) VALUES (?, ?, ?)';
  db.run(sql, [roll_no.trim(), name.trim(), department.trim()], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: `Roll No ${roll_no.trim()} already exists! Use a new number (like 106) or click Edit in the table.` });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ message: `Student ${name.trim()} (${roll_no.trim()}) added successfully!`, roll_no: roll_no.trim() });
  });
});

// Edit student details
app.put('/api/students/:roll_no', (req, res) => {
  const { roll_no } = req.params;
  const { name, department } = req.body;
  if (!name || !department || !name.trim() || !department.trim()) {
    return res.status(400).json({ error: 'Name and department are required.' });
  }

  db.run(
    'UPDATE students SET name = ?, department = ? WHERE roll_no = ?',
    [name.trim(), department.trim(), roll_no],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Student not found.' });
      res.json({ message: `Student ${roll_no} updated to ${name.trim()} successfully!` });
    }
  );
});

// Retrieve attendance for a specific date
app.get('/api/attendance', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date parameter is required.' });

  db.all('SELECT roll_no, period, status FROM attendance WHERE date = ?', [date], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const recordsByStudent = {};
    rows.forEach((r) => {
      if (!recordsByStudent[r.roll_no]) recordsByStudent[r.roll_no] = {};
      recordsByStudent[r.roll_no][`p${r.period}`] = r.status;
    });

    res.json({
      date,
      exists: rows.length > 0,
      records: recordsByStudent
    });
  });
});

// Save Daily Attendance
app.post('/api/attendance', (req, res) => {
  const { date, records, allowCorrection } = req.body;

  if (!date || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Valid date and attendance records are required.' });
  }

  db.get('SELECT COUNT(*) AS count FROM attendance WHERE date = ?', [date], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row.count > 0 && !allowCorrection) {
      return res.status(409).json({
        error: 'Duplicate entry prevented: Attendance for this date already exists. Check "Authorize Correction" below to update.'
      });
    }

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      const stmt = db.prepare(`
        INSERT INTO attendance (roll_no, date, period, status)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(roll_no, date, period)
        DO UPDATE SET status = excluded.status
      `);

      for (const studentRecord of records) {
        const { roll_no, periods } = studentRecord;
        for (let p = 1; p <= 7; p++) {
          const status = periods[`p${p}`] === 'A' ? 'A' : 'P';
          stmt.run(roll_no, date, p, status);
        }
      }

      stmt.finalize((finalizeErr) => {
        if (finalizeErr) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: finalizeErr.message });
        }
        db.run('COMMIT', (commitErr) => {
          if (commitErr) return res.status(500).json({ error: commitErr.message });
          res.status(200).json({
            message: row.count > 0
              ? 'Attendance records updated successfully.'
              : 'Attendance saved successfully.'
          });
        });
      });
    });
  });
});

function calculateMonthlySummary(month, threshold, rollNoFilter, callback) {
  let studentQuery = 'SELECT * FROM students ORDER BY roll_no ASC';
  const studentParams = [];

  if (rollNoFilter) {
    studentQuery = 'SELECT * FROM students WHERE roll_no = ? ORDER BY roll_no ASC';
    studentParams.push(rollNoFilter);
  }

  db.all(studentQuery, studentParams, (err, students) => {
    if (err) return callback(err);

    db.all(
      'SELECT roll_no, date, period, status FROM attendance WHERE date LIKE ?',
      [`${month}-%`],
      (attErr, attRows) => {
        if (attErr) return callback(attErr);

        const summary = students.map((st) => {
          const studentRecords = attRows.filter((r) => r.roll_no === st.roll_no);
          const workingPeriods = studentRecords.length;
          const present = studentRecords.filter((r) => r.status === 'P').length;
          const absent = studentRecords.filter((r) => r.status === 'A').length;
          const percentage = workingPeriods > 0
            ? Number(((present / workingPeriods) * 100).toFixed(2))
            : 0.0;

          return {
            roll_no: st.roll_no,
            name: st.name,
            department: st.department,
            working_periods: workingPeriods,
            present,
            absent,
            percentage,
            below_threshold: percentage < threshold
          };
        });

        callback(null, summary);
      }
    );
  });
}

app.get('/api/reports/monthly', (req, res) => {
  const month = req.query.month;
  const threshold = parseFloat(req.query.threshold || '75');
  const roll_no = req.query.roll_no || null;

  if (!month) return res.status(400).json({ error: 'Month parameter (YYYY-MM) is required.' });

  calculateMonthlySummary(month, threshold, roll_no, (err, summary) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      month,
      threshold,
      students: summary,
      low_attendance_students: summary.filter((s) => s.below_threshold)
    });
  });
});

app.get('/api/reports/monthly/csv', (req, res) => {
  const month = req.query.month;
  const threshold = parseFloat(req.query.threshold || '75');
  const roll_no = req.query.roll_no || null;

  if (!month) return res.status(400).send('Month parameter (YYYY-MM) is required.');

  calculateMonthlySummary(month, threshold, roll_no, (err, summary) => {
    if (err) return res.status(500).send(err.message);

    const headers = ['Roll No.', 'Student', 'Department', 'Working periods', 'Present', 'Absent', 'Attendance', 'Status'];
    const rows = summary.map((s) => [
      s.roll_no,
      `"${s.name}"`,
      `"${s.department}"`,
      s.working_periods,
      s.present,
      s.absent,
      `${s.percentage.toFixed(2)}%`,
      s.below_threshold ? 'Below Threshold' : 'Normal'
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_report_${month}.csv"`);
    res.status(200).send(csvContent);
  });
});

// Seed 22 Working Days (154 Periods) matching PDF Sample Monthly Report
app.post('/api/seed-demo', (req, res) => {
  const month = req.body.month || '2026-10';
  const targets = {
    '101': 140,
    '102': 130,
    '103': 115,
    '104': 150,
    '105': 145
  };

  db.all('SELECT roll_no FROM students', (err, students) => {
    if (err) return res.status(500).json({ error: err.message });

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      db.run('DELETE FROM attendance WHERE date LIKE ?', [`${month}-%`]);

      const stmt = db.prepare('INSERT INTO attendance (roll_no, date, period, status) VALUES (?, ?, ?, ?)');

      students.forEach((st) => {
        const targetPresent = targets[st.roll_no] !== undefined ? targets[st.roll_no] : 140;
        let presentSoFar = 0;

        for (let day = 1; day <= 22; day++) {
          const dateStr = `${month}-${String(day).padStart(2, '0')}`;
          for (let p = 1; p <= 7; p++) {
            const status = presentSoFar < targetPresent ? 'P' : 'A';
            if (status === 'P') presentSoFar++;
            stmt.run(st.roll_no, dateStr, p, status);
          }
        }
      });

      stmt.finalize(() => {
        db.run('COMMIT', (commitErr) => {
          if (commitErr) return res.status(500).json({ error: commitErr.message });
          res.json({ message: `Loaded 22 working days (154 periods) for ${month} matching the PDF specification!` });
        });
      });
    });
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Student Attendance Server running at http://localhost:${PORT}`);
  });
}

module.exports = { app, db };