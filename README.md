# MyFitnessPal Google Sheet importer

## Setup

1. Clone this repository
2. Log into myfitnesspal.com
3. Copy the value of `__Secure-next-auth.session-token` and replace `MFP_COOKIE` in `docker-compose.yml` with it
4. Create a Google Cloud project with [Google Sheets API](https://console.cloud.google.com/apis/api/sheets.googleapis.com/metrics) access enabled
5. Under `Credentials`, create an `OAuth client ID`
6. Download the OAuth client credentials file and replace `GCP_CREDENTIALS` in `docker-compose.yml` with the contents of it
7. Open any Google Sheet you want the data to be imported to
8. Copy the part of the URL between `https://docs.google.com/spreadsheets/d/` and the next `/` and replace `GOOGLE_SHEET_ID` in `docker-compose.yml` with it
9. Run `docker compose up`

## Common issues

### The API returns `Invalid request received: Missing HTTP header: Authorization"`
This is a misdirection: The API requires no `Authorization` header. The session cookie you previously used has expired (or is invalid). Follow steps 2-3 of the setup guide and restart the app.
