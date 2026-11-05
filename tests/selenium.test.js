const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_PORT = 3099;
const TEST_DB = path.join(__dirname, 'test_attendance.db');
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess = null;

function startServer() {
  return new Promise((resolve) => {
    serverProcess = spawn('node', ['server.js'], {
      env: { ...process.env, PORT: TEST_PORT, DB_PATH: TEST_DB },
      cwd: path.join(__dirname, '..')
    });
    serverProcess.stdout.on('data', (data) => {
      if (data.toString().includes('running at')) resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      serverProcess.on('close', () => resolve());
      serverProcess.kill();
    } else {
      resolve();
    }
  });
}

(async function runTestSuite() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  console.log('Starting application server for Selenium tests...');
  await startServer();

  const options = new chrome.Options();
  options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900');

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    await driver.get(BASE_URL);

    // Test Case 1: Verify that the attendance page displays all registered students
    await driver.wait(until.elementsLocated(By.css('#attendance-tbody tr')), 5000);
    const studentRows = await driver.findElements(By.css('#attendance-tbody tr'));
    assert.strictEqual(studentRows.length, 5, 'Should display 5 seeded registered students (101-105)');
    console.log('PASS [TC-01]: Attendance page displays all registered students.');

    // Test Case 2: Verify that attendance can be marked for all seven periods
    for (let p = 1; p <= 7; p++) {
      const btn = await driver.findElement(By.id(`btn-103-p${p}`));
      await btn.click(); // Toggle Student 103 from P to A across all 7 periods
      const text = await btn.getText();
      assert.strictEqual(text, 'A', `Period ${p} for Roll 103 should be marked Absent`);
    }
    console.log('PASS [TC-02]: Attendance marked across all seven periods.');

    // Test Case 3: Verify that attendance is saved successfully for a selected date
    const dateInput = await driver.findElement(By.id('attendance-date'));
    await driver.executeScript("arguments[0].value = '2026-10-14';", dateInput);
    await driver.findElement(By.id('save-attendance-btn')).click();

    const banner = await driver.wait(until.elementLocated(By.id('status-message')), 5000);
    await driver.wait(until.elementIsVisible(banner), 5000);
    const saveMsg = await banner.getText();
    assert(saveMsg.includes('saved successfully'), 'Attendance should save for 2026-10-14');
    console.log('PASS [TC-03]: Attendance saved successfully for selected date.');

    // Test Case 4: Verify that missing or invalid student information is handled correctly
    await driver.findElement(By.id('student-roll')). clear();
    await driver.findElement(By.id('student-name')).clear();
    await driver.findElement(By.id('save-student-btn')).click();
    await driver.sleep(300);
    const invalidMsg = await driver.findElement(By.id('status-message')).getText();
    assert(invalidMsg.includes('required'), 'Should reject empty student fields');
    console.log('PASS [TC-04]: Missing/invalid student information handled properly.');

    // Test Case 5: Verify that duplicate attendance entries are prevented
    await driver.findElement(By.id('save-attendance-btn')).click();
    await driver.sleep(300);
    const dupMsg = await driver.findElement(By.id('status-message')).getText();
    assert(dupMsg.includes('Duplicate entry prevented'), 'Duplicate date entry should be blocked unless authorized');
    console.log('PASS [TC-05]: Duplicate attendance entries prevented.');

    // Test Case 6: Verify that monthly attendance totals are calculated correctly
    const monthInput = await driver.findElement(By.id('report-month'));
    await driver.executeScript("arguments[0].value = '2026-10';", monthInput);
    await driver.findElement(By.id('generate-report-btn')).click();
    await driver.sleep(400);

    const reportRows = await driver.findElements(By.css('#report-tbody tr'));
    const firstRowWorkPeriods = await reportRows[0].findElement(By.css('.work-periods')).getText();
    const firstRowPresent = await reportRows[0].findElement(By.css('.present-count')).getText();
    assert.strictEqual(firstRowWorkPeriods, '7', 'Working periods should equal 7');
    assert.strictEqual(firstRowPresent, '7', 'Student 101 present count should equal 7');
    console.log('PASS [TC-06]: Monthly attendance totals calculated accurately.');

    // Test Case 7: Verify that the attendance percentage is displayed correctly
    const firstRowPct = await reportRows[0].findElement(By.css('.att-percentage')).getText();
    const thirdRowPct = await reportRows[2].findElement(By.css('.att-percentage')).getText();
    assert.strictEqual(firstRowPct, '100.00%', 'Student 101 percentage should be 100.00%');
    assert.strictEqual(thirdRowPct, '0.00%', 'Student 103 percentage should be 0.00%');
    console.log('PASS [TC-07]: Attendance percentage displayed accurately.');

    // Test Case 8: Verify that students below the configured attendance threshold are identified
    const thirdRowClass = await reportRows[2].getAttribute('class');
    const thirdRowStanding = await reportRows[2].findElement(By.css('.standing-status')).getText();
    assert(thirdRowClass.includes('low-attendance-row'), 'Student 103 should have low-attendance highlight class');
    assert.strictEqual(thirdRowStanding, 'Below Threshold', 'Student 103 should be flagged as Below Threshold');
    console.log('PASS [TC-08]: Students below attendance threshold identified.');

    // Test Case 9: Verify that the monthly report can be generated and exported
    const csvResponse = await driver.executeAsyncScript(`
      const callback = arguments[arguments.length - 1];
      fetch('/api/reports/monthly/csv?month=2026-10&threshold=75')
        .then(res => res.text())
        .then(text => callback(text));
    `);
    assert(csvResponse.includes('Roll No.,Student,Department,Working periods,Present,Absent,Attendance'), 'CSV header must be present');
    assert(csvResponse.includes('101,"Student 1"'), 'CSV must contain student data');
    console.log('PASS [TC-09]: Monthly report generated and exported as CSV.');

    // Test Case 10: Verify that saved records remain available after the application is restarted
    await stopServer();
    await startServer();
    await driver.get(BASE_URL);
    const reloadedDateInput = await driver.findElement(By.id('attendance-date'));
    await driver.executeScript("arguments[0].value = '2026-10-14';", reloadedDateInput);
    await driver.findElement(By.id('load-date-btn')).click();
    await driver.sleep(400);

    const persistedBtn = await driver.findElement(By.id('btn-103-p1'));
    const persistedStatus = await persistedBtn.getText();
    assert.strictEqual(persistedStatus, 'A', 'Saved attendance status (A) must persist after server restart');
    console.log('PASS [TC-10]: Saved records remain available after application restart.');

    console.log('\nAll 10 Selenium WebDriver test cases passed!');
  } finally {
    await driver.quit();
    await stopServer();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  }
})();