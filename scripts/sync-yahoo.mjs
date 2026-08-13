import { mkdir, readFile, writeFile } from 'node:fs/promises';

const token = process.env.YAHOO_ACCESS_TOKEN;
const leagueKey = process.env.YAHOO_LEAGUE_KEY;
if (!token || !leagueKey) throw new Error('Set YAHOO_ACCESS_TOKEN and YAHOO_LEAGUE_KEY before running this script.');

const response = await fetch(`https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/standings`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' }
});
if (!response.ok) throw new Error(`Yahoo request failed: ${response.status} ${response.statusText}`);
const xml = await response.text();
const teams = [...xml.matchAll(/<team>([\s\S]*?)<\/team>/g)].map((match) => {
  const value = (tag) => match[1].match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? '';
  return { name: value('name'), rank: Number(value('rank')), wins: Number(value('wins')), losses: Number(value('losses')), pointsFor: Number(value('points_for')) };
});
const league = JSON.parse(await readFile('src/data/league.json', 'utf8'));
const existingTeams = new Map(league.teams.map((team) => [team.name, team]));
league.season = xml.match(/<season>(\d{4})<\/season>/)?.[1] ?? league.season;
league.updatedAt = new Date().toISOString().slice(0, 10);
league.source = 'Yahoo Fantasy API';
league.teams = teams.sort((a, b) => a.rank - b.rank).map((team) => {
  const existing = existingTeams.get(team.name) ?? {};
  const transactionCount = existing.transactionCount ?? 0;
  const buyIn = existing.buyIn ?? league.buyIn;
  const transactionCost = transactionCount * league.transactionFee;
  const winnings = existing.winnings ?? 0;
  return { ...existing, ...team, record: 'Active', points: team.pointsFor, transactionCount, buyIn, transactionCost, winnings, finalPayout: winnings - buyIn - transactionCost };
});
await mkdir('src/data', { recursive: true });
await writeFile('src/data/yahoo.json', `${JSON.stringify({ fetchedAt: new Date().toISOString(), leagueKey, teams }, null, 2)}\n`);
await writeFile('src/data/league.json', `${JSON.stringify(league, null, 2)}\n`);
console.log(`Imported Yahoo standings for ${teams.length} teams.`);