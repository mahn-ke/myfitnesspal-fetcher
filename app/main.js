import { google } from 'googleapis';
import cron from 'node-cron';

// Login and get session cookie  
async function getSessionCookie() {  
	return process.env.MFP_COOKIE;
}

function formatMFPDate(dateWithoutLeadingZeroes) {
    dateWithoutLeadingZeroes = typeof dateWithoutLeadingZeroes === 'object' ? dateWithoutLeadingZeroes.date : dateWithoutLeadingZeroes;
    const [year, month, day] = dateWithoutLeadingZeroes.replace(/-/g, '/').split('/');
    const mm = month.padStart(2, '0');
    const dd = day.padStart(2, '0');
    return `${mm}/${dd}/${year}`;
}

function formatGoogleDate(dateWithoutLeadingZeroes) {
	if (/[a-zA-Z]/.test(dateWithoutLeadingZeroes)) {
		return dateWithoutLeadingZeroes;
	}
    dateWithoutLeadingZeroes = typeof dateWithoutLeadingZeroes === 'object' ? dateWithoutLeadingZeroes.date : dateWithoutLeadingZeroes;
    const [month, day, year] = dateWithoutLeadingZeroes.replace(/-/g, '/').split('/');
    const mm = month.padStart(2, '0');
    const dd = day.padStart(2, '0');
    return `${mm}/${dd}/${year}`;
}

// Fetch check-in history  
async function fetchCheckinHistory(sessionCookieValue) {  
	const reportUrl = 'https://www.myfitnesspal.com/api/services/diary/report';
	const today = new Date();
	const lastYear = new Date(today);
	lastYear.setFullYear(today.getFullYear() - 1);

	const from = lastYear.toISOString().split('T')[0];
	const to = today.toISOString().split('T')[0];

	try {
		const response = await fetch(reportUrl, {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json',
				'Cookie': "__Secure-next-auth.session-token="+sessionCookieValue
			},
			body: JSON.stringify({
				username: "Cynamiter",
				show_food_diary: 1,
				show_exercise_diary: 1,
				show_food_notes: 0,
				show_exercise_notes: 0,
				from,
				to
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch diary report with status ${response.status}: ${await response.text()}`);
		}

		const data = await response.json();
		// Ensure all dates are in MM/DD/YYYY format with leading zeroes
		return data;
	} catch (error) {
		console.error('Error fetching diary report:', error);
		throw error;
	}
}

// Google Sheets API setup
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB_NAME = 'Calories';
async function awaitSetInSheet(summaries) {
	if (!process.env.GCP_CREDENTIALS) {
		throw new Error('GCP_CREDENTIALS environment variable not set.');
	}
	const credentials = JSON.parse(process.env.GCP_CREDENTIALS);

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    // Get all dates in column A
    const range = `${TAB_NAME}!A:B`;
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range,
    });
    // Prepare new dates to append
	// Map existing dates to their row numbers and kcal values
	const existingRows = {};
	(res.data.values || []).forEach((row, idx) => {
		const date = formatGoogleDate(row[0]?.trim());
		console.log(`Row ID ${idx + 1} for date ${date}: Raw data ${row[1]}, Converted ${Number(row[1] || 0)}`);
		const kcal = Number(row[1]) || 0;
		if (date) existingRows[date] = { row: idx + 1, kcal };
	});

	const newDates = [];
	const updates = [];

	summaries.forEach(data => {
		const date = data.date;
		if (!existingRows[date]) {
			newDates.push([date, data.kcal, data.carbs, data.fats, data.protein]);
		} else if (Math.round(data.kcal) > Math.round(existingRows[date].kcal)) {
			updates.push({
				range: `${TAB_NAME}!B${existingRows[date].row}:E${existingRows[date].row}`,
				values: [[data.kcal, data.carbs, data.fats, data.protein]]
			});
		}
	});

	// Append new dates
	if (newDates.length > 0) {
		await sheets.spreadsheets.values.append({
			spreadsheetId: SHEET_ID,
			range,
			valueInputOption: 'USER_ENTERED',
			insertDataOption: 'INSERT_ROWS',
			resource: { values: newDates },
		});
		console.log(`Added ${newDates.length} new date(s) to the sheet.`);
	} else {
		console.log('No new dates to add.');
	}

	// Batch update existing rows if kcal is larger
	console.log(`Updating ${updates.length} existing date(s) with higher kcal`);
	if (updates.length > 0) {
		await sheets.spreadsheets.values.batchUpdate({
			spreadsheetId: SHEET_ID,
			resource: {
				data: updates,
				valueInputOption: 'USER_ENTERED'
			}
		});
	}
}

const task = cron.schedule('0 0 * * *', runJob);

async function runJob() {
	try {  
		const sessionCookieValue = await getSessionCookie();  
		const checkinHistory = await fetchCheckinHistory(sessionCookieValue);
		const summaries = checkinHistory.map(entry => {
			const foodEntries = entry.food_entries || [];
			const summary = foodEntries.reduce(
				(acc, food) => {
					const n = food.nutritional_contents || {};
					acc.kcal += n.energy?.value || 0;
					acc.carbs += n.carbohydrates || 0;
					acc.fats += n.fat || 0;
					acc.protein += n.protein || 0;
					return acc;
				},
				{ kcal: 0, carbs: 0, fats: 0, protein: 0 }
			);
			return {
				date: formatMFPDate(entry.date),
				kcal: summary.kcal,
				carbs: summary.carbs,
				fats: summary.fats,
				protein: summary.protein
			};
		});
		console.log(summaries);
		await awaitSetInSheet(summaries);

		console.log("Next run at: " + task.getNextRun());

	} catch (error) {  
		console.error('An error occurred:', error);  
	}  
}

console.log(`Running at startup: '${process.env.RUN_AT_STARTUP?.toLowerCase() === 'true'}'`);
if (process.env.RUN_AT_STARTUP?.toLowerCase() === 'true') {
	runJob();
}

console.log('Scheduled job to run every 24 hours.');
