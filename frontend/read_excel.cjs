const XLSX = require('xlsx');

const workbook = XLSX.readFile('lochido_limpio.xlsx');
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];
const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

if (rawJson.length > 0) {
  console.log("Headers found in first row:");
  console.log(Object.keys(rawJson[0]));
  console.log("\nFirst row data:");
  console.log(rawJson[0]);
} else {
  console.log("File is empty.");
}
