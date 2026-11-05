const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = 'http://localhost:3099';
const TEST_DATE = '2099-01-15';
const TEST_MONTH = '2099-01';

// Helper: make API requests from the browser
async function browserRequest(driver, url, options = {}) {
    return await driver.executeAsyncScript(
        function (url, options, done) {
            fetch(url, options)
                .then(async response => {
                    done({
                        status: response.status,
                        body: await response.text(),
                        contentType: response.headers.get('content-type')
                    });
                })
                .catch(error => {
                    done({ error: error.message });
                });
        },
        url,
        options
    );
}

// Helper: wait for browser functions to finish
async function runBrowserFunction(driver, functionName) {
    return await driver.executeAsyncScript(
        function (name, done) {
            Promise.resolve(window[name]())
                .then(() => done({ success: true }))
                .catch(error => done({ error: error.message }));
        },
        functionName
    );
}

// Helper: find a monthly report row by roll number
async function findReportRow(driver, rollNo) {
    const rows = await driver.findElements(
        By.css('#report-tbody tr')
    );

    for (const row of rows) {
        const cells = await row.findElements(By.css('td'));

        if (cells.length > 0 &&
            (await cells[0].getText()).trim() === rollNo) {
            return row;
        }
    }

    return null;
}

async function runTestSuite() {
    let serverProcess;
    let driver;

    try {
        console.log('Starting application server for Selenium tests...');

        serverProcess = spawn(
            'node',
            [path.join(__dirname, '../server.js')],
            {
                env: { ...process.env, PORT: '3099' },
                stdio: 'inherit'
            }
        );

        await new Promise(resolve => setTimeout(resolve, 3000));

        const options = new chrome.Options();

        options.addArguments('--headless=new');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');

        if (process.env.CHROME_PATH) {
            options.setChromeBinaryPath(process.env.CHROME_PATH);
        }

        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();

        // TC-01: Attendance page displays registered students
        await driver.get(BASE_URL);

        await driver.wait(
            until.elementLocated(By.id('student-table')),
            10000
        );

        await driver.wait(
            until.elementLocated(By.css('#attendance-tbody tr')),
            10000
        );

        let studentRows = await driver.findElements(
            By.css('#attendance-tbody tr')
        );

        assert.ok(
            studentRows.length > 0,
            'Registered students should be displayed'
        );

        console.log('PASS [TC-01]: Registered students displayed.');

        // TC-04: Invalid student information is rejected
        const invalidStudent = await browserRequest(
            driver,
            `${BASE_URL}/api/students`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roll_no: '',
                    name: '',
                    department: ''
                })
            }
        );

        assert.strictEqual(
            invalidStudent.status,
            400,
            'Invalid student information should return HTTP 400'
        );

        assert.ok(
            invalidStudent.body.includes('required'),
            'Validation error should be returned'
        );

        console.log('PASS [TC-04]: Invalid student information rejected.');

        // Prepare isolated attendance test date
        await driver.executeScript(
            "document.getElementById('attendance-date').value = arguments[0];",
            TEST_DATE
        );

        const loadResult = await runBrowserFunction(
            driver,
            'loadAttendanceForDate'
        );

        assert.ok(
            loadResult.success,
            'Test attendance date should load'
        );

        // TC-02: Attendance can be marked for seven periods
        await driver.executeScript("window.markAll('P');");

        const firstPeriod = await driver.findElement(
            By.id('btn-101-p1')
        );

        await firstPeriod.click();

        assert.strictEqual(
            await firstPeriod.getText(),
            'A',
            'First period should change to Absent'
        );

        const periodButtons = await driver.findElements(
            By.css('#attendance-tbody tr:first-child button.period-btn')
        );

        assert.strictEqual(
            periodButtons.length,
            7,
            'Each student should have seven period buttons'
        );

        console.log('PASS [TC-02]: Seven periods and attendance marking verified.');

        // TC-03: Save attendance successfully
        await driver.executeScript(
            "document.getElementById('allow-correction-checkbox').checked = true;"
        );

        await driver.findElement(
            By.id('save-attendance-btn')
        ).click();

        const statusMessage = await driver.findElement(
            By.id('status-message')
        );

        await driver.wait(async () => {
            const message = await statusMessage.getText();
            return message.includes('successfully');
        }, 10000);

        console.log('PASS [TC-03]: Attendance saved successfully.');

        // TC-05: Duplicate attendance is prevented
        await driver.executeScript(
            "document.getElementById('allow-correction-checkbox').checked = false;"
        );

        await driver.findElement(
            By.id('save-attendance-btn')
        ).click();

        await driver.wait(async () => {
            const message = await statusMessage.getText();
            return message.includes('Duplicate entry prevented');
        }, 10000);

        console.log('PASS [TC-05]: Duplicate attendance prevented.');

        // Prepare monthly report
        await driver.executeScript(
            `
            document.getElementById('report-month').value = arguments[0];
            document.getElementById('threshold-input').value = '90';
            `,
            TEST_MONTH
        );

        const reportResult = await runBrowserFunction(
            driver,
            'generateMonthlyReport'
        );

        assert.ok(
            reportResult.success,
            'Monthly report should generate'
        );

        // TC-06: Monthly attendance totals
        const student101 = await findReportRow(driver, '101');

        assert.ok(
            student101,
            'Student 101 should appear in monthly report'
        );

        const workingPeriods = await student101.findElement(
            By.css('.work-periods')
        ).getText();

        const presentPeriods = await student101.findElement(
            By.css('.present-count')
        ).getText();

        const absentPeriods = await student101.findElement(
            By.css('.absent-count')
        ).getText();

        assert.strictEqual(workingPeriods.trim(), '7');
        assert.strictEqual(presentPeriods.trim(), '6');
        assert.strictEqual(absentPeriods.trim(), '1');

        console.log('PASS [TC-06]: Monthly attendance totals verified.');

        // TC-07: Attendance percentage
        const percentage = await student101.findElement(
            By.css('.att-percentage')
        ).getText();

        assert.strictEqual(
            percentage.trim(),
            '85.71%',
            'Student 101 attendance should be 85.71%'
        );

        console.log('PASS [TC-07]: Attendance percentage verified.');

        // TC-08: Below-threshold students identified
        const standing = await student101.findElement(
            By.css('.standing-status')
        ).getText();

        assert.strictEqual(
            standing.trim(),
            'Below Threshold',
            'Student 101 should be below the 90% threshold'
        );

        const lowAttendanceCount = await driver.findElement(
            By.id('kpi-below-threshold')
        ).getText();

        assert.strictEqual(
            lowAttendanceCount.trim(),
            '1',
            'Exactly one student should be below threshold'
        );

        console.log('PASS [TC-08]: Below-threshold student identified.');

        // TC-09: CSV report generation
        const exportButton = await driver.findElement(
            By.id('export-csv-btn')
        );

        assert.ok(
            await exportButton.isDisplayed(),
            'CSV export button should be visible'
        );

        const csvResult = await browserRequest(
            driver,
            `${BASE_URL}/api/reports/monthly/csv?month=${TEST_MONTH}&threshold=90`
        );

        assert.strictEqual(
            csvResult.status,
            200,
            'CSV endpoint should return HTTP 200'
        );

        assert.ok(
            csvResult.contentType.includes('text/csv'),
            'Response should have CSV content type'
        );

        assert.ok(
            csvResult.body.includes('Below Threshold'),
            'CSV should include below-threshold status'
        );

        console.log('PASS [TC-09]: Monthly CSV report generated.');

        // TC-10: Saved attendance persists after page reload
        await driver.navigate().refresh();

        await driver.wait(
            until.elementLocated(By.css('#attendance-tbody tr')),
            10000
        );

        await driver.executeScript(
            "document.getElementById('attendance-date').value = arguments[0];",
            TEST_DATE
        );

        const reloadResult = await runBrowserFunction(
            driver,
            'loadAttendanceForDate'
        );

        assert.ok(
            reloadResult.success,
            'Saved attendance date should reload'
        );

        const persistedButton = await driver.findElement(
            By.id('btn-101-p1')
        );

        assert.strictEqual(
            await persistedButton.getText(),
            'A',
            'Saved absent status should persist after reload'
        );

        console.log('PASS [TC-10]: Saved attendance persists after reload.');

        console.log('\\n========================================');
        console.log('ALL 10 SELENIUM TESTS PASSED SUCCESSFULLY!');
        console.log('========================================');

    } catch (error) {
        console.error('Test execution failed:', error);
        process.exitCode = 1;

    } finally {
        if (driver) {
            await driver.quit();
        }

        if (serverProcess) {
            serverProcess.kill();
        }
    }
}

runTestSuite();