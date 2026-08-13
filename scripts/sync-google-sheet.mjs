import { writeFile } from 'node:fs/promises';

const sheetId = process.env.GOOGLE_SHEET_ID ?? '14meJ30w8zSjaXZLTTVZgSclBcesfjr-7S6N4PgH5eHA';
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
const response = await fetch(url);
if (!response.ok) throw new Error(`Google Sheet request failed: ${response.status}`);

const csv = await response.text();
const lines = csv.trim().split(/\r?\n/).map((line) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((cell) => cell.replace(/^"|"$/g, '').trim()));
const headers = lines.shift().map((header) => header.replace(/\s+/g, ' '));
const get = (row, name) => row[headers.findIndex((header) => header === name)] ?? '';
const money = (value) => Number.parseFloat(value.replace(/[^\d.-]/g, '')) || 0;
const teams = lines.filter((row) => get(row, 'Team')).map((row) => ({
  rank: Number.parseInt(get(row, 'Final Standing'), 10),
  name: get(row, 'Team'),
  manager: get(row, 'Name'),
  record: get(row, 'Playoff') === 'Yes' ? 'Playoff' : 'Out',
  points: 0,
  transactionCount: Number.parseInt(get(row, 'Transactions'), 10) || 0,
  winnings: money(get(row, 'Winnings')),
  buyIn: money(get(row, 'Buy in')),
  transactionCost: money(get(row, 'TransactionCost')),
  finalPayout: money(get(row, 'Winnings')) - money(get(row, 'Buy in')) - money(get(row, 'TransactionCost'))
})).sort((a, b) => a.rank - b.rank);
const totalPot = teams.reduce((sum, team) => sum + team.winnings, 0);
const completedSeason = new Date().getFullYear() - 1;
const data = { season: completedSeason.toString(), week: 'Offseason', updatedAt: new Date().toISOString().slice(0, 10), buyIn: 20, transactionFee: 5, totalPot, teams, awards: [] };
await writeFile('src/data/league.json', `${JSON.stringify(data, null, 2)}\n`);
console.log(`Imported ${teams.length} teams and ${totalPot} in winnings.`);